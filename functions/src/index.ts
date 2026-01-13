import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { createHash, randomBytes } from "crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  computeAllocationDecisionForBooking,
  writeAllocationDecisionLogForBooking,
} from "./allocation";
import { decideAllocation } from "./reservations/allocationEngine";
import { writeAllocationAuditLog } from "./reservations/allocationLogService";
import { readAllocationOverrideTx } from "./reservations/allocationOverrideService";
import { applyCapacityLedgerTx, countsTowardCapacity } from "./reservations/capacityLedgerService";
import { normalizeTable, normalizeZone } from "./allocation/normalize";
import type { FloorplanTable, FloorplanZone } from "./allocation/types";

// 🔹 Firebase Admin init – EGYSZER, LEGELŐL
admin.initializeApp();

// 🔹 Itt definiáljuk, és CSAK EZT használjuk mindenhol
const db = getFirestore();
const REGION = "europe-west3";

const EMAIL_GATEWAY_URL =
  process.env.EMAIL_GATEWAY_URL ||
  "https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send";

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const generateAdminActionToken = () =>
  `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const hashAdminActionToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const generateManageToken = () => randomBytes(24).toString("base64url");

const hashManageToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MIN_HEADCOUNT = 1;
const MAX_HEADCOUNT = 30;
const EMAIL_QUEUE_LOCK_TTL_MS = 2 * 60 * 1000;
const EMAIL_QUEUE_MAX_ATTEMPTS = 6;
const EMAIL_QUEUE_BASE_BACKOFF_MS = 15_000;
const EMAIL_QUEUE_MAX_BACKOFF_MS = 10 * 60 * 1000;
type SeatingPreference = 'any' | 'bar' | 'table' | 'outdoor';

interface AllocationIntent {
  zoneId?: string | null;
  tableGroup?: string | null;
  timeSlot?: string | null;
}

interface AllocationDiagnostics {
  intentQuality: 'none' | 'weak' | 'good';
  reasons: string[];
  warnings: string[];
  matchedZoneId?: string | null;
}

interface AllocationOverride {
  enabled: boolean;
  timeSlot?: string | null;
  zoneId?: string | null;
  tableGroup?: string | null;
  tableIds?: string[] | null;
  note?: string | null;
}

interface AllocationFinal {
  source: 'intent' | 'override';
  timeSlot?: string | null;
  zoneId?: string | null;
  tableGroup?: string | null;
  tableIds?: string[] | null;
  locked?: boolean | null;
}

const CAPACITY_KEY_SAFE_PATTERN = /^[a-zA-Z0-9:_\- ]+$/;

const normalizePreferredTimeSlot = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const capped = trimmed.slice(0, 64);
  if (!CAPACITY_KEY_SAFE_PATTERN.test(capped)) return null;
  return capped;
};

const normalizeCapacityKey = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const capped = trimmed.slice(0, 64);
  if (!CAPACITY_KEY_SAFE_PATTERN.test(capped)) return null;
  return capped;
};

const TIMEZONE_SEMANTICS = 'local';
// Keep time-slot calculation aligned with toDateKey() which uses local date parts.
const computeCapacityTimeSlot = (date: Date) => {
  const hour = date.getHours();
  let slot: string | null = null;
  if (hour >= 0 && hour < 6) {
    slot = 'night';
  } else if (hour >= 6 && hour < 12) {
    slot = 'morning';
  } else if (hour >= 12 && hour < 18) {
    slot = 'afternoon';
  } else if (hour >= 18 && hour < 24) {
    slot = 'evening';
  }
  return normalizePreferredTimeSlot(slot);
};

const formatTimeForLog = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const dateKeyOf = (date: Date) => toDateKey(date);

const formatLogDateTime = (date: Date, dateKey: string) =>
  `${dateKey} ${formatTimeForLog(date)}${dateKeyOf(date) !== dateKey ? '(!)' : ''}`;

const clampAdd = (value: number, delta: number) => Math.max(0, value + delta);

const pruneZeroEntries = (map: Record<string, number> | undefined) => {
  if (!map) return undefined;
  const pruned = Object.fromEntries(
    Object.entries(map).filter(([, value]) => value !== 0)
  ) as Record<string, number>;
  return Object.keys(pruned).length > 0 ? pruned : undefined;
};
// Sanity assertions: pruneZeroEntries({ a: 0, b: 2 }) => { b: 2 }
// Sanity assertions: pruneZeroEntries({ a: 0 }) => undefined

const normalizeSeatingPreference = (value: unknown): SeatingPreference => {
  if (value === 'bar' || value === 'table' || value === 'outdoor' || value === 'any') {
    return value;
  }
  return 'any';
};

const normalizeAllocationText = (value: unknown, maxLength = 64) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const serializeError = (err: unknown) => {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
};

const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeUnitIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(tag => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
};

const buildAllocationIntent = (
  preferredTimeSlot: string | null,
  seatingPreference: SeatingPreference,
  zones: FloorplanZone[],
  tables: FloorplanTable[]
): AllocationIntent => {
  const timeSlot = preferredTimeSlot || null;
  if (seatingPreference === 'any') {
    return { timeSlot, zoneId: null, tableGroup: null };
  }

  const zoneMatchesPreference = (zone: FloorplanZone): number => {
    const type = zone.type?.toLowerCase() ?? '';
    const tags = new Set(normalizeTags(zone.tags));
    const name = zone.name?.toLowerCase() ?? '';

    const matchTag = (tag: string) => tags.has(tag);
    const matchName = (needle: string) => name.includes(needle);

    if (seatingPreference === 'bar') {
      if (type === 'bar' || matchTag('bar')) return 3;
      if (matchName('bar')) return 1;
    }
    if (seatingPreference === 'outdoor') {
      if (type === 'outdoor' || matchTag('outdoor') || matchTag('terasz')) return 3;
      if (matchName('outdoor') || matchName('terasz')) return 1;
    }
    if (seatingPreference === 'table') {
      if (type === 'table' || matchTag('table') || matchTag('asztal')) return 3;
      if (matchName('table') || matchName('asztal')) return 1;
    }
    return 0;
  };

  const candidates = zones
    .map(zone => ({
      zone,
      score: zoneMatchesPreference(zone),
      priority: zone.priority ?? Number.POSITIVE_INFINITY,
      name: zone.name ?? '',
    }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

  const zoneId = candidates[0]?.zone.id || null;
  void tables;

  return { timeSlot, zoneId, tableGroup: null };
};

const fetchFloorplanContext = async (unitId: string) => {
  const [zonesSnap, tablesSnap] = await Promise.all([
    db.collection('units').doc(unitId).collection('zones').get(),
    db.collection('units').doc(unitId).collection('tables').get(),
  ]);

  const zones = zonesSnap.docs
    .map(docSnap => normalizeZone(docSnap.data(), docSnap.id))
    .filter(zone => zone.isActive !== false) as FloorplanZone[];
  const tables = tablesSnap.docs
    .map(docSnap => normalizeTable(docSnap.data(), docSnap.id))
    .filter(table => table.isActive !== false) as FloorplanTable[];

  return { zones, tables };
};

const resolveMatchedZoneId = (zones: FloorplanZone[], zoneId: string | null) => {
  if (!zoneId) return null;
  return zones.some(zone => zone.id === zoneId) ? zoneId : null;
};

const resolveTableGroupKey = (table: FloorplanTable) => {
  const t = table as any;
  const candidate = table.tableGroup ?? t.table_group ?? t.group ?? t.groupId ?? t.tableGroupId;
  return normalizeCapacityKey(candidate);
};

const FLOORPLAN_CONTEXT_TTL_MS = 5 * 60 * 1000;
const FLOORPLAN_CONTEXT_TIMEOUT_MS = 800;
const FLOORPLAN_CONTEXT_CACHE_MAX = 100;
const floorplanContextCache = new Map<
  string,
  {
    expiresAt: number;
    data?: { zones: FloorplanZone[]; tables: FloorplanTable[] };
    inFlight?: Promise<{ zones: FloorplanZone[]; tables: FloorplanTable[] }>;
  }
>();

const fetchFloorplanContextCached = async (unitId: string) => {
  const now = Date.now();
  const cached = floorplanContextCache.get(unitId);
  if (cached?.data && cached.expiresAt > now) {
    return { ...cached.data, fromCache: true };
  }
  if (cached?.inFlight) {
    const data = await cached.inFlight;
    return { ...data, fromCache: false };
  }

  const fetchPromise = fetchFloorplanContext(unitId);
  floorplanContextCache.set(unitId, {
    expiresAt: now + FLOORPLAN_CONTEXT_TTL_MS,
    inFlight: fetchPromise,
  });

  fetchPromise
    .then(data => {
      floorplanContextCache.set(unitId, {
        expiresAt: Date.now() + FLOORPLAN_CONTEXT_TTL_MS,
        data,
      });
    })
    .catch(err => {
      logger.warn('floorplan context fetch failed', { unitId, error: serializeError(err) });
    })
    .finally(() => {
      const entry = floorplanContextCache.get(unitId);
      if (entry?.inFlight === fetchPromise) {
        floorplanContextCache.set(unitId, { ...entry, inFlight: undefined });
      }
    });

  if (floorplanContextCache.size > FLOORPLAN_CONTEXT_CACHE_MAX) {
    const nowCleanup = Date.now();
    for (const [key, entry] of floorplanContextCache.entries()) {
      if (!entry.inFlight && entry.expiresAt <= nowCleanup) {
        floorplanContextCache.delete(key);
      }
    }
    while (floorplanContextCache.size > FLOORPLAN_CONTEXT_CACHE_MAX) {
      let evicted = false;
      for (const [key, entry] of floorplanContextCache.entries()) {
        if (!entry.inFlight) {
          floorplanContextCache.delete(key);
          evicted = true;
          break;
        }
      }
      if (!evicted) break;
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error('FLOORPLAN_TIMEOUT')),
      FLOORPLAN_CONTEXT_TIMEOUT_MS
    );
  });

  try {
    const data = await Promise.race([fetchPromise, timeoutPromise]);
    return { ...data, fromCache: false };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }
};

const computeAllocationDiagnostics = (
  preferredTimeSlot: string | null,
  seatingPreference: SeatingPreference,
  zones: FloorplanZone[],
  tables: FloorplanTable[],
  matchedZoneId: string | null
): AllocationDiagnostics => {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const resolvedZoneId = resolveMatchedZoneId(zones, matchedZoneId);
  if (matchedZoneId && !resolvedZoneId) {
    warnings.push('ZONE_INACTIVE_OR_MISSING');
  }

  if (!zones.length) warnings.push('NO_ZONES');
  if (!tables.length) warnings.push('NO_TABLES');

  let intentQuality: 'none' | 'weak' | 'good' = 'none';

  if (seatingPreference === 'any') {
    if (preferredTimeSlot) intentQuality = 'weak';
  } else if (!resolvedZoneId) {
    intentQuality = 'weak';
    reasons.push('ZONE_NO_MATCH');
  } else {
    intentQuality = 'good';
  }

  return {
    intentQuality,
    matchedZoneId: resolvedZoneId || null,
    reasons,
    warnings,
  };
};

const buildAllocationFinal = (
  intent: AllocationIntent,
  override: AllocationOverride | null
): AllocationFinal => {
  if (override?.enabled) {
    return {
      source: 'override',
      timeSlot: override.timeSlot ?? null,
      zoneId: override.zoneId ?? null,
      tableGroup: override.tableGroup ?? null,
      tableIds: override.tableIds ?? null,
    };
  }

  return {
    source: 'intent',
    timeSlot: intent.timeSlot ?? null,
    zoneId: intent.zoneId ?? null,
    tableGroup: intent.tableGroup ?? null,
    tableIds: null,
  };
};

const isAllocationLocked = (
  data: { allocationFinal?: { locked?: boolean | null } | null } | null | undefined
) => Boolean(data?.allocationFinal?.locked);
// Verified by searching this file for allocationFinal/allocationFinalComputedAt/allocationOverride writes:
// - guestCreateReservation (guest, create): writes allocationFinal + allocationFinalComputedAt.
// - adminSetReservationAllocationOverride (admin): writes allocationOverride, allocationOverrideSetAt,
//   allocationFinal + allocationFinalComputedAt (authoritative lock/unlock).
// If a non-admin update/recompute writer is introduced, guard with isAllocationLocked before updating.
const getClientIp = (req: any) => {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return cfIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return forwarded[0];
  }
  return req.ip || 'unknown';
};

const enforceRateLimit = async (unitId: string, req: any) => {
  const ip = getClientIp(req);
  logger.info('rateLimit', { unitId, ip });

  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const docId = `${unitId}_${ipHash}`;
  const ref = db.collection('guest_rate_limits').doc(docId);

  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() || {} : {};

    const windowStartMsRaw = data.windowStartMs;
    const countRaw = data.count;

    const windowStartMs =
      typeof windowStartMsRaw === 'number' ? windowStartMsRaw : 0;
    const count = typeof countRaw === 'number' ? countRaw : 0;

    const withinWindow =
      windowStartMs > 0 && now - windowStartMs < RATE_LIMIT_WINDOW_MS;

    if (withinWindow && count >= RATE_LIMIT_MAX) {
      throw new Error('RATE_LIMIT');
    }

    if (!withinWindow) {
      transaction.set(
        ref,
        { windowStartMs: now, count: 1, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return;
    }

    transaction.set(
      ref,
      { windowStartMs, count: count + 1, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
};

export const guestUpdateReservation = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set([
        'unitId',
        'reservationId',
        'manageToken',
        'action',
        'reason',
      ]);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, manageToken, reservationId, action, reason } = body;
      if (
        typeof unitId !== 'string' ||
        typeof reservationId !== 'string' ||
        typeof manageToken !== 'string' ||
        action !== 'cancel' ||
        (typeof reason !== 'undefined' && typeof reason !== 'string')
      ) {
        res.status(400).json({ error: 'unitId, reservationId, action és token kötelező' });
        return;
      }

      try {
        await enforceRateLimit(unitId, req);
      } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMIT') {
          res.status(429).json({ error: 'Túl sok kérés' });
          return;
        }
        throw err;
      }

      const docRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .doc(reservationId);
      const bookingSnap = await docRef.get();

      if (!bookingSnap || !bookingSnap.exists) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      const booking = bookingSnap.data();
      const manageTokenHash = hashManageToken(manageToken);
      const hasHash = typeof booking.manageTokenHash === 'string' && booking.manageTokenHash;
      const legacyMatch = !hasHash && manageToken === reservationId;
      if (!legacyMatch && booking.manageTokenHash !== manageTokenHash) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      // 2) Extra biztonság: ne lehessen múltbeli foglalást piszkálni
      if (booking.startTime && booking.startTime.toDate() < new Date()) {
        res
          .status(400)
          .json({ error: 'Már elmúlt időpontú foglalást nem lehet módosítani.' });
        return;
      }

      if (action === 'cancel') {
        const result = await db.runTransaction(async (transaction) => {
          const latestSnap = await transaction.get(docRef);
          if (!latestSnap.exists) {
            throw new Error('NOT_FOUND');
          }
          const latest = latestSnap.data() || {};

          if (latest.status === 'cancelled') {
            return { alreadyCancelled: true };
          }

          const startDate = latest.startTime?.toDate
            ? latest.startTime.toDate()
            : latest.startTime instanceof Date
            ? latest.startTime
            : null;
          const dateKey = startDate ? toDateKey(startDate) : toDateKey(new Date());

          await applyCapacityLedgerTx({
            transaction,
            db,
            unitId,
            reservationRef: docRef,
            reservationData: latest,
            nextStatus: 'cancelled',
            nextDateKey: dateKey,
            nextHeadcount: Number(latest.headcount || 0),
            mutationTraceId: `guest-cancel-${docRef.id}`,
          });

          transaction.update(docRef, {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelReason: reason || '',
            cancelledBy: 'guest',
            updatedAt: FieldValue.serverTimestamp(),
          });

          const logRef = db
            .collection('units')
            .doc(unitId)
            .collection('reservation_logs')
            .doc();
          transaction.set(logRef, {
            bookingId: docRef.id,
            unitId,
            type: 'guest_cancelled',
            createdAt: FieldValue.serverTimestamp(),
            createdByName: latest.name || 'Guest',
            source: 'guest',
            message: reason ? `Vendég lemondta: ${reason}` : 'Vendég lemondta',
          });

          return { alreadyCancelled: false };
        });

        res.status(200).json({ ok: true, alreadyCancelled: result.alreadyCancelled });
        return;
      }

      res.status(400).json({ error: 'Ismeretlen action' });
    } catch (err) {
      logger.error('guestUpdateReservation error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

/*
 * Emulator curl tests:
 * 1) Success (200) + time slot change:
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":4,"startTimeMs":1735758000000,"endTimeMs":1735761600000}'
 * 2) Bad token (404):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"BAD","headcount":4,"startTimeMs":1735732800000,"endTimeMs":1735736400000}'
 * 3) Capacity full (409):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":30,"startTimeMs":1735732800000,"endTimeMs":1735736400000}'
 *
 * After (1), verify reservation_capacity.byTimeSlot moved headcount from afternoon->evening.
 * Headcount-only change:
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":6,"startTimeMs":1735758000000,"endTimeMs":1735761600000}'
 * Time-slot-only change:
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":4,"startTimeMs":1735765200000,"endTimeMs":1735768800000}'
 * Midnight boundary check (verify toDateKey + timeSlot agree with local day/slot):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":2,"startTimeMs":1735689600000,"endTimeMs":1735693200000}'
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":2,"startTimeMs":1735696800000,"endTimeMs":1735700400000}'
 * Night slot coverage (01:00 local time -> byTimeSlot.night):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":2,"startTimeMs":1735693200000,"endTimeMs":1735696800000}'
 * DateKey boundary move (late night -> after midnight):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":2,"startTimeMs":1735762800000,"endTimeMs":1735766400000}'
 * Cross-midnight booking window (23:30 -> 00:30):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":2,"startTimeMs":1735774200000,"endTimeMs":1735777800000}'
 * No allocationIntent (ensure breakdownUntracked updates):
 * curl -X POST http://localhost:5001/<PROJECT>/europe-west3/guestModifyReservation \
 *   -H "Content-Type: application/json" \
 *   -d '{"unitId":"UNIT","reservationId":"RES","manageToken":"TOKEN","headcount":3,"startTimeMs":1735774200000,"endTimeMs":1735777800000}'
 *
 * Inspect logs in units/{unitId}/reservation_logs and reservation_capacity.byTimeSlot.
 * Verify capacity docs for old/new dateKey and a reservation_logs entry for guest_modified.
 * For cross-midnight, capacity uses startTime dateKey; logs should show date+time for end field.
 * Zero-prune check: seed reservation_capacity.byZone with {"Z1": 2}, modify a reservation to apply
 * a -2 delta for Z1, then verify byZone is deleted (field absent) and logger fields byZoneDeleted=true.
 */
export const guestModifyReservation = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set([
        'unitId',
        'reservationId',
        'manageToken',
        'headcount',
        'startTimeMs',
        'endTimeMs',
      ]);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, reservationId, manageToken, headcount, startTimeMs, endTimeMs } =
        body;
      const parsedHeadcount = Number(headcount);
      const parsedStartTimeMs = Number(startTimeMs);
      const parsedEndTimeMs = Number(endTimeMs);
      if (
        typeof unitId !== 'string' ||
        typeof reservationId !== 'string' ||
        typeof manageToken !== 'string' ||
        !Number.isFinite(parsedHeadcount) ||
        !Number.isFinite(parsedStartTimeMs) ||
        !Number.isFinite(parsedEndTimeMs)
      ) {
        res
          .status(400)
          .json({ error: 'unitId, reservationId, token és új időpont kötelező' });
        return;
      }

      if (parsedHeadcount < MIN_HEADCOUNT || parsedHeadcount > MAX_HEADCOUNT) {
        res.status(400).json({ error: `Létszám ${MIN_HEADCOUNT}-${MAX_HEADCOUNT} között lehet` });
        return;
      }

      const startTime = new Date(parsedStartTimeMs);
      const endTime = new Date(parsedEndTimeMs);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        res.status(400).json({ error: 'Érvénytelen időpont' });
        return;
      }
      if (endTime.getTime() <= startTime.getTime()) {
        res.status(400).json({ error: 'A befejezési időpontnak a kezdés után kell lennie.' });
        return;
      }

      try {
        await enforceRateLimit(unitId, req);
      } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMIT') {
          res.status(429).json({ error: 'Túl sok kérés' });
          return;
        }
        throw err;
      }

      const docRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .doc(reservationId);
      const bookingSnap = await docRef.get();

      if (!bookingSnap.exists) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      const booking = bookingSnap.data() || {};
      const manageTokenHash = hashManageToken(manageToken);
      const hasHash = typeof booking.manageTokenHash === 'string' && booking.manageTokenHash;
      const legacyMatch = !hasHash && manageToken === reservationId;
      if (!legacyMatch && booking.manageTokenHash !== manageTokenHash) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      const bookingStart = booking.startTime?.toDate
        ? booking.startTime.toDate()
        : booking.startTime instanceof Date
        ? booking.startTime
        : null;
      if (bookingStart && bookingStart.getTime() < Date.now()) {
        res
          .status(400)
          .json({ error: 'Már elmúlt időpontú foglalást nem lehet módosítani.' });
        return;
      }

      if (booking.status && booking.status !== 'pending') {
        res.status(400).json({ error: 'A foglalás nem módosítható.' });
        return;
      }

      const settingsSnap = await db.doc(`reservation_settings/${unitId}`).get();
      const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
      let allocationZones: FloorplanZone[] = [];
      let allocationTables: FloorplanTable[] = [];
      let allocationContextReady = false;
      let activeZoneIds: Set<string> | undefined;
      let activeTableGroups: Set<string> | undefined;
      try {
        const context = await fetchFloorplanContextCached(unitId);
        allocationZones = context.zones;
        allocationTables = context.tables;
        activeZoneIds = new Set(allocationZones.map(zone => zone.id));
        activeTableGroups = new Set(
          allocationTables
            .map(table => resolveTableGroupKey(table))
            .filter((value): value is string => !!value)
        );
        allocationContextReady = true;
      } catch (err) {
        logger.warn('guestModifyReservation allocation context failed', {
          unitId,
          error: serializeError(err),
        });
      }

      const applyCapacityDelta = (
        maps: {
          byTimeSlot: Record<string, number>;
          byZone: Record<string, number>;
          byTableGroup: Record<string, number>;
        },
        delta: number,
        intent: AllocationIntent | null | undefined,
        untracked: { value: number },
        opts?: { activeZoneIds?: Set<string>; activeTableGroups?: Set<string> }
      ) => {
        let usedUntracked = false;
        let appliedAny = false;
        const normalizedTimeSlot = normalizePreferredTimeSlot(intent?.timeSlot ?? null);
        const normalizedZoneId = normalizeCapacityKey(intent?.zoneId ?? null);
        const normalizedTableGroup = normalizeCapacityKey(intent?.tableGroup ?? null);
        const normalizedZoneIdUsed = !!normalizedZoneId;
        const normalizedTableGroupUsed = !!normalizedTableGroup;
        const timeSlotApplied = !!normalizedTimeSlot;
        const invalidZoneKey =
          delta > 0 &&
          !!normalizedZoneId &&
          !!opts?.activeZoneIds &&
          !opts.activeZoneIds.has(normalizedZoneId);
        const invalidTableGroupKey =
          delta > 0 &&
          !!normalizedTableGroup &&
          !!opts?.activeTableGroups &&
          !opts.activeTableGroups.has(normalizedTableGroup);
        const invalidZoneId = invalidZoneKey ? normalizedZoneId : null;
        const invalidTableGroupKeyName = invalidTableGroupKey ? normalizedTableGroup : null;

        if (normalizedTimeSlot) {
          maps.byTimeSlot[normalizedTimeSlot] = clampAdd(
            maps.byTimeSlot[normalizedTimeSlot] || 0,
            delta
          );
          appliedAny = true;
        }
        if (normalizedZoneId && !invalidZoneKey) {
          maps.byZone[normalizedZoneId] = clampAdd(
            maps.byZone[normalizedZoneId] || 0,
            delta
          );
          appliedAny = true;
        }
        if (normalizedTableGroup && !invalidTableGroupKey) {
          maps.byTableGroup[normalizedTableGroup] = clampAdd(
            maps.byTableGroup[normalizedTableGroup] || 0,
            delta
          );
          appliedAny = true;
        }

        if (!appliedAny) {
          untracked.value = clampAdd(untracked.value, delta);
          usedUntracked = true;
        }

        return {
          usedUntracked,
          normalizedZoneIdUsed,
          normalizedTableGroupUsed,
          timeSlotApplied,
          invalidZoneKey,
          invalidTableGroupKey,
          invalidZoneId,
          invalidTableGroupKeyName,
        };
      };

      const buildBreakdownUpdate = (
        capacityData: Record<string, any>,
        deltas: Array<{ delta: number; intent: AllocationIntent | null | undefined; label: string }>,
        opts?: { activeZoneIds?: Set<string>; activeTableGroups?: Set<string> }
      ) => {
        const maps = {
          byTimeSlot: {
            ...(capacityData.byTimeSlot as Record<string, number> | undefined),
          },
          byZone: {
            ...(capacityData.byZone as Record<string, number> | undefined),
          },
          byTableGroup: {
            ...(capacityData.byTableGroup as Record<string, number> | undefined),
          },
        };
        const untracked = {
          value: clampAdd(Number(capacityData.breakdownUntracked || 0), 0),
        };
        const untrackedApplied: Record<string, boolean> = {};
        const normalizedApplied: Record<
          string,
          {
            normalizedZoneIdUsed: boolean;
            normalizedTableGroupUsed: boolean;
            timeSlotApplied: boolean;
            invalidZoneKey: boolean;
            invalidTableGroupKey: boolean;
            invalidZoneId: string | null;
            invalidTableGroupKeyName: string | null;
          }
        > = {};
        deltas.forEach(({ delta, intent, label }) => {
          const result = applyCapacityDelta(maps, delta, intent, untracked, opts);
          untrackedApplied[label] = result.usedUntracked;
          normalizedApplied[label] = {
            normalizedZoneIdUsed: result.normalizedZoneIdUsed,
            normalizedTableGroupUsed: result.normalizedTableGroupUsed,
            timeSlotApplied: result.timeSlotApplied,
            invalidZoneKey: result.invalidZoneKey,
            invalidTableGroupKey: result.invalidTableGroupKey,
            invalidZoneId: result.invalidZoneId,
            invalidTableGroupKeyName: result.invalidTableGroupKeyName,
          };
        });
        const prunedByTimeSlot = pruneZeroEntries(maps.byTimeSlot);
        const prunedByZone = pruneZeroEntries(maps.byZone);
        const prunedByTableGroup = pruneZeroEntries(maps.byTableGroup);
        const update: Record<string, any> = {
          breakdownUntracked: untracked.value,
        };
        // Sanity: map emptied => FieldValue.delete() removes the field on merge.
        // Sanity: map has entries => pruned map is written.
        if (prunedByTimeSlot) update.byTimeSlot = prunedByTimeSlot;
        else update.byTimeSlot = FieldValue.delete();
        if (prunedByZone) update.byZone = prunedByZone;
        else update.byZone = FieldValue.delete();
        if (prunedByTableGroup) update.byTableGroup = prunedByTableGroup;
        else update.byTableGroup = FieldValue.delete();
        const deleted = {
          byTimeSlot: !prunedByTimeSlot,
          byZone: !prunedByZone,
          byTableGroup: !prunedByTableGroup,
        };
        return { update, untrackedApplied, normalizedApplied, deleted };
      };

      let debugInfo: {
        currentDateKey?: string;
        nextDateKey?: string;
        oldTimeSlot?: string | null;
        newTimeSlot?: string | null;
        timeSlotComputed?: string | null;
        guestPreferredTimeSlot?: string | null;
        existingHeadcount?: number;
        untrackedOldUsed?: boolean;
        untrackedNewUsed?: boolean;
        oldIntentExists?: boolean;
        newIntentExists?: boolean;
        normalizedZoneIdUsed?: boolean;
        normalizedTableGroupUsed?: boolean;
        byTimeSlotDeleted?: boolean;
        byZoneDeleted?: boolean;
        byTableGroupDeleted?: boolean;
        invalidZoneKey?: boolean;
        invalidTableGroupKey?: boolean;
        invalidZoneId?: string | null;
        invalidTableGroupKeyName?: string | null;
        intentQuality?: AllocationDiagnostics['intentQuality'];
        matchedZoneId?: string | null;
        intentReasons?: string[];
        intentWarnings?: string[];
      } = {};

      const result = await db.runTransaction(async (transaction) => {
        const latestSnap = await transaction.get(docRef);
        if (!latestSnap.exists) {
          throw new Error('NOT_FOUND');
        }
        const latest = latestSnap.data() || {};
        if (latest.status && latest.status !== 'pending') {
          throw new Error('INVALID_STATUS');
        }

        const existingHeadcount = Number(latest.headcount || 0);
        const existingStart = latest.startTime?.toDate
          ? latest.startTime.toDate()
          : latest.startTime instanceof Date
          ? latest.startTime
          : null;
        const existingEnd = latest.endTime?.toDate
          ? latest.endTime.toDate()
          : latest.endTime instanceof Date
          ? latest.endTime
          : null;
        if (!existingStart) {
          throw new Error('INVALID_DATA');
        }

        const oldIntent = (latest.allocationIntent || null) as AllocationIntent | null;
        const seatingPreference = normalizeSeatingPreference(latest.seatingPreference);
        const guestPreferredTimeSlot = normalizePreferredTimeSlot(latest.preferredTimeSlot);
        const newTimeSlot = computeCapacityTimeSlot(startTime);
        const newIntent = oldIntent
          ? {
              ...oldIntent,
              timeSlot: newTimeSlot ?? oldIntent.timeSlot ?? null,
            }
          : null;
        const computedTimeSlot = newIntent?.timeSlot ?? null;

        const currentDateKey = toDateKey(existingStart);
        const nextDateKey = toDateKey(startTime);
        const capacityRefCurrent = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_capacity')
          .doc(currentDateKey);
        const capacityRefNext = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_capacity')
          .doc(nextDateKey);

        const [currentCapSnap, nextCapSnap] = await Promise.all(
          currentDateKey === nextDateKey
            ? [transaction.get(capacityRefCurrent), Promise.resolve(null)]
            : [
                transaction.get(capacityRefCurrent),
                transaction.get(capacityRefNext),
              ]
        );

        const currentCapData =
          currentCapSnap && currentCapSnap.exists ? currentCapSnap.data() || {} : {};
        const nextCapData =
          currentDateKey === nextDateKey
            ? currentCapData
            : nextCapSnap && nextCapSnap.exists
            ? nextCapSnap.data() || {}
            : {};

        const currentCount =
          (currentCapData.totalCount as number | undefined) ??
          (currentCapData.count as number | undefined) ??
          0;
        const nextCountBase =
          (nextCapData.totalCount as number | undefined) ??
          (nextCapData.count as number | undefined) ??
          0;
        const limitFromDoc = (nextCapData.limit as number | undefined) ?? undefined;
        const limitFromSettings =
          settings.dailyCapacity && settings.dailyCapacity > 0
            ? settings.dailyCapacity
            : undefined;
        const limit = limitFromDoc ?? limitFromSettings;
        const allocationOverrideDecision = await readAllocationOverrideTx(
          transaction,
          db,
          unitId,
          nextDateKey
        );
        const decisionBaseline =
          currentDateKey === nextDateKey
            ? Math.max(0, currentCount - existingHeadcount)
            : nextCountBase;
        const allocationDecision = decideAllocation({
          unitId,
          dateKey: nextDateKey,
          startTime,
          endTime,
          partySize: parsedHeadcount,
          capacitySnapshot: { currentCount: decisionBaseline, limit },
          settings: { bookableWindow: settings.bookableWindow ?? null },
          overrides: allocationOverrideDecision,
        });

        if (allocationDecision.decision.status !== 'accepted') {
          return { rejected: true, allocationDecision };
        }

        let allocationDiagnostics: AllocationDiagnostics;
        if (allocationContextReady) {
          allocationDiagnostics = computeAllocationDiagnostics(
            guestPreferredTimeSlot,
            seatingPreference,
            allocationZones,
            allocationTables,
            newIntent?.zoneId ?? null
          );
        } else {
          const intentQuality =
            seatingPreference === 'any'
              ? guestPreferredTimeSlot
                ? 'weak'
                : 'none'
              : 'weak';
          allocationDiagnostics = {
            intentQuality,
            matchedZoneId: newIntent?.zoneId ?? null,
            reasons: [],
            warnings: ['context_unavailable'],
          };
        }

        const breakdownOpts = allocationContextReady
          ? { activeZoneIds, activeTableGroups }
          : undefined;

        await applyCapacityLedgerTx({
          transaction,
          db,
          unitId,
          reservationRef: docRef,
          reservationData: latest,
          nextStatus: latest.status || 'pending',
          nextDateKey: nextDateKey,
          nextHeadcount: parsedHeadcount,
          mutationTraceId: `guest-modify-${reservationId}-${allocationDecision.auditLog.traceId}`,
        });

        if (currentDateKey === nextDateKey) {
          const breakdownResult = buildBreakdownUpdate(
            currentCapData,
            [
              { delta: -existingHeadcount, intent: oldIntent, label: 'old' },
              { delta: parsedHeadcount, intent: newIntent, label: 'new' },
            ],
            breakdownOpts
          );
          const capacityUpdate: Record<string, any> = {
            date: currentDateKey,
            updatedAt: FieldValue.serverTimestamp(),
            ...breakdownResult.update,
          };
          transaction.set(capacityRefCurrent, capacityUpdate, { merge: true });
          debugInfo.untrackedOldUsed = breakdownResult.untrackedApplied.old ?? false;
          debugInfo.untrackedNewUsed = breakdownResult.untrackedApplied.new ?? false;
          debugInfo.normalizedZoneIdUsed =
            breakdownResult.normalizedApplied.new?.normalizedZoneIdUsed ?? false;
          debugInfo.normalizedTableGroupUsed =
            breakdownResult.normalizedApplied.new?.normalizedTableGroupUsed ?? false;
          debugInfo.byTimeSlotDeleted = breakdownResult.deleted.byTimeSlot;
          debugInfo.byZoneDeleted = breakdownResult.deleted.byZone;
          debugInfo.byTableGroupDeleted = breakdownResult.deleted.byTableGroup;
          debugInfo.invalidZoneKey = breakdownResult.normalizedApplied.new?.invalidZoneKey ?? false;
          debugInfo.invalidTableGroupKey =
            breakdownResult.normalizedApplied.new?.invalidTableGroupKey ?? false;
          debugInfo.invalidZoneId = breakdownResult.normalizedApplied.new?.invalidZoneId ?? null;
          debugInfo.invalidTableGroupKeyName =
            breakdownResult.normalizedApplied.new?.invalidTableGroupKeyName ?? null;
        } else {
          const currentBreakdownResult = buildBreakdownUpdate(
            currentCapData,
            [{ delta: -existingHeadcount, intent: oldIntent, label: 'old' }],
            breakdownOpts
          );
          const nextBreakdownResult = buildBreakdownUpdate(
            nextCapData,
            [{ delta: parsedHeadcount, intent: newIntent, label: 'new' }],
            breakdownOpts
          );
          const currentUpdate: Record<string, any> = {
            date: currentDateKey,
            updatedAt: FieldValue.serverTimestamp(),
            ...currentBreakdownResult.update,
          };
          const nextUpdate: Record<string, any> = {
            date: nextDateKey,
            updatedAt: FieldValue.serverTimestamp(),
            ...nextBreakdownResult.update,
          };
          if (limitFromDoc == null && typeof limitFromSettings === 'number') {
            nextUpdate.limit = limitFromSettings;
          }
          transaction.set(capacityRefCurrent, currentUpdate, { merge: true });
          transaction.set(capacityRefNext, nextUpdate, { merge: true });
          debugInfo.untrackedOldUsed = currentBreakdownResult.untrackedApplied.old ?? false;
          debugInfo.untrackedNewUsed = nextBreakdownResult.untrackedApplied.new ?? false;
          debugInfo.normalizedZoneIdUsed =
            nextBreakdownResult.normalizedApplied.new?.normalizedZoneIdUsed ?? false;
          debugInfo.normalizedTableGroupUsed =
            nextBreakdownResult.normalizedApplied.new?.normalizedTableGroupUsed ?? false;
          debugInfo.byTimeSlotDeleted =
            currentBreakdownResult.deleted.byTimeSlot || nextBreakdownResult.deleted.byTimeSlot;
          debugInfo.byZoneDeleted =
            currentBreakdownResult.deleted.byZone || nextBreakdownResult.deleted.byZone;
          debugInfo.byTableGroupDeleted =
            currentBreakdownResult.deleted.byTableGroup || nextBreakdownResult.deleted.byTableGroup;
          debugInfo.invalidZoneKey =
            nextBreakdownResult.normalizedApplied.new?.invalidZoneKey ?? false;
          debugInfo.invalidTableGroupKey =
            nextBreakdownResult.normalizedApplied.new?.invalidTableGroupKey ?? false;
          debugInfo.invalidZoneId =
            nextBreakdownResult.normalizedApplied.new?.invalidZoneId ?? null;
          debugInfo.invalidTableGroupKeyName =
            nextBreakdownResult.normalizedApplied.new?.invalidTableGroupKeyName ?? null;
        }

        const modifiedFields = [];
        if (existingHeadcount !== parsedHeadcount) modifiedFields.push('headcount');
        if (existingStart.getTime() !== startTime.getTime()) modifiedFields.push('startTime');
        if (existingEnd?.getTime() !== endTime.getTime()) modifiedFields.push('endTime');

        transaction.update(docRef, {
          headcount: parsedHeadcount,
          startTime: Timestamp.fromDate(startTime),
          endTime: Timestamp.fromDate(endTime),
          allocationDiagnostics,
          allocation: {
            status: allocationDecision.decision.status,
            reasonCode: allocationDecision.decision.reasonCode,
            ruleApplied: allocationDecision.auditLog.ruleApplied,
            traceId: allocationDecision.auditLog.traceId,
            capacityKey: allocationDecision.decision.capacityKey,
          },
          allocationTraceId: allocationDecision.auditLog.traceId,
          allocationCapacityBefore: allocationDecision.auditLog.capacityBefore,
          allocationCapacityAfter: allocationDecision.auditLog.capacityAfter ?? null,
          modifiedAt: FieldValue.serverTimestamp(),
          modifiedFields,
          modifiedBy: 'guest',
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (modifiedFields.length > 0) {
          const logRef = db
            .collection('units')
            .doc(unitId)
            .collection('reservation_logs')
            .doc();
          const parts: string[] = [];
          if (existingHeadcount !== parsedHeadcount) {
            parts.push(`headcount ${existingHeadcount}→${parsedHeadcount}`);
          }
          if (existingStart.getTime() !== startTime.getTime()) {
            const fromDateKey = dateKeyOf(existingStart);
            const toDateKeyValue = dateKeyOf(startTime);
            const fromValue =
              fromDateKey !== toDateKeyValue
                ? formatLogDateTime(existingStart, fromDateKey)
                : formatTimeForLog(existingStart);
            const toValue =
              fromDateKey !== toDateKeyValue
                ? formatLogDateTime(startTime, toDateKeyValue)
                : formatTimeForLog(startTime);
            parts.push(
              `start ${fromValue}→${toValue}`
            );
          }
          if (existingEnd?.getTime() !== endTime.getTime()) {
            const fromDateKey = existingEnd ? dateKeyOf(existingEnd) : '';
            const toDateKeyValue = dateKeyOf(endTime);
            const showDate = fromDateKey !== toDateKeyValue;
            const fromValue = existingEnd
              ? showDate
                ? formatLogDateTime(existingEnd, fromDateKey)
                : formatTimeForLog(existingEnd)
              : '';
            const toValue = showDate
              ? formatLogDateTime(endTime, toDateKeyValue)
              : formatTimeForLog(endTime);
            parts.push(
              `end ${fromValue}→${toValue}`
            );
          }
          const messageSuffix = parts.length > 0 ? ` ${parts.join(', ')}` : '';
          transaction.set(logRef, {
            bookingId: docRef.id,
            unitId,
            type: 'guest_modified',
            createdAt: FieldValue.serverTimestamp(),
            source: 'guest',
            message: `Vendég módosította:${messageSuffix}`,
            modifiedFields,
          });
        }

        debugInfo = {
          ...debugInfo,
          currentDateKey,
          nextDateKey,
          oldTimeSlot: oldIntent?.timeSlot ?? null,
          newTimeSlot: newIntent?.timeSlot ?? null,
          timeSlotComputed: computedTimeSlot,
          guestPreferredTimeSlot,
          existingHeadcount,
          oldIntentExists: !!oldIntent,
          newIntentExists: !!newIntent,
          intentQuality: allocationDiagnostics.intentQuality,
          matchedZoneId: allocationDiagnostics.matchedZoneId ?? null,
          intentReasons: allocationDiagnostics.reasons,
          intentWarnings: allocationDiagnostics.warnings,
        };

        return {
          headcount: parsedHeadcount,
          startTimeMs: startTime.getTime(),
          endTimeMs: endTime.getTime(),
          allocationDecision,
        };
      });

      const allocationDecision = result.allocationDecision;
      const auditLog = {
        ...allocationDecision.auditLog,
        reservationId,
      };
      await writeAllocationAuditLog(db, auditLog);

      if (result.rejected) {
        if (allocationDecision.decision.reasonCode === 'CAPACITY_FULL') {
          res.status(409).json({ error: 'capacity_full' });
          return;
        }
        res.status(400).json({ error: 'A foglalás nem módosítható.' });
        return;
      }

      logger.info('guestModifyReservation update', {
        unitId,
        reservationId,
        currentDateKey: debugInfo.currentDateKey,
        nextDateKey: debugInfo.nextDateKey,
        oldIntentExists: debugInfo.oldIntentExists,
        newIntentExists: debugInfo.newIntentExists,
        oldTimeSlot: debugInfo.oldTimeSlot,
        newTimeSlot: debugInfo.newTimeSlot,
        untrackedOldUsed: debugInfo.untrackedOldUsed,
        untrackedNewUsed: debugInfo.untrackedNewUsed,
        normalizedZoneIdUsed: debugInfo.normalizedZoneIdUsed,
        normalizedTableGroupUsed: debugInfo.normalizedTableGroupUsed,
        byTimeSlotDeleted: debugInfo.byTimeSlotDeleted,
        byZoneDeleted: debugInfo.byZoneDeleted,
        byTableGroupDeleted: debugInfo.byTableGroupDeleted,
        invalidZoneKey: debugInfo.invalidZoneKey,
        invalidTableGroupKey: debugInfo.invalidTableGroupKey,
        invalidZoneId: debugInfo.invalidZoneId,
        invalidTableGroupKeyName: debugInfo.invalidTableGroupKeyName,
        timeSlotComputed: debugInfo.timeSlotComputed,
        guestPreferredTimeSlot: debugInfo.guestPreferredTimeSlot,
        intentQuality: debugInfo.intentQuality,
        matchedZoneId: debugInfo.matchedZoneId,
        intentReasons: debugInfo.intentReasons,
        intentWarnings: debugInfo.intentWarnings,
        allocationContextReady,
        activeZoneCount: allocationContextReady ? allocationZones.length : undefined,
        activeTableCount: allocationContextReady ? allocationTables.length : undefined,
        activeTableGroupCount:
          allocationContextReady && activeTableGroups ? activeTableGroups.size : undefined,
        tzSemantics: TIMEZONE_SEMANTICS,
        existingHeadcount: debugInfo.existingHeadcount,
        newHeadcount: parsedHeadcount,
      });

      const { allocationDecision: _allocationDecision, ...responsePayload } = result;
      res.status(200).json({ ok: true, ...responsePayload });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'CAPACITY_FULL') {
          res.status(409).json({ error: 'capacity_full' });
          return;
        }
        if (err.message === 'NOT_FOUND') {
          res.status(404).json({ error: 'Foglalás nem található' });
          return;
        }
        if (err.message === 'INVALID_STATUS') {
          res.status(400).json({ error: 'A foglalás nem módosítható.' });
          return;
        }
        if (err.message === 'INVALID_DATA') {
          res.status(400).json({ error: 'A foglalás adatai hiányosak.' });
          return;
        }
      }
      logger.error('guestModifyReservation error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

export const guestCreateReservation = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    console.log('>>> guestCreateReservation HANDLER ENTERED');
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const { unitId, dateKey, reservation } = req.body || {};
      if (!unitId || !reservation) {
        res.status(400).json({ error: 'unitId és reservation kötelező' });
        return;
      }

      const startTime = reservation.startTime ? new Date(reservation.startTime) : null;
      const endTime = reservation.endTime ? new Date(reservation.endTime) : null;
      const headcount = Number(reservation.headcount || 0);
      const preferredTimeSlot = normalizePreferredTimeSlot(reservation.preferredTimeSlot);
      const seatingPreference = normalizeSeatingPreference(reservation.seatingPreference);

      if (!startTime || Number.isNaN(startTime.getTime())) {
        res.status(400).json({ error: 'startTime hiányzik vagy érvénytelen' });
        return;
      }
      if (!endTime || Number.isNaN(endTime.getTime())) {
        res.status(400).json({ error: 'endTime hiányzik vagy érvénytelen' });
        return;
      }
      if (!reservation.name || headcount <= 0) {
        res.status(400).json({ error: 'Név és létszám kötelező' });
        return;
      }
      if (headcount < MIN_HEADCOUNT || headcount > MAX_HEADCOUNT) {
        res.status(400).json({ error: `Létszám ${MIN_HEADCOUNT}-${MAX_HEADCOUNT} között lehet` });
        return;
      }
      if (!reservation.contact?.email) {
        res.status(400).json({ error: 'E-mail kötelező' });
        return;
      }

      const settingsSnap = await db.doc(`reservation_settings/${unitId}`).get();
      const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
      const reservationMode = settings.reservationMode || 'request';
      const status = reservationMode === 'auto' ? 'confirmed' : 'pending';

      const effectiveDateKey = dateKey || toDateKey(startTime);
      let zones: FloorplanZone[] = [];
      let tables: FloorplanTable[] = [];
      let allocationIntent = {
        timeSlot: preferredTimeSlot,
        zoneId: null,
        tableGroup: null,
      } as AllocationIntent;
      let allocationDiagnostics: AllocationDiagnostics = {
        intentQuality: 'none',
        matchedZoneId: null,
        reasons: ['DIAG_FAILED'],
        warnings: [],
      };

      try {
        const context = await fetchFloorplanContext(unitId);
        zones = context.zones;
        tables = context.tables;
        allocationIntent = buildAllocationIntent(
          preferredTimeSlot,
          seatingPreference,
          zones,
          tables
        );
        allocationDiagnostics = computeAllocationDiagnostics(
          preferredTimeSlot,
          seatingPreference,
          zones,
          tables,
          allocationIntent.zoneId || null
        );
      } catch (err) {
        logger.warn('Allocation diagnostics fallback', { unitId, err });
      }

      const capacityRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_capacity')
        .doc(effectiveDateKey);
      const reservationsRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations');

      const manageToken = generateManageToken();
      const manageTokenHash = hashManageToken(manageToken);
      const adminActionToken =
        reservationMode === 'request' ? generateAdminActionToken() : null;
      const adminActionTokenHash = adminActionToken
        ? hashAdminActionToken(adminActionToken)
        : null;
      const adminActionExpiresAt = adminActionToken
        ? Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000))
        : null;

      const createResult = await db.runTransaction(async (transaction) => {
        const capacitySnap = await transaction.get(capacityRef);
        const capacityData = capacitySnap.exists ? capacitySnap.data() || {} : {};
        const currentCount =
          (capacityData.totalCount as number | undefined) ??
          (capacityData.count as number | undefined) ??
          0;
        const limitFromDoc = capacitySnap.exists
          ? (capacityData.limit as number | undefined)
          : undefined;
        const limitFromSettings =
          settings.dailyCapacity && settings.dailyCapacity > 0
            ? settings.dailyCapacity
            : undefined;
        const limit = limitFromDoc ?? limitFromSettings;

        const allocationOverrideDecision = await readAllocationOverrideTx(
          transaction,
          db,
          unitId,
          effectiveDateKey
        );

        const allocationDecision = decideAllocation({
          unitId,
          dateKey: effectiveDateKey,
          startTime,
          endTime,
          partySize: headcount,
          capacitySnapshot: { currentCount, limit },
          settings: { bookableWindow: settings.bookableWindow ?? null },
          overrides: allocationOverrideDecision,
        });

        if (allocationDecision.decision.status !== 'accepted') {
          return { bookingId: null, allocationDecision };
        }

        const nextCount = allocationDecision.capacityEffects.nextTotal;

        const reservationRef = reservationsRef.doc();
        const referenceCode = reservationRef.id;
        const allocationTraceId = allocationDecision.auditLog.traceId;
        const countsCapacity = countsTowardCapacity(status);

        const allocationIntentData = {
          ...allocationIntent,
          timeSlot: allocationIntent.timeSlot ?? null,
          zoneId: allocationIntent.zoneId ?? null,
          tableGroup: allocationIntent.tableGroup ?? null,
        };
        const allocationOverride: AllocationOverride = {
          enabled: false,
        };
        const allocationFinal = buildAllocationFinal(
          allocationIntentData,
          allocationOverride
        );

        transaction.set(reservationRef, {
          unitId,
          name: reservation.name,
          headcount,
          startTime: Timestamp.fromDate(startTime),
          endTime: Timestamp.fromDate(endTime),
          preferredTimeSlot,
          seatingPreference,
          allocationIntent: allocationIntentData,
          allocationDiagnostics,
          allocationOverride,
          allocationOverrideSetAt: null,
          allocationFinal,
          allocationFinalComputedAt: FieldValue.serverTimestamp(),
          allocation: {
            status: allocationDecision.decision.status,
            reasonCode: allocationDecision.decision.reasonCode,
            ruleApplied: allocationDecision.auditLog.ruleApplied,
            traceId: allocationTraceId,
            capacityKey: allocationDecision.decision.capacityKey,
          },
          allocationTraceId,
          allocationCapacityBefore: allocationDecision.auditLog.capacityBefore,
          allocationCapacityAfter: allocationDecision.auditLog.capacityAfter ?? null,
          capacityLedger: {
            applied: countsCapacity,
            key: countsCapacity ? effectiveDateKey : null,
            count: countsCapacity ? headcount : null,
            appliedAt: countsCapacity ? FieldValue.serverTimestamp() : null,
            lastMutationTraceId: allocationTraceId,
          },
          contact: {
            phoneE164: reservation.contact?.phoneE164 || '',
            email: String(reservation.contact?.email || '').toLowerCase(),
          },
          
          locale: reservation.locale || 'hu',
          status,
          createdAt: FieldValue.serverTimestamp(),
          referenceCode,
          reservationMode,
          occasion: reservation.occasion || '',
          source: reservation.source || '',
          customData: reservation.customData || {},
          manageTokenHash,
          ...(adminActionToken
            ? {
                adminActionTokenHash: adminActionTokenHash ?? undefined,
                adminActionExpiresAt: adminActionExpiresAt ?? undefined,
                adminActionUsedAt: null,
              }
            : {}),
          skipCreateEmails: Boolean((reservation as any)?.skipCreateEmails),
        });

        const capacityUpdate: Record<string, any> = {
          date: effectiveDateKey,
          count: nextCount,
          totalCount: nextCount,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (allocationIntent.timeSlot) {
          const byTimeSlot = {
            ...(capacityData.byTimeSlot as Record<string, number> | undefined),
          };
          byTimeSlot[allocationIntent.timeSlot] =
            (byTimeSlot[allocationIntent.timeSlot] || 0) + headcount;
          capacityUpdate.byTimeSlot = byTimeSlot;
        }
        if (allocationIntent.zoneId) {
          const byZone = {
            ...(capacityData.byZone as Record<string, number> | undefined),
          };
          byZone[allocationIntent.zoneId] = (byZone[allocationIntent.zoneId] || 0) + headcount;
          capacityUpdate.byZone = byZone;
        }
        if (allocationIntent.tableGroup) {
          const byTableGroup = {
            ...(capacityData.byTableGroup as Record<string, number> | undefined),
          };
          byTableGroup[allocationIntent.tableGroup] =
            (byTableGroup[allocationIntent.tableGroup] || 0) + headcount;
          capacityUpdate.byTableGroup = byTableGroup;
        }
        if (allocationDiagnostics.warnings.length > 0) {
          capacityUpdate.hasAllocationWarnings = true;
        }
        if (limitFromDoc == null && typeof limitFromSettings === 'number') {
          capacityUpdate.limit = limitFromSettings;
        }
        transaction.set(capacityRef, capacityUpdate, { merge: true });

        const dateStr = startTime.toLocaleString('hu-HU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const logRef = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_logs')
          .doc();
        const diagnosticCodes = [
          ...allocationDiagnostics.reasons,
          ...allocationDiagnostics.warnings,
        ].filter(Boolean);
        const diagnosticSuffix = diagnosticCodes.length
          ? ` [alloc:${diagnosticCodes.join(',')}]`
          : '';
        transaction.set(logRef, {
          bookingId: referenceCode,
          unitId,
          type: 'guest_created',
          createdAt: FieldValue.serverTimestamp(),
          createdByName: reservation.name,
          source: 'guest',
          message: `Vendég foglalást adott le: ${reservation.name} (${headcount} fő, ${dateStr})${diagnosticSuffix}`,
        });

        return { bookingId: referenceCode, allocationDecision };
      });

      const allocationDecision = createResult.allocationDecision;
      const auditLog = {
        ...allocationDecision.auditLog,
        reservationId: createResult.bookingId ?? null,
        traceId: createResult.bookingId ?? allocationDecision.auditLog.traceId,
      };
      await writeAllocationAuditLog(db, auditLog);

      if (allocationDecision.decision.status !== 'accepted') {
        if (allocationDecision.decision.reasonCode === 'CAPACITY_FULL') {
          res.status(409).json({ error: 'capacity_full' });
          return;
        }
        res.status(400).json({ error: 'reservation_not_available' });
        return;
      }

      const bookingForEmail: BookingRecord = {
        unitId,
        name: reservation.name,
        headcount,
        startTime: Timestamp.fromDate(startTime),
        endTime: Timestamp.fromDate(endTime),
        contact: {
          phoneE164: reservation.contact?.phoneE164 || '',
          email: String(reservation.contact?.email || '').toLowerCase(),
        },
        locale: reservation.locale || 'hu',
        status,
        createdAt: Timestamp.now(),
        referenceCode: createResult.bookingId,
        reservationMode,
        occasion: reservation.occasion || '',
        source: reservation.source || '',
        customData: reservation.customData || {},
        adminActionToken: adminActionToken || undefined,
      };

      try {
        const decision = await computeAllocationDecisionForBooking({
          unitId,
          bookingId: createResult.bookingId,
          startDate: startTime,
          endDate: endTime,
          partySize: headcount,
        });
        await writeAllocationDecisionLogForBooking({
          unitId,
          bookingId: createResult.bookingId,
          startDate: startTime,
          endDate: endTime,
          partySize: headcount,
          selectedZoneId: decision.zoneId ?? null,
          selectedTableIds: decision.tableIds,
          reason: decision.reason,
          allocationMode: decision.allocationMode ?? null,
          allocationStrategy: decision.allocationStrategy ?? null,
          snapshot: decision.snapshot ?? null,
          algoVersion: 'alloc-v1',
          source: 'bookingSubmit',
        });
      } catch (err) {
        logger.warn('guestCreateReservation allocation log failed', {
          unitId,
          bookingId: createResult.bookingId,
          err,
        });
      }

      const unitName = await getUnitName(unitId);
      await Promise.all([
        sendGuestCreatedEmail(
          unitId,
          bookingForEmail,
          unitName,
          createResult.bookingId,
          manageToken
        ),
        sendAdminCreatedEmail(
          unitId,
          bookingForEmail,
          unitName,
          createResult.bookingId,
          adminActionToken || undefined
        ),
      ]);

        const isEmulator =
          process.env.FUNCTIONS_EMULATOR === 'true' ||
          process.env.FIREBASE_EMULATOR_HUB;

          res.status(200).json({
          ...createResult,
          manageToken,
          ...(isEmulator ? { adminActionToken } : {}),
      });
    } catch (err: any) {
      if (err instanceof Error && err.message === 'CAPACITY_FULL') {
        res.status(409).json({ error: 'capacity_full' });
        return;
      }
      logger.error('guestCreateReservation error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

export const guestGetReservation = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set(['unitId', 'reservationId', 'manageToken']);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, reservationId, manageToken } = body;
      if (
        typeof unitId !== 'string' ||
        typeof reservationId !== 'string' ||
        typeof manageToken !== 'string'
      ) {
        res.status(400).json({ error: 'unitId, reservationId és token kötelező' });
        return;
      }

      try {
        await enforceRateLimit(unitId, req);
      } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMIT') {
          res.status(429).json({ error: 'Túl sok kérés' });
          return;
        }
        throw err;
      }

      const docRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .doc(reservationId);
      const bookingSnap = await docRef.get();
      if (!bookingSnap.exists) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      const booking = bookingSnap.data() || {};
      const manageTokenHash = hashManageToken(manageToken);
      const hasHash = typeof booking.manageTokenHash === 'string' && booking.manageTokenHash;
      const legacyMatch = !hasHash && manageToken === reservationId;
      if (!legacyMatch && booking.manageTokenHash !== manageTokenHash) {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }

      const unitName = await getUnitName(unitId);
      const startTime = booking.startTime?.toDate
        ? booking.startTime.toDate()
        : booking.startTime instanceof Date
        ? booking.startTime
        : null;
      const endTime = booking.endTime?.toDate
        ? booking.endTime.toDate()
        : booking.endTime instanceof Date
        ? booking.endTime
        : null;
      const adminActionExpiresAt = booking.adminActionExpiresAt?.toDate
        ? booking.adminActionExpiresAt.toDate()
        : booking.adminActionExpiresAt instanceof Date
        ? booking.adminActionExpiresAt
        : null;
      const adminActionUsedAt = booking.adminActionUsedAt?.toDate
        ? booking.adminActionUsedAt.toDate()
        : booking.adminActionUsedAt instanceof Date
        ? booking.adminActionUsedAt
        : null;

      res.status(200).json({
        id: bookingSnap.id,
        unitId,
        unitName,
        name: booking.name || '',
        headcount: booking.headcount || 0,
        startTimeMs: startTime ? startTime.getTime() : null,
        endTimeMs: endTime ? endTime.getTime() : null,
        preferredTimeSlot: booking.preferredTimeSlot ?? null,
        seatingPreference: booking.seatingPreference ?? 'any',
        status: booking.status || 'pending',
        locale: booking.locale || 'hu',
        occasion: booking.occasion || '',
        source: booking.source || '',
        referenceCode: booking.referenceCode || bookingSnap.id,
        cancelReason: booking.cancelReason || '',
        cancelledBy: booking.cancelledBy || null,
        contact: booking.contact || {},
        adminActionTokenHash: booking.adminActionTokenHash || null,
        adminActionExpiresAtMs: adminActionExpiresAt
          ? adminActionExpiresAt.getTime()
          : null,
        adminActionUsedAtMs: adminActionUsedAt ? adminActionUsedAt.getTime() : null,
      });
    } catch (err) {
      logger.error('guestGetReservation error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

export const adminHandleReservationAction = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set([
        'unitId',
        'reservationId',
        'adminToken',
        'action',
      ]);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, reservationId, adminToken, action } = body;
      if (
        typeof unitId !== 'string' ||
        typeof reservationId !== 'string' ||
        typeof adminToken !== 'string' ||
        (action !== 'approve' && action !== 'reject')
      ) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const docRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .doc(reservationId);

      try {
        await enforceRateLimit(unitId, req);
      } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMIT') {
          res.status(429).json({ error: 'Túl sok kérés' });
          return;
        }
        throw err;
      }

      await db.runTransaction(async transaction => {
        const snap = await transaction.get(docRef);
        if (!snap.exists) {
          throw new Error('NOT_FOUND');
        }
        const booking = snap.data() || {};
        const tokenHash = hashAdminActionToken(adminToken);
        const expiresAt = booking.adminActionExpiresAt?.toDate
          ? booking.adminActionExpiresAt.toDate()
          : booking.adminActionExpiresAt instanceof Date
          ? booking.adminActionExpiresAt
          : null;
        const usedAt = booking.adminActionUsedAt?.toDate
          ? booking.adminActionUsedAt.toDate()
          : booking.adminActionUsedAt instanceof Date
          ? booking.adminActionUsedAt
          : null;

        if (
          !booking.adminActionTokenHash ||
          booking.adminActionTokenHash !== tokenHash
        ) {
          throw new Error('NOT_FOUND');
        }

        if (expiresAt && expiresAt.getTime() < Date.now()) {
          throw new Error('NOT_FOUND');
        }

        if (usedAt) {
          throw new Error('NOT_FOUND');
        }

        if (booking.status && booking.status !== 'pending') {
          throw new Error('NOT_FOUND');
        }

        const bookingStart = booking.startTime?.toDate
          ? booking.startTime.toDate()
          : booking.startTime instanceof Date
          ? booking.startTime
          : null;
        const bookingDateKey = bookingStart ? toDateKey(bookingStart) : toDateKey(new Date());

        const status = action === 'approve' ? 'confirmed' : 'cancelled';
        await applyCapacityLedgerTx({
          transaction,
          db,
          unitId,
          reservationRef: docRef,
          reservationData: booking,
          nextStatus: status,
          nextDateKey: bookingDateKey,
          nextHeadcount: Number(booking.headcount || 0),
          mutationTraceId: `admin-action-${docRef.id}-${status}`,
        });

        const update: Record<string, any> = {
          status,
          adminActionUsedAt: FieldValue.serverTimestamp(),
          adminActionHandledAt: FieldValue.serverTimestamp(),
          adminActionSource: 'email',
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (status === 'cancelled') {
          update.cancelledBy = 'admin';
          update.cancelledAt = FieldValue.serverTimestamp();
        }

        transaction.update(docRef, update);
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'NOT_FOUND') {
          res.status(404).json({ error: 'Foglalás nem található' });
          return;
        }
      }
      logger.error('adminHandleReservationAction error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);




export const adminOverrideDailyCapacity = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.replace('Bearer ', '').trim();
      const decoded = await admin.auth().verifyIdToken(token);
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.exists) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const userData = userSnap.data() || {};
      const role = userData.role as string | undefined;
      const unitIds = (userData.unitIds || userData.unitIDs || []) as string[];

      const { unitId, dateKey, newLimit } = req.body || {};
      if (!unitId || !dateKey || typeof newLimit !== 'number' || Number.isNaN(newLimit)) {
        res.status(400).json({ error: 'unitId, dateKey és newLimit kötelező' });
        return;
      }

      const canManage =
        role === 'Admin' || (role === 'Unit Admin' && unitIds.includes(unitId));
      if (!canManage) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const capacityRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_capacity')
        .doc(dateKey);

      const result = await db.runTransaction(async (transaction) => {
        const capacitySnap = await transaction.get(capacityRef);
        const count = capacitySnap.exists
          ? (capacitySnap.data()?.count as number) || 0
          : 0;

        if (capacitySnap.exists) {
          transaction.update(capacityRef, {
            limit: newLimit,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(capacityRef, {
            date: dateKey,
            count: 0,
            limit: newLimit,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        const logRef = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_logs')
          .doc();
        transaction.set(logRef, {
          type: 'capacity_override',
          unitId,
          createdAt: FieldValue.serverTimestamp(),
          createdByUserId: decoded.uid,
          createdByName:
            userData.name ||
            userData.fullName ||
            decoded.name ||
            decoded.email ||
            'Ismeretlen felhasználó',
          source: 'internal',
          message: `Daily capacity changed to ${newLimit}.`,
          date: dateKey,
        });

        return {
          status: newLimit < count ? 'OVERBOOKED' : 'UPDATED',
          count,
          limit: newLimit,
        };
      });

      res.status(200).json(result);
    } catch (err) {
      logger.error('adminOverrideDailyCapacity error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

export const adminSetReservationAllocationOverride = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.replace('Bearer ', '').trim();
      const decoded = await admin.auth().verifyIdToken(token);
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.exists) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const userData = userSnap.data() || {};
      const role = userData.role as string | undefined;
      const unitIds = (userData.unitIds || userData.unitIDs || []) as string[];

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set(['unitId', 'reservationId', 'override']);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, reservationId, override } = body;
      if (!unitId || !reservationId || typeof override !== 'object' || !override) {
        res.status(400).json({ error: 'unitId, reservationId és override kötelező' });
        return;
      }

      const canManage =
        role === 'Admin' || (role === 'Unit Admin' && unitIds.includes(unitId));
      if (!canManage) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const enabled = Boolean((override as any).enabled);
      const timeSlot = normalizePreferredTimeSlot((override as any).timeSlot);
      const zoneId = normalizeAllocationText((override as any).zoneId, 128);
      const tableGroup = normalizeAllocationText((override as any).tableGroup, 128);
      const note = normalizeAllocationText((override as any).note, 512);
      const tableIds = Array.isArray((override as any).tableIds)
        ? Array.from(
            new Set(
              (override as any).tableIds
                .map((tableId: unknown) => normalizeAllocationText(tableId, 128))
                .filter(Boolean)
            )
          ) as string[]
        : null;

      const reservationRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .doc(reservationId);

      await db.runTransaction(async transaction => {
        const reservationSnap = await transaction.get(reservationRef);
        if (!reservationSnap.exists) {
          throw new Error('NOT_FOUND');
        }

        const reservationData = reservationSnap.data() || {};
        const startTime = reservationData.startTime?.toDate
          ? reservationData.startTime.toDate()
          : reservationData.startTime instanceof Date
          ? reservationData.startTime
          : null;
        if (!startTime) {
          throw new Error('INVALID_DATE');
        }

        const allocationIntentData = {
          ...(reservationData.allocationIntent || {}),
          timeSlot: reservationData.allocationIntent?.timeSlot ?? null,
          zoneId: reservationData.allocationIntent?.zoneId ?? null,
          tableGroup: reservationData.allocationIntent?.tableGroup ?? null,
        } as AllocationIntent;

        const allocationOverride: AllocationOverride = {
          enabled,
          timeSlot: timeSlot ?? null,
          zoneId: zoneId ?? null,
          tableGroup: tableGroup ?? null,
          tableIds,
          note,
        };

        const clearedOverride: AllocationOverride = {
          enabled: false,
          timeSlot: null,
          zoneId: null,
          tableGroup: null,
          tableIds: null,
          note: null,
        };
        const allocationFinal = enabled
          ? {
              ...buildAllocationFinal(allocationIntentData, allocationOverride),
              locked: true,
            }
          : {
              ...buildAllocationFinal(allocationIntentData, clearedOverride),
              locked: false,
            };

        transaction.update(reservationRef, {
          allocationOverride,
          allocationOverrideSetAt: FieldValue.serverTimestamp(),
          allocationOverrideSetByUid: decoded.uid,
          // Admin action is authoritative: must be able to lock/unlock allocationFinal.
          allocationFinal,
          allocationFinalComputedAt: FieldValue.serverTimestamp(),
        });

        const logRef = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_logs')
          .doc();
        transaction.set(logRef, {
          bookingId: reservationId,
          unitId,
          type: 'allocation_override_set',
          createdAt: FieldValue.serverTimestamp(),
          createdByUserId: decoded.uid,
          createdByName:
            userData.name ||
            userData.fullName ||
            decoded.name ||
            decoded.email ||
            'Ismeretlen felhasználó',
          source: 'admin',
          message: enabled
            ? 'Allocation override beállítva.'
            : 'Allocation override kikapcsolva.',
          note: note || '',
        });

        const dateKey = toDateKey(startTime);
        const capacityRef = db
          .collection('units')
          .doc(unitId)
          .collection('reservation_capacity')
          .doc(dateKey);
        transaction.set(
          capacityRef,
          {
            date: dateKey,
            capacityNeedsRecalc: true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

      });

      res.status(200).json({ ok: true });
    } catch (err: any) {
      if (err instanceof Error && err.message === 'NOT_FOUND') {
        res.status(404).json({ error: 'Foglalás nem található' });
        return;
      }
      if (err instanceof Error && err.message === 'INVALID_DATE') {
        res.status(400).json({ error: 'Érvénytelen foglalási dátum' });
        return;
      }
      logger.error('adminSetReservationAllocationOverride error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

export const adminSetReservationOverride = onCall(
  { region: REGION },
  async request => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Unauthorized');
      }

      const data = request.data || {};
      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
      }

      const allowedKeys = new Set(['unitId', 'reservationId', 'payload']);
      const keys = Object.keys(data);
      if (keys.some(key => !allowedKeys.has(key))) {
        throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
      }

      const unitId = data.unitId;
      const reservationId = data.reservationId;
      const payload = data.payload;

      if (typeof unitId !== 'string' || typeof reservationId !== 'string') {
        throw new HttpsError(
          'invalid-argument',
          'unitId és reservationId kötelező'
        );
      }

      if (typeof payload !== 'object' || Array.isArray(payload) || !payload) {
        throw new HttpsError('invalid-argument', 'payload kötelező');
      }

      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'Forbidden');
      }

      const userData = userSnap.data() || {};
      const role = userData.role as string | undefined;
      const unitIds = (userData.unitIds || userData.unitIDs || []) as string[];

      const canManage =
        role === 'Admin' || (role === 'Unit Admin' && unitIds.includes(unitId));
      if (!canManage) {
        throw new HttpsError('permission-denied', 'Forbidden');
      }

      const hasForcedZoneId = Object.prototype.hasOwnProperty.call(
        payload,
        'forcedZoneId'
      );
      const hasForcedTableIds = Object.prototype.hasOwnProperty.call(
        payload,
        'forcedTableIds'
      );
      const hasNote = Object.prototype.hasOwnProperty.call(payload, 'note');

      const rawForcedZoneId = (payload as any).forcedZoneId;
      const rawNote = (payload as any).note;

      if (
        (hasForcedZoneId &&
          rawForcedZoneId !== null &&
          typeof rawForcedZoneId !== 'string') ||
        (hasNote && rawNote !== null && typeof rawNote !== 'string')
      ) {
        throw new HttpsError(
          'invalid-argument',
          'forcedZoneId és note csak string lehet'
        );
      }

      const forcedZoneId =
        rawForcedZoneId === null
          ? null
          : normalizeOptionalText(rawForcedZoneId);

      let note: string | null | undefined;
      if (rawNote === null) {
        note = null;
      } else if (typeof rawNote === 'string') {
        const trimmedNote = rawNote.trim();
        if (trimmedNote) {
          if (trimmedNote.length > 280) {
            throw new HttpsError(
              'invalid-argument',
              'note max 280 karakter lehet'
            );
          }
          note = trimmedNote;
        } else {
          note = undefined;
        }
      }

      let forcedTableIds: string[] | undefined;
      let forcedTableIdsShouldDelete = false;
      if (hasForcedTableIds) {
        const rawTableIds = (payload as any).forcedTableIds;
        if (rawTableIds === null) {
          forcedTableIdsShouldDelete = true;
        } else if (!Array.isArray(rawTableIds)) {
          throw new HttpsError(
            'invalid-argument',
            'forcedTableIds csak string tömb lehet'
          );
        } else if (rawTableIds.some(value => typeof value !== 'string')) {
          throw new HttpsError(
            'invalid-argument',
            'forcedTableIds csak string tömb lehet'
          );
        } else {
          const uniqueIds = Array.from(
            new Set(
              rawTableIds.map(value => value.trim()).filter(Boolean)
            )
          );
          if (uniqueIds.length > 20) {
            throw new HttpsError(
              'invalid-argument',
              'forcedTableIds max 20 elem lehet'
            );
          }
          forcedTableIds = uniqueIds.length ? uniqueIds : undefined;
        }
      }

      const hasClearAction =
        (hasForcedZoneId && rawForcedZoneId === null) ||
        (hasNote && rawNote === null) ||
        (hasForcedTableIds && forcedTableIdsShouldDelete);
      const hasSetAction =
        (hasForcedZoneId && forcedZoneId) ||
        (hasNote && note) ||
        (hasForcedTableIds && !!forcedTableIds);

      if (forcedTableIds && !forcedZoneId) {
        throw new HttpsError(
          'invalid-argument',
          'forcedTableIds esetén forcedZoneId kötelező'
        );
      }

      if (hasSetAction && forcedTableIds) {
        const zoneId = forcedZoneId;
        if (!zoneId) {
          throw new HttpsError(
            'invalid-argument',
            'forcedTableIds esetén forcedZoneId kötelező'
          );
        }

        const zoneSnap = await db
          .collection('units')
          .doc(unitId)
          .collection('zones')
          .doc(zoneId)
          .get();
        if (!zoneSnap.exists) {
          throw new HttpsError(
            'invalid-argument',
            'forcedZoneId ismeretlen'
          );
        }
        const zoneData = zoneSnap.data() || {};
        if (zoneData.isActive === false) {
          throw new HttpsError(
            'invalid-argument',
            'forcedZoneId nem aktív'
          );
        }

        const tableRefs = forcedTableIds.map(tableId =>
          db
            .collection('units')
            .doc(unitId)
            .collection('tables')
            .doc(tableId)
        );
        const tableSnaps = await db.getAll(...tableRefs);
        const missingTable = tableSnaps.find(snapshot => !snapshot.exists);
        if (missingTable) {
          throw new HttpsError(
            'invalid-argument',
            'forcedTableIds ismeretlen asztalt tartalmaz'
          );
        }
        const mismatchedTable = tableSnaps.find(snapshot => {
          const data = snapshot.data() || {};
          if (data.isActive === false) {
            return true;
          }
          const tableZoneId = typeof data.zoneId === 'string' ? data.zoneId : '';
          return tableZoneId !== zoneId;
        });
        if (mismatchedTable) {
          throw new HttpsError(
            'invalid-argument',
            'forcedTableIds nem a megadott zónához tartozik'
          );
        }
      }

      if (hasSetAction && forcedZoneId && !forcedTableIds) {
        const zoneSnap = await db
          .collection('units')
          .doc(unitId)
          .collection('zones')
          .doc(forcedZoneId)
          .get();
        if (!zoneSnap.exists) {
          throw new HttpsError(
            'invalid-argument',
            'forcedZoneId ismeretlen'
          );
        }
        const zoneData = zoneSnap.data() || {};
        if (zoneData.isActive === false) {
          throw new HttpsError(
            'invalid-argument',
            'forcedZoneId nem aktív'
          );
        }
      }

      const overrideRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_overrides')
        .doc(reservationId);

      const logRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_logs')
        .doc();

      const overrideData: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
        ...(forcedZoneId ? { forcedZoneId } : {}),
        ...(forcedTableIds ? { forcedTableIds } : {}),
        ...(note ? { note } : {}),
      };
      if (hasForcedZoneId && forcedZoneId === null) {
        overrideData.forcedZoneId = FieldValue.delete();
      }
      if (hasNote && note === null) {
        overrideData.note = FieldValue.delete();
      }
      if (hasForcedTableIds && forcedTableIdsShouldDelete) {
        overrideData.forcedTableIds = FieldValue.delete();
      }

      const meta: Record<string, unknown> = {};
      if (hasSetAction) {
        if (forcedZoneId) meta.forcedZoneId = forcedZoneId;
        if (forcedTableIds) meta.forcedTableIds = forcedTableIds;
        if (note) meta.note = note;
      }

      const logData: Record<string, unknown> = {
        bookingId: reservationId,
        unitId,
        type: 'allocation_override_set',
        createdAt: FieldValue.serverTimestamp(),
        createdByUserId: request.auth.uid,
        createdByName:
          userData.name ||
          userData.fullName ||
          request.auth.token?.name ||
          request.auth.token?.email ||
          'Ismeretlen felhasználó',
        source: 'admin',
        message: hasClearAction && !hasSetAction
          ? 'Allokáció felülírás mezők törölve.'
          : 'Allokáció felülírás mentve.',
        ...(hasSetAction && Object.keys(meta).length ? { meta } : {}),
      };

      const batch = db.batch();
      batch.set(overrideRef, overrideData, { merge: true });
      batch.set(logRef, logData);
      await batch.commit();

      return { ok: true };
    } catch (err) {
      if (err instanceof HttpsError) {
        throw err;
      }
      logger.error('adminSetReservationOverride error', err);
      throw new HttpsError('internal', 'Szerverhiba');
    }
  }
);

export const adminClearReservationOverride = onCall(
  { region: REGION },
  async request => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Unauthorized');
      }

      const data = request.data || {};
      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
      }

      const allowedKeys = new Set(['unitId', 'reservationId']);
      const keys = Object.keys(data);
      if (keys.some(key => !allowedKeys.has(key))) {
        throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
      }

      const unitId = data.unitId;
      const reservationId = data.reservationId;

      if (typeof unitId !== 'string' || typeof reservationId !== 'string') {
        throw new HttpsError(
          'invalid-argument',
          'unitId és reservationId kötelező'
        );
      }

      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      if (!userSnap.exists) {
        throw new HttpsError('permission-denied', 'Forbidden');
      }

      const userData = userSnap.data() || {};
      const role = userData.role as string | undefined;
      const unitIds = (userData.unitIds || userData.unitIDs || []) as string[];

      const canManage =
        role === 'Admin' || (role === 'Unit Admin' && unitIds.includes(unitId));
      if (!canManage) {
        throw new HttpsError('permission-denied', 'Forbidden');
      }

      const overrideRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_overrides')
        .doc(reservationId);

      const logRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_logs')
        .doc();

      const logData: Record<string, unknown> = {
        bookingId: reservationId,
        unitId,
        type: 'allocation_override_set',
        createdAt: FieldValue.serverTimestamp(),
        createdByUserId: request.auth.uid,
        createdByName:
          userData.name ||
          userData.fullName ||
          request.auth.token?.name ||
          request.auth.token?.email ||
          'Ismeretlen felhasználó',
        source: 'admin',
        message: 'Allokáció felülírás törölve.',
      };

      const batch = db.batch();
      batch.delete(overrideRef);
      batch.set(logRef, logData);
      await batch.commit();

      return { ok: true };
    } catch (err) {
      if (err instanceof HttpsError) {
        throw err;
      }
      logger.error('adminClearReservationOverride error', err);
      throw new HttpsError('internal', 'Szerverhiba');
    }
  }
);

export const logAllocationEvent = onCall({ region: REGION }, async request => {
  if (!request.auth?.uid) {
    logger.warn('logAllocationEvent unauthenticated');
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data || {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
  }

  const allowedKeys = new Set([
    'unitId',
    'bookingId',
    'startTimeISO',
    'endTimeISO',
    'partySize',
    'zoneId',
    'tableIds',
    'reason',
    'allocationMode',
    'allocationStrategy',
    'snapshot',
  ]);
  const keys = Object.keys(data);
  if (keys.some(key => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
  }

  const unitId = data.unitId;
  const startTimeISO = data.startTimeISO;
  const endTimeISO = data.endTimeISO;
  const partySize = data.partySize;
  const tableIds = data.tableIds;

  if (
    typeof unitId !== 'string' ||
    !unitId.trim() ||
    typeof startTimeISO !== 'string' ||
    typeof endTimeISO !== 'string'
  ) {
    throw new HttpsError('invalid-argument', 'unitId és időpontok kötelezőek');
  }

  const startDate = new Date(startTimeISO);
  const endDate = new Date(endTimeISO);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HttpsError('invalid-argument', 'Érvénytelen időpont');
  }

  if (typeof partySize !== 'number' || Number.isNaN(partySize) || partySize <= 0) {
    throw new HttpsError('invalid-argument', 'partySize kötelező');
  }

  if (!Array.isArray(tableIds) || tableIds.some(id => typeof id !== 'string')) {
    throw new HttpsError('invalid-argument', 'tableIds kötelező');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!userSnap.exists) {
    logger.warn('logAllocationEvent missing user doc', { uid: request.auth.uid });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  const userData = userSnap.data() || {};
  const role = userData.role as string | undefined;
  const normalizedUnits = Array.from(
    new Set(
      [
        ...normalizeUnitIds(userData.unitIds),
        ...normalizeUnitIds(userData.unitIDs),
        ...normalizeUnitIds(userData.unitId),
      ].filter(Boolean)
    )
  );
  const canManage =
    role === 'Admin' ||
    ((role === 'Unit Admin' || role === 'Unit Leader') && normalizedUnits.includes(unitId));
  if (!canManage) {
    logger.warn('logAllocationEvent permission denied', {
      uid: request.auth.uid,
      role,
      unitId,
      normalizedUnits,
    });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  const snapshot = data.snapshot;
  const snapshotPayload =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? {
          overflowZonesCount:
            typeof snapshot.overflowZonesCount === 'number'
              ? snapshot.overflowZonesCount
              : null,
          zonePriorityCount:
            typeof snapshot.zonePriorityCount === 'number' ? snapshot.zonePriorityCount : null,
          emergencyZonesCount:
            typeof snapshot.emergencyZonesCount === 'number'
              ? snapshot.emergencyZonesCount
              : null,
        }
      : null;

  await db.collection('units').doc(unitId).collection('allocation_logs').add({
    createdAt: FieldValue.serverTimestamp(),
    createdByUserId: request.auth.uid,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId : null,
    bookingStartTime: Timestamp.fromDate(startDate),
    bookingEndTime: Timestamp.fromDate(endDate),
    partySize,
    selectedZoneId: typeof data.zoneId === 'string' ? data.zoneId : null,
    selectedTableIds: tableIds,
    reason: typeof data.reason === 'string' ? data.reason : null,
    allocationMode: typeof data.allocationMode === 'string' ? data.allocationMode : null,
    allocationStrategy:
      typeof data.allocationStrategy === 'string' ? data.allocationStrategy : null,
    snapshot: snapshotPayload,
    source: 'seatingSuggestionService',
  });

  logger.info('logAllocationEvent write ok', {
    unitId,
    reason: typeof data.reason === 'string' ? data.reason : null,
    tableIdsCount: tableIds.length,
  });

  return { ok: true };
});

export const logAllocationDecisionForBooking = onCall({ region: REGION }, async request => {
  if (!request.auth?.uid) {
    logger.warn('logAllocationDecisionForBooking unauthenticated');
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data || {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
  }

  const allowedKeys = new Set([
    'unitId',
    'bookingId',
    'startTimeISO',
    'endTimeISO',
    'partySize',
    'zoneId',
    'tableIds',
    'reason',
    'allocationMode',
    'allocationStrategy',
    'snapshot',
    'algoVersion',
  ]);
  const keys = Object.keys(data);
  if (keys.some(key => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'Érvénytelen kérés');
  }

  const unitId = data.unitId;
  const bookingId = data.bookingId;
  const startTimeISO = data.startTimeISO;
  const endTimeISO = data.endTimeISO;
  const partySize = data.partySize;
  const tableIds = data.tableIds;
  const algoVersion = data.algoVersion;
  const normalizedReason =
    typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : 'UNKNOWN';
  const normalizedZoneId =
    typeof data.zoneId === 'string' && data.zoneId.trim() ? data.zoneId.trim() : null;
  const normalizedMode =
    data.allocationMode === 'capacity' ||
    data.allocationMode === 'floorplan' ||
    data.allocationMode === 'hybrid'
      ? data.allocationMode
      : null;
  const normalizedStrategy =
    data.allocationStrategy === 'bestFit' ||
    data.allocationStrategy === 'minWaste' ||
    data.allocationStrategy === 'priorityZoneFirst'
      ? data.allocationStrategy
      : null;

  if (
    typeof unitId !== 'string' ||
    !unitId.trim() ||
    typeof bookingId !== 'string' ||
    !bookingId.trim() ||
    typeof startTimeISO !== 'string' ||
    typeof endTimeISO !== 'string'
  ) {
    throw new HttpsError('invalid-argument', 'unitId, bookingId és időpontok kötelezőek');
  }

  const startDate = new Date(startTimeISO);
  const endDate = new Date(endTimeISO);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new HttpsError('invalid-argument', 'Érvénytelen időpont');
  }

  if (typeof partySize !== 'number' || Number.isNaN(partySize) || partySize <= 0) {
    throw new HttpsError('invalid-argument', 'partySize kötelező');
  }

  if (!Array.isArray(tableIds) || tableIds.some(id => typeof id !== 'string')) {
    throw new HttpsError('invalid-argument', 'tableIds kötelező');
  }

  if (typeof algoVersion !== 'string' || !algoVersion.trim()) {
    throw new HttpsError('invalid-argument', 'algoVersion kötelező');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!userSnap.exists) {
    logger.warn('logAllocationDecisionForBooking missing user doc', {
      uid: request.auth.uid,
    });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  const userData = userSnap.data() || {};
  const role = userData.role as string | undefined;
  const normalizedUnits = Array.from(
    new Set(
      [
        ...normalizeUnitIds(userData.unitIds),
        ...normalizeUnitIds(userData.unitIDs),
        ...normalizeUnitIds(userData.unitId),
      ].filter(Boolean)
    )
  );
  const canManage =
    role === 'Admin' ||
    ((role === 'Unit Admin' || role === 'Unit Leader') && normalizedUnits.includes(unitId));
  if (!canManage) {
    logger.warn('logAllocationDecisionForBooking permission denied', {
      uid: request.auth.uid,
      role,
      unitId,
      normalizedUnits,
    });
    throw new HttpsError('permission-denied', 'Forbidden');
  }

  const snapshot = data.snapshot;
  const snapshotPayload =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? {
          overflowZonesCount:
            typeof snapshot.overflowZonesCount === 'number'
              ? snapshot.overflowZonesCount
              : null,
          zonePriorityCount:
            typeof snapshot.zonePriorityCount === 'number' ? snapshot.zonePriorityCount : null,
          emergencyZonesCount:
            typeof snapshot.emergencyZonesCount === 'number'
              ? snapshot.emergencyZonesCount
              : null,
        }
      : null;

  const { docId, eventId } = await writeAllocationDecisionLogForBooking({
    unitId,
    bookingId,
    startDate,
    endDate,
    partySize,
    selectedZoneId: normalizedZoneId,
    selectedTableIds: tableIds,
    reason: normalizedReason,
    allocationMode: normalizedMode,
    allocationStrategy: normalizedStrategy,
    snapshot: snapshotPayload,
    algoVersion,
    source: 'bookingSubmit',
  });

  logger.info('logAllocationDecisionForBooking write ok', { unitId, bookingId, docId, eventId });

  return { ok: true, eventId };
});

export const adminRecalcReservationCapacityDay = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).send('Only POST allowed');
        return;
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.replace('Bearer ', '').trim();
      const decoded = await admin.auth().verifyIdToken(token);
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      if (!userSnap.exists) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const userData = userSnap.data() || {};
      const role = userData.role as string | undefined;
      const unitIds = (userData.unitIds || userData.unitIDs || []) as string[];

      const body = req.body || {};
      if (typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }
      const allowedKeys = new Set(['unitId', 'dateKey']);
      const keys = Object.keys(body);
      if (keys.some(key => !allowedKeys.has(key))) {
        res.status(400).json({ error: 'Érvénytelen kérés' });
        return;
      }

      const { unitId, dateKey } = body;
      if (!unitId || !dateKey || typeof dateKey !== 'string') {
        res.status(400).json({ error: 'unitId és dateKey kötelező' });
        return;
      }

      const canManage =
        role === 'Admin' || (role === 'Unit Admin' && unitIds.includes(unitId));
      if (!canManage) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const dayStart = new Date(`${dateKey}T00:00:00`);
      const dayEnd = new Date(`${dateKey}T23:59:59.999`);
      if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
        res.status(400).json({ error: 'Érvénytelen dateKey' });
        return;
      }

      const bookingsSnap = await db
        .collection('units')
        .doc(unitId)
        .collection('reservations')
        .where('startTime', '>=', Timestamp.fromDate(dayStart))
        .where('startTime', '<=', Timestamp.fromDate(dayEnd))
        .get();

      let totalCount = 0;
      const byTimeSlot: Record<string, number> = {};
      const byZone: Record<string, number> = {};
      const byTableGroup: Record<string, number> = {};

      bookingsSnap.docs.forEach(docSnap => {
        const data = docSnap.data() || {};
        if (data.status === 'cancelled') return;
        const headcount = Number(data.headcount || 0);
        if (!headcount || Number.isNaN(headcount)) return;
        totalCount += headcount;

        const allocationFinalData = data.allocationFinal || {};
        const allocationIntentData = data.allocationIntent || {};
        const timeSlot = allocationFinalData.timeSlot ?? allocationIntentData.timeSlot;
        const zoneId = allocationFinalData.zoneId ?? allocationIntentData.zoneId;
        const tableGroup = allocationFinalData.tableGroup ?? allocationIntentData.tableGroup;

        if (timeSlot) {
          byTimeSlot[timeSlot] = (byTimeSlot[timeSlot] || 0) + headcount;
        }
        if (zoneId) {
          byZone[zoneId] = (byZone[zoneId] || 0) + headcount;
        }
        if (tableGroup) {
          byTableGroup[tableGroup] = (byTableGroup[tableGroup] || 0) + headcount;
        }
      });

      const capacityRef = db
        .collection('units')
        .doc(unitId)
        .collection('reservation_capacity')
        .doc(dateKey);

      await capacityRef.set(
        {
          date: dateKey,
          count: totalCount,
          totalCount,
          byTimeSlot,
          byZone,
          byTableGroup,
          capacityNeedsRecalc: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db
        .collection('units')
        .doc(unitId)
        .collection('reservation_logs')
        .add({
          type: 'capacity_recalc',
          unitId,
          createdAt: FieldValue.serverTimestamp(),
          createdByUserId: decoded.uid,
          createdByName:
            userData.name ||
            userData.fullName ||
            decoded.name ||
            decoded.email ||
            'Ismeretlen felhasználó',
          source: 'admin',
          message: `Napi kapacitás újraszámolva (${dateKey}).`,
          date: dateKey,
        });

      res.status(200).json({ ok: true, totalCount });
    } catch (err) {
      logger.error('adminRecalcReservationCapacityDay error', err);
      res.status(500).json({ error: 'Szerverhiba' });
    }
  }
);

interface BookingRecord {
  unitId?: string;
  name?: string;
  headcount?: number;
  occasion?: string;
  source?: string;
  preferredTimeSlot?: string | null;
  seatingPreference?: SeatingPreference;
  allocationIntent?: AllocationIntent;
  startTime: FirebaseFirestore.Timestamp | Date;
  endTime?: FirebaseFirestore.Timestamp | Date | null;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt?: FirebaseFirestore.Timestamp | Date;
  notes?: string;
  phone?: string;
  email?: string;
  contact?: {
    phoneE164?: string;
    email?: string;
  };
  locale?: 'hu' | 'en';
  cancelledAt?: FirebaseFirestore.Timestamp | Date;
  cancelReason?: string;
  referenceCode?: string;
  reservationMode?: 'auto' | 'request';
  adminActionToken?: string;
  adminActionTokenHash?: string;
  adminActionHandledAt?: FirebaseFirestore.Timestamp | Date;
  adminActionSource?: 'email' | 'manual';
  cancelledBy?: 'guest' | 'admin' | 'system';
  customData?: Record<string, any>;
  manageTokenHash?: string;
  skipCreateEmails?: boolean;
}

interface EmailSettingsDocument {
  enabledTypes?: Record<string, boolean>;
  adminRecipients?: Record<string, string[]>;
  templateOverrides?: Record<string, { subject: string; html: string }>;
  adminDefaultEmail?: string;
}

interface CustomSelectField {
  id: string;
  label: string;
  options?: string[];
}

interface ReservationSettings {
  notificationEmails?: string[];
  guestForm?: {
    customSelects?: CustomSelectField[];
  };
  publicBaseUrl?: string;
  themeMode?: 'light' | 'dark';
  uiTheme?: 'minimal_glass' | 'elegant' | 'bubbly';
}

const decisionLabels: Record<
  'hu' | 'en',
  { approved: string; rejected: string; cancelled: string }
> = {
  hu: {
    approved: 'Elfogadva',
    rejected: 'Elutasítva',
    cancelled: 'Lemondva vendég által',
  },
  en: {
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled by guest',
  },
};

const defaultTemplates = {
  booking_created_guest: {
    subject: 'Foglalás visszaigazolás: {{bookingDate}} {{bookingTimeFrom}}',
    html: `
      <h2>Foglalásodat megkaptuk</h2>
      <p>Kedves {{guestName}}!</p>
      <p>Köszönjük a foglalást a(z) <strong>{{unitName}}</strong> egységbe.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        {{#if occasion}}<li><strong>Alkalom:</strong> {{occasion}}</li>{{/if}}
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>Hamarosan visszajelzünk a foglalás státuszáról.</p>
    `,
  },

  booking_created_admin: {
    subject:
      'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő) – {{guestName}}',
    html: `
      <h2>Új foglalási kérelem érkezett</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        {{#if occasion}}<li><strong>Alkalom:</strong> {{occasion}}</li>{{/if}}
        {{#if notes}}<li><strong>Megjegyzés:</strong> {{notes}}</li>{{/if}}
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Ref: <strong>{{bookingRef}}</strong></p>
    `,
  },

  booking_status_updated_guest: {
    subject:
      'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
    html: `
      <h2>Foglalás frissítése</h2>
      <p>Kedves {{guestName}}!</p>
      <p>A(z) <strong>{{unitName}}</strong> egységnél leadott foglalásod státusza frissült.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Döntés:</strong> {{decisionLabel}}</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>Köszönjük a türelmedet!</p>
    `,
  },

  booking_cancelled_admin: {
    subject:
      'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <h2>Vendég lemondta a foglalást</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>A foglalás le lett mondva a vendég oldaláról.</p>
    `,
  },

  booking_modified_guest: {
    subject: 'Foglalás módosítva: {{bookingDate}} {{bookingTimeFrom}}',
    html: `
      <h2>Foglalás módosítva</h2>
      <p>Kedves {{guestName}}!</p>
      <p>A(z) <strong>{{unitName}}</strong> egységnél a foglalásod adatai módosultak.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
    `,
  },

  booking_modified_admin: {
    subject:
      'Foglalás módosítva (admin): {{bookingDate}} {{bookingTimeFrom}} – {{guestName}}',
    html: `
      <h2>Foglalás módosítva</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Ref: <strong>{{bookingRef}}</strong></p>
    `,
  },
};

const queuedEmailTemplates: Record<
  | "leave_request_created"
  | "leave_request_approved"
  | "leave_request_rejected"
  | "schedule_published"
  | "register_welcome",
  { subject: string; html: string }
> = {
  leave_request_created: {
    subject: "Új szabadságkérés: {{userName}}",
    html: `
      <h2>Új szabadságkérés érkezett</h2>
      <p><strong>Kérelmező:</strong> {{userName}}</p>
      <p><strong>Időszakok:</strong></p>
      <ul>
        {{#if dateRanges}}
          {{dateRanges}}
        {{/if}}
      </ul>
      {{#if note}}<p><strong>Megjegyzés:</strong> {{note}}</p>{{/if}}
    `,
  },
  leave_request_approved: {
    subject: "Szabadságkérelem elfogadva",
    html: `
      <h2>Szabadságkérelmedet elfogadtuk</h2>
      <p>Kedves {{firstName}}!</p>
      <p>A(z) {{startDate}} - {{endDate}} időszakra beadott kérelmed jóváhagyásra került.</p>
      {{#if approverName}}<p>Jóváhagyta: {{approverName}}</p>{{/if}}
    `,
  },
  leave_request_rejected: {
    subject: "Szabadságkérelem elutasítva",
    html: `
      <h2>Szabadságkérelmedet elutasítottuk</h2>
      <p>Kedves {{firstName}}!</p>
      <p>A(z) {{startDate}} - {{endDate}} időszakra beadott kérelmedet elutasítottuk.</p>
      {{#if approverName}}<p>Ellenőrizte: {{approverName}}</p>{{/if}}
    `,
  },
  schedule_published: {
    subject: "Új beosztás elérhető: {{weekLabel}}",
    html: `
      <h2>Új beosztás lett közzétéve</h2>
      <p><strong>Egység:</strong> {{unitName}}</p>
      <p><strong>Hét:</strong> {{weekLabel}}</p>
      <p><strong>Szerkesztő:</strong> {{editorName}}</p>
      <p><a href="{{url}}">Tekintsd meg a beosztást</a></p>
    `,
  },
  register_welcome: {
    subject: "Üdvözlünk a Mintleaf-ben, {{name}}!",
    html: `
      <h2>Köszönjük a regisztrációt, {{name}}!</h2>
      <p>Örülünk, hogy csatlakoztál.</p>
    `,
  },
};

type QueuedTemplateKey = keyof typeof queuedEmailTemplates;

type EmailQueueStatus = "pending" | "sent" | "error";

type EmailQueueTimestamp =
  | FirebaseFirestore.Timestamp
  | Date
  | FirebaseFirestore.FieldValue;

type EmailQueueLockFields = {
  // Lock is acquired by setting processingAt + processingBy; expires via processingExpiresAt.
  processingAt?: EmailQueueTimestamp;
  processingBy?: string;
  processingExpiresAt?: EmailQueueTimestamp;
};

type EmailQueueDoc = {
  typeId: QueuedTemplateKey;
  unitId: string | null;
  payload: Record<string, any>;
  status: EmailQueueStatus;
  createdAt?: EmailQueueTimestamp;
  sentAt?: EmailQueueTimestamp;
  attemptCount?: number;
  nextAttemptAt?: EmailQueueTimestamp | null;
  lastErrorAt?: EmailQueueTimestamp | null;
  lastErrorCode?: string | null;
  dlq?: boolean;
  dlqAt?: EmailQueueTimestamp;
  dlqReason?: string;
  errorMessage?: string;
} & EmailQueueLockFields;

const isQueuedTemplateKey = (value: unknown): value is QueuedTemplateKey =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(queuedEmailTemplates, value);

type UserAuthInfo = {
  role?: string;
  unitIds: string[];
  email?: string;
  firstName?: string;
  fullName?: string;
};

const getUserDocForAuth = async (uid: string): Promise<UserAuthInfo> => {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return { unitIds: [] };
  }
  const data = snap.data() || {};
  const unitIdsRaw = (data.unitIds || data.unitIDs || []) as unknown;
  const unitIds = Array.isArray(unitIdsRaw)
    ? unitIdsRaw.filter((id): id is string => typeof id === "string")
    : [];
  return {
    role: typeof data.role === "string" ? data.role : undefined,
    unitIds,
    email: typeof data.email === "string" ? data.email : undefined,
    firstName: typeof data.firstName === "string" ? data.firstName : undefined,
    fullName: typeof data.fullName === "string" ? data.fullName : undefined,
  };
};

const enqueueQueuedEmailInternal = async (
  type: unknown,
  unitId: string | null,
  payload: Record<string, any>
) => {
  // Sanity: only queuedEmailTemplates keys are accepted for queue writes.
  if (typeof type !== "string") {
    logger.warn("enqueue invalid template key", { type });
    return;
  }
  if (!isQueuedTemplateKey(type)) {
    logger.warn("enqueue invalid template key", { type });
    return;
  }
  const doc: EmailQueueDoc = {
    typeId: type,
    unitId,
    payload,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection("email_queue").add(doc);
};

export const enqueueQueuedEmail = onCall({ region: REGION }, async request => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Unauthorized");
  }

  const data = request.data || {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Érvénytelen kérés");
  }

  const allowedKeys = new Set(["type", "unitId", "payload"]);
  const keys = Object.keys(data);
  if (keys.some(key => !allowedKeys.has(key))) {
    throw new HttpsError("invalid-argument", "Érvénytelen kérés");
  }

  const { type, unitId, payload } = data as {
    type: unknown;
    unitId: unknown;
    payload: unknown;
  };

  if (unitId !== null && typeof unitId !== "string") {
    throw new HttpsError("invalid-argument", "Érvénytelen egység");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "payload kötelező");
  }

  if (typeof type !== "string") {
    throw new HttpsError("invalid-argument", "Érvénytelen típus");
  }

  const payloadValue = payload as Record<string, any>;
  const unitIdValue = typeof unitId === "string" ? unitId : null;
  const caller = await getUserDocForAuth(request.auth.uid);
  const isAdmin = caller.role === "Admin";
  const isUnitAdmin = caller.role === "Unit Admin";
  const canManageUnit = (unitToCheck: string | null) =>
    !!unitToCheck && (isAdmin || (isUnitAdmin && caller.unitIds.includes(unitToCheck)));
  const belongsToUnit = (unitToCheck: string | null) =>
    !!unitToCheck && caller.unitIds.includes(unitToCheck);

  const requireString = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !value.trim()) {
      throw new HttpsError("invalid-argument", `Érvénytelen ${field}`);
    }
    return value;
  };

  const validateAllowedPayloadKeys = (allowed: string[]) => {
    const allowedSet = new Set(allowed);
    const payloadKeys = Object.keys(payloadValue);
    if (payloadKeys.some(key => !allowedSet.has(key))) {
      throw new HttpsError("invalid-argument", "Érvénytelen payload mezők");
    }
  };

  let sanitizedPayload: Record<string, any>;
  let sanitizedUnitId: string | null = unitIdValue;

  switch (type) {
    case "register_welcome": {
      validateAllowedPayloadKeys(["name", "email"]);
      if (unitIdValue !== null) {
        throw new HttpsError("invalid-argument", "Érvénytelen egység");
      }
      const callerEmail = requireString(caller.email, "email");
      const callerName = requireString(caller.firstName || caller.fullName, "name");
      if (payloadValue.email !== callerEmail || payloadValue.name !== callerName) {
        throw new HttpsError("permission-denied", "Nem engedélyezett");
      }
      sanitizedPayload = { name: callerName, email: callerEmail };
      sanitizedUnitId = null;
      break;
    }
    case "leave_request_created": {
      validateAllowedPayloadKeys([
        "userName",
        "userEmail",
        "unitName",
        "dateRanges",
        "note",
        "createdAt",
      ]);
      if (!belongsToUnit(unitIdValue)) {
        throw new HttpsError("permission-denied", "Nem engedélyezett");
      }
      sanitizedPayload = {
        userName: requireString(payloadValue.userName, "userName"),
        userEmail: requireString(payloadValue.userEmail, "userEmail"),
        unitName: requireString(payloadValue.unitName, "unitName"),
        dateRanges: requireString(payloadValue.dateRanges, "dateRanges"),
        note: requireString(payloadValue.note, "note"),
        createdAt: requireString(payloadValue.createdAt, "createdAt"),
      };
      break;
    }
    case "leave_request_approved":
    case "leave_request_rejected": {
      validateAllowedPayloadKeys([
        "firstName",
        "approverName",
        "startDate",
        "endDate",
        "userEmail",
      ]);
      if (!canManageUnit(unitIdValue)) {
        throw new HttpsError("permission-denied", "Nem engedélyezett");
      }
      sanitizedPayload = {
        firstName: requireString(payloadValue.firstName, "firstName"),
        approverName: requireString(payloadValue.approverName, "approverName"),
        startDate: requireString(payloadValue.startDate, "startDate"),
        endDate: requireString(payloadValue.endDate, "endDate"),
        userEmail: requireString(payloadValue.userEmail, "userEmail"),
      };
      break;
    }
    case "schedule_published": {
      validateAllowedPayloadKeys([
        "unitName",
        "weekLabel",
        "url",
        "editorName",
      ]);
      if (!canManageUnit(unitIdValue)) {
        throw new HttpsError("permission-denied", "Nem engedélyezett");
      }
      sanitizedPayload = {
        unitName: requireString(payloadValue.unitName, "unitName"),
        weekLabel: requireString(payloadValue.weekLabel, "weekLabel"),
        url: requireString(payloadValue.url, "url"),
        editorName: requireString(payloadValue.editorName, "editorName"),
      };
      break;
    }
    default:
      throw new HttpsError("permission-denied", "Nem engedélyezett");
  }

  await enqueueQueuedEmailInternal(type, sanitizedUnitId, sanitizedPayload);

  return { ok: true };
});

type TemplateId = keyof typeof defaultTemplates;

const renderTemplate = (template: string, payload: Record<string, any> = {}) => {
  let rendered = template;

  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim();
    const value = trimmedKey
      .split('.')
      .reduce((obj: any, k: string) => obj && obj[k], payload);
    return value !== undefined ? String(value) : match;
  });

  rendered = rendered.replace(
    /{{#if (.*?)}}(.*?){{\/if}}/gs,
    (match, key, content) => {
      const trimmedKey = key.trim();
      const value = trimmedKey
        .split('.')
        .reduce((obj: any, k: string) => obj && obj[k], payload);
      return value ? content : '';
    }
  );

  return rendered;
};

const getEmailSettingsForUnit = async (
  unitId: string
): Promise<EmailSettingsDocument> => {
  const defaultSettings: EmailSettingsDocument = {
    enabledTypes: {},
    adminRecipients: {},
    templateOverrides: {},
    adminDefaultEmail: '',
  };

  try {
    const snap = await db.doc(`email_settings/${unitId}`).get();
    if (!snap.exists) return defaultSettings;
    const data = snap.data() as EmailSettingsDocument;
    return {
      enabledTypes: data.enabledTypes || {},
      adminRecipients: data.adminRecipients || {},
      templateOverrides: data.templateOverrides || {},
      adminDefaultEmail: data.adminDefaultEmail || '',
    };
  } catch (err) {
    logger.error('Failed to fetch email settings', { unitId, err });
    return defaultSettings;
  }
};

const shouldSendEmail = async (typeId: string, unitId: string | null) => {
  if (!unitId) return true;
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  if (unitSettings.enabledTypes?.[typeId] !== undefined) {
    return unitSettings.enabledTypes[typeId];
  }
  if (defaultSettings.enabledTypes?.[typeId] !== undefined) {
    return defaultSettings.enabledTypes[typeId];
  }
  return true;
};

const getAdminRecipientsOverride = async (
  unitId: string,
  typeId: string,
  legacyRecipients: string[] = []
): Promise<string[]> => {
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitSpecific = unitSettings.adminRecipients?.[typeId];
  if (unitSpecific && unitSpecific.length > 0) {
    return [...new Set(unitSpecific)];
  }

  const defaultSpecific = defaultSettings.adminRecipients?.[typeId];
  if (defaultSpecific && defaultSpecific.length > 0) {
    return [...new Set(defaultSpecific)];
  }

  const recipients = new Set<string>();
  if (unitSettings.adminDefaultEmail)
    recipients.add(unitSettings.adminDefaultEmail);
  if (defaultSettings.adminDefaultEmail)
    recipients.add(defaultSettings.adminDefaultEmail);
  (legacyRecipients || []).forEach(email => recipients.add(email));

  return Array.from(recipients);
};

const getAdminRecipientsForTypeOverride = async (
  unitId: string,
  typeId: string
): Promise<string[]> => {
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitSpecific = unitSettings.adminRecipients?.[typeId];
  if (unitSpecific && unitSpecific.length > 0) {
    return [...new Set(unitSpecific)];
  }

  const defaultSpecific = defaultSettings.adminRecipients?.[typeId];
  if (defaultSpecific && defaultSpecific.length > 0) {
    return [...new Set(defaultSpecific)];
  }

  return [];
};

const isEmailString = (value: unknown): value is string =>
  typeof value === "string" && /\S+@\S+\.\S+/.test(value);

const collectEmailsFromSnapshot = (
  snap: FirebaseFirestore.QuerySnapshot
): string[] =>
  snap.docs
    .map(doc => doc.data())
    .map(data => data?.email || data?.contact?.email)
    .filter(isEmailString);

const EMAIL_RECIPIENT_CACHE_TTL_MS = 60_000;
let cachedAdminEmails: string[] | null = null;
let cachedAdminEmailsAt = 0;
const cachedUnitAdminEmails = new Map<string, string[]>();
const cachedUnitAdminEmailsAt = new Map<string, number>();
const cachedScheduleStaffEmails = new Map<string, string[]>();
const cachedScheduleStaffEmailsAt = new Map<string, number>();

const getAdminUserEmails = async (): Promise<string[]> => {
  if (cachedAdminEmails && Date.now() - cachedAdminEmailsAt < EMAIL_RECIPIENT_CACHE_TTL_MS) {
    return cachedAdminEmails;
  }
  const snap = await db.collection("users").where("role", "==", "Admin").get();
  cachedAdminEmails = Array.from(new Set(collectEmailsFromSnapshot(snap))).sort();
  cachedAdminEmailsAt = Date.now();
  return cachedAdminEmails;
};

const getUnitAdminEmails = async (unitId: string): Promise<string[]> => {
  const cached = cachedUnitAdminEmails.get(unitId);
  const cachedAt = cachedUnitAdminEmailsAt.get(unitId) || 0;
  if (cached && Date.now() - cachedAt < EMAIL_RECIPIENT_CACHE_TTL_MS) {
    return cached;
  }
  const snap = await db
    .collection("users")
    .where("role", "==", "Unit Admin")
    .where("unitIds", "array-contains", unitId)
    .get();
  const emails = Array.from(new Set(collectEmailsFromSnapshot(snap))).sort();
  cachedUnitAdminEmails.set(unitId, emails);
  cachedUnitAdminEmailsAt.set(unitId, Date.now());
  return emails;
};

const getScheduleStaffEmails = async (unitId: string): Promise<string[]> => {
  const cached = cachedScheduleStaffEmails.get(unitId);
  const cachedAt = cachedScheduleStaffEmailsAt.get(unitId) || 0;
  if (cached && Date.now() - cachedAt < EMAIL_RECIPIENT_CACHE_TTL_MS) {
    return cached;
  }

  const snap = await db
    .collection("users")
    .where("unitIds", "array-contains", unitId)
    .get();

  const emails = snap.docs
    .map(doc => {
      const data = doc.data();
      const email = data?.email || data?.contact?.email;
      const notificationsEnabled = data?.notifications?.newSchedule !== false;
      return notificationsEnabled && isEmailString(email) ? email : null;
    })
    .filter((e): e is string => !!e);

  const deduped = Array.from(new Set(emails)).sort();
  cachedScheduleStaffEmails.set(unitId, deduped);
  cachedScheduleStaffEmailsAt.set(unitId, Date.now());
  return deduped;
};

const resolveEmailTemplate = async (
  unitId: string | null,
  typeId: TemplateId,
  payload: any
) => {
  const unitSettings = await getEmailSettingsForUnit(unitId || 'default');
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitOverride = unitSettings.templateOverrides?.[typeId];
  const defaultOverride = defaultSettings.templateOverrides?.[typeId];
  const hardcoded = defaultTemplates[typeId];

  const subjectTemplate =
    unitOverride?.subject || defaultOverride?.subject || hardcoded.subject;
  const htmlTemplate =
    unitOverride?.html || defaultOverride?.html || hardcoded.html;

  return {
    subject: subjectTemplate,
    html: htmlTemplate,
  };
};

const sendEmail = async (params: {
  typeId: string;
  unitId?: string;
  to: string | string[];
  subject: string;
  html: string;
  payload?: Record<string, any>;
}) => {
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const normalizedEmails = toList
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  const toDomains = Array.from(
    new Set(
      normalizedEmails
        .map(email => {
          const atIndex = email.lastIndexOf("@");
          return atIndex >= 0 ? email.slice(atIndex + 1) : "";
        })
        .filter((domain): domain is string => !!domain)
    )
  )
    .sort()
    .slice(0, 5);
  try {
    const response = await fetch(EMAIL_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      logger.error("EMAIL GATEWAY ERROR", {
        status: response.status,
        body: text,
        typeId: params.typeId,
        unitId: params.unitId,
        toCount: toList.length,
        toDomains,
      });
      const errorCode =
        response.headers.get("x-error-code") ||
        response.headers.get("x-error-code".toUpperCase());
      const e: any = new Error(`Email gateway error ${response.status}: ${text}`);
      e.status = response.status;
      if (errorCode) {
        e.code = errorCode;
      }
      throw e;
    }

    logger.info("EMAIL GATEWAY OK", {
      status: response.status,
      typeId: params.typeId,
      unitId: params.unitId,
      toCount: toList.length,
      toDomains,
    });
  } catch (err: any) {
    logger.error("sendEmail() FAILED", {
      typeId: params.typeId,
      unitId: params.unitId,
      toCount: toList.length,
      toDomains,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
};

const resolveQueuedEmailRecipients = async (
  typeId: string,
  unitId: string | null | undefined,
  payload: Record<string, any>
): Promise<string[]> => {
  if (typeId === "leave_request_created") {
    if (!unitId) return [];
    const [adminEmails, unitAdminEmails, overrideEmails] = await Promise.all([
      getAdminUserEmails(),
      getUnitAdminEmails(unitId),
      getAdminRecipientsOverride(unitId, typeId, []),
    ]);
    logger.info("Queued email recipient counts", {
      typeId,
      unitId,
      adminCount: adminEmails.length,
      unitAdminCount: unitAdminEmails.length,
      overrideCount: overrideEmails.length,
    });
    return Array.from(new Set([...adminEmails, ...unitAdminEmails, ...overrideEmails])).sort();
  }

  if (typeId === "schedule_published") {
    if (!unitId) return [];
    const [staffEmails, overrideEmails] = await Promise.all([
      getScheduleStaffEmails(unitId),
      getAdminRecipientsForTypeOverride(unitId, typeId),
    ]);
    // Schedule notices are sent to staff; admin overrides are limited to explicit type overrides.
    logger.info("Queued email recipient counts", {
      typeId,
      unitId,
      staffCount: staffEmails.length,
      overrideCount: overrideEmails.length,
    });
    return Array.from(new Set([...staffEmails, ...overrideEmails])).sort();
  }

  if (typeId === "leave_request_approved" || typeId === "leave_request_rejected") {
    if (isEmailString(payload.userEmail)) {
      logger.info("Queued email recipient counts", {
        typeId,
        unitId,
        userCount: 1,
      });
      return [payload.userEmail];
    }
    if (isEmailString(payload.email)) {
      logger.info("Queued email recipient counts", {
        typeId,
        unitId,
        userCount: 1,
      });
      return [payload.email];
    }
    return [];
  }

  if (typeId === "register_welcome") {
    if (isEmailString(payload.email)) {
      logger.info("Queued email recipient counts", {
        typeId,
        unitId,
        userCount: 1,
      });
      return [payload.email];
    }
    return [];
  }

  return [];
};

type TimestampLike =
  | FirebaseFirestore.Timestamp;

const toJsDate = (v: TimestampLike | Date | null | undefined): Date => {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;

  // Firestore Timestamp mind admin, mind client oldalon tud toDate()-et
  const anyV = v as any;
  if (typeof anyV.toDate === "function") return anyV.toDate();

  // fallback, ha valami furcsa jön
  return new Date(anyV);
};

const buildTimeFields = (
  start: FirebaseFirestore.Timestamp | Date,
  end: FirebaseFirestore.Timestamp | Date | null | undefined,
  locale: 'hu' | 'en'
) => {
  const date = toJsDate(start);
  const endDate = end ? toJsDate(end) : null;

  const dateFormatter = new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const bookingDate = dateFormatter.format(date);
  const bookingTimeFrom = timeFormatter.format(date);
  const bookingTimeTo = endDate ? timeFormatter.format(endDate) : '';
  const bookingTimeRange = bookingTimeTo
    ? `${bookingTimeFrom} – ${bookingTimeTo}`
    : bookingTimeFrom;

  return { bookingDate, bookingTimeFrom, bookingTimeTo, bookingTimeRange };
};

const buildCustomFieldsHtml = (
  customSelects: CustomSelectField[] = [],
  customData: Record<string, string> = {},
  mutedColor: string
) => {
  const items: { label: string; value: string }[] = [];

  customSelects.forEach(select => {
    const value = customData[select.id];
    const displayValue = value === undefined || value === null ? '' : String(value);
    if (displayValue) {
      items.push({ label: select.label, value: displayValue });
    }
  });

  Object.entries(customData || {}).forEach(([key, value]) => {
    const displayValue = value === undefined || value === null ? '' : String(value);
    if (!displayValue) return;
    if (key === 'occasion' || key === 'occasionOther') return;
    if (customSelects.some(select => select.id === key)) return;
    items.push({ label: key, value: displayValue });
  });

  if (!items.length) return '';

  const listItems = items
    .map(
      item =>
        `<li style="margin: 4px 0; padding: 0; list-style: none;"><strong>${item.label}:</strong> <span style="color: ${mutedColor};">${item.value}</span></li>`
    )
    .join('');

  return `
    <div style="margin-top: 12px;">
      <strong>További adatok:</strong>
      <ul style="margin: 8px 0 0 0; padding: 0;">
        ${listItems}
      </ul>
    </div>
  `;
};

const buildDetailsCardHtml = (
  payload: Record<string, any>,
  theme: 'light' | 'dark' = 'light'
) => {
  const isDark = theme === 'dark';
  const background = isDark ? '#111827' : '#f9fafb';
  const cardBackground = isDark ? '#1f2937' : '#ffffff';
  const borderColor = isDark ? '#374151' : '#e5e7eb';
  const textColor = isDark ? '#e5e7eb' : '#111827';
  const mutedColor = isDark ? '#9ca3af' : '#4b5563';

  const customFieldsHtml = buildCustomFieldsHtml(
    payload.customSelects,
    payload.customData || {},
    mutedColor
  );

  const statusRow = payload.decisionLabel
    ? `<div style="display: flex; gap: 8px; align-items: center;"><strong>Státusz:</strong><span style="display: inline-flex; padding: 4px 10px; border-radius: 9999px; background: ${
        payload.status === 'confirmed' ? '#dcfce7' : '#fee2e2'
      }; color: ${payload.status === 'confirmed' ? '#166534' : '#991b1b'}; font-weight: 700;">${
        payload.decisionLabel
      }</span></div>`
    : '';

  const occasionRow = payload.occasion
    ? `<div><strong>Alkalom:</strong> <span style="color: ${mutedColor};">${payload.occasion}</span></div>`
    : '';

  const occasionOtherRow = payload.occasionOther
    ? `<div><strong>Alkalom (egyéb):</strong> <span style="color: ${mutedColor};">${payload.occasionOther}</span></div>`
    : '';

  const notesRow = payload.notes
    ? `<div style="margin-top: 12px;"><strong>Megjegyzés:</strong><div style="margin-top: 4px; color: ${mutedColor}; white-space: pre-line;">${payload.notes}</div></div>`
    : '';

  const autoConfirmRow =
    payload.reservationMode === 'auto'
      ? payload.locale === 'en'
        ? 'Yes'
        : 'Igen'
      : payload.locale === 'en'
      ? 'No'
      : 'Nem';

  return `
    <div class="mintleaf-card-wrapper" style="background: ${background}; padding: 16px;">
      <div
        class="mintleaf-card"
        style="background: ${cardBackground}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 24px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${textColor};"
      >
        <h3 style="margin: 0 0 12px 0; font-size: 20px;">Foglalás részletei</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; font-size: 14px; line-height: 1.5;">
          <div><strong>Egység neve:</strong> <span style="color: ${mutedColor};">${payload.unitName}</span></div>
          <div><strong>Vendég neve:</strong> <span style="color: ${mutedColor};">${payload.guestName}</span></div>
          <div><strong>Dátum:</strong> <span style="color: ${mutedColor};">${payload.bookingDate}</span></div>
          <div><strong>Időpont:</strong> <span style="color: ${mutedColor};">${payload.bookingTimeRange}</span></div>
          <div><strong>Létszám:</strong> <span style="color: ${mutedColor};">${payload.headcount}</span></div>
          ${occasionRow}
          ${occasionOtherRow}
          <div><strong>Email:</strong> <span style="color: ${mutedColor};">${payload.guestEmail}</span></div>
          <div><strong>Telefon:</strong> <span style="color: ${mutedColor};">${payload.guestPhone}</span></div>
          <div><strong>Foglalás azonosító:</strong> <span style="color: ${mutedColor};">${payload.bookingRef}</span></div>
          <div><strong>Automatikus megerősítés:</strong> <span style="color: ${mutedColor};">${autoConfirmRow}</span></div>
        </div>
        ${statusRow}
        ${customFieldsHtml}
        ${notesRow}
      </div>
    </div>
    <style>
      .mintleaf-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 9999px;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-weight: 700;
        text-decoration: none;
        background: #16a34a;
        color: #ffffff;
        border: 1px solid transparent;
      }
      .mintleaf-btn-danger {
        background: #dc2626;
      }
      @media (prefers-color-scheme: dark) {
        .mintleaf-card-wrapper { background-color: #111827 !important; }
        .mintleaf-card { background-color: #1f2937 !important; border-color: #374151 !important; color: #e5e7eb !important; }
        .mintleaf-card strong { color: #e5e7eb !important; }
        .mintleaf-card span { color: #d1d5db !important; }
        .mintleaf-btn { color: #ffffff !important; }
      }
    </style>
  `;
};

const toMillis = (value: EmailQueueTimestamp | null | undefined): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const anyValue = value as any;
  if (typeof anyValue.toMillis === "function") return anyValue.toMillis();
  if (typeof anyValue.toDate === "function") return anyValue.toDate().getTime();
  const numeric = Number(anyValue);
  return Number.isFinite(numeric) ? numeric : null;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toMillisStrict = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const anyValue = value as any;
  if (typeof anyValue?.toMillis === "function") return anyValue.toMillis();
  if (typeof anyValue?.toDate === "function") return anyValue.toDate().getTime();

  const wrappedTimestamp = typeof anyValue?.timestampValue === "string"
    ? anyValue.timestampValue
    : null;
  if (wrappedTimestamp) {
    const parsed = Date.parse(wrappedTimestamp);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const seconds =
    asFiniteNumber(anyValue?.seconds) ??
    asFiniteNumber(anyValue?._seconds);
  const nanos =
    asFiniteNumber(anyValue?.nanoseconds) ??
    asFiniteNumber(anyValue?.nanos) ??
    asFiniteNumber(anyValue?._nanoseconds);
  if (seconds !== null) {
    const nanosValue = nanos !== null ? nanos : 0;
    const millis = seconds * 1000 + nanosValue / 1_000_000;
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
};

const isFuture = (value: unknown): boolean => {
  const millis = toMillisStrict(value);
  return millis !== null && millis > Date.now();
};

const computeBackoffMs = (attemptCount: number, seed: string) => {
  const exponent = Math.max(0, attemptCount - 1);
  const baseDelay = EMAIL_QUEUE_BASE_BACKOFF_MS * 2 ** exponent;
  const cappedDelay = Math.min(baseDelay, EMAIL_QUEUE_MAX_BACKOFF_MS);
  const hash = createHash("sha256").update(seed).digest();
  const jitterRatio = (hash[0] ?? 0) / 255;
  const jitterMs = Math.round(cappedDelay * jitterRatio * 0.2);
  return Math.min(cappedDelay + jitterMs, EMAIL_QUEUE_MAX_BACKOFF_MS);
};

const isTransientEmailError = (err: unknown) => {
  const anyErr = err as any;
  if (anyErr?.isPermanent) return false;
  const status = typeof anyErr?.status === "number" ? anyErr.status : null;
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500) return true;
    if (status >= 400) return false;
  }
  const code = typeof anyErr?.code === "string" ? anyErr.code : null;
  if (code && ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  return true;
};

const extractErrorCode = (err: unknown): string | null => {
  const anyErr = err as any;
  if (typeof anyErr?.code === "string") return anyErr.code;
  if (typeof anyErr?.status === "number") return String(anyErr.status);
  return null;
};

const clearEmailQueueLock = (ref: FirebaseFirestore.DocumentReference) =>
  ref.update({
    processingAt: FieldValue.delete(),
    processingBy: FieldValue.delete(),
    processingExpiresAt: FieldValue.delete(),
  });

const clearEmailQueueLockIfOwner = async (
  ref: FirebaseFirestore.DocumentReference,
  processingBy: string
) => {
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    if (data?.processingBy !== processingBy) return;
    transaction.update(ref, {
      processingAt: FieldValue.delete(),
      processingBy: FieldValue.delete(),
      processingExpiresAt: FieldValue.delete(),
    });
  });
};

const markRetry = async (
  ref: FirebaseFirestore.DocumentReference,
  attemptCount: number,
  emailId: string,
  err: unknown
) => {
  const nextAttemptCount = attemptCount + 1;
  const backoffMs = computeBackoffMs(nextAttemptCount, `${emailId}:${nextAttemptCount}`);
  const nextAttemptAt = Timestamp.fromMillis(Date.now() + backoffMs);
  await ref.update({
    status: "pending",
    attemptCount: nextAttemptCount,
    nextAttemptAt,
    lastErrorAt: FieldValue.serverTimestamp(),
    lastErrorCode: extractErrorCode(err),
    errorMessage: err instanceof Error ? err.message : String(err),
    processingAt: FieldValue.delete(),
    processingBy: FieldValue.delete(),
    processingExpiresAt: FieldValue.delete(),
  });
};

const markDlq = async (
  ref: FirebaseFirestore.DocumentReference,
  reason: string,
  err?: unknown
) => {
  const errorMessage = err instanceof Error ? err.message : err ? String(err) : null;
  const lastErrorCode = err ? extractErrorCode(err) : null;
  const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
    status: "error",
    dlq: true,
    dlqAt: FieldValue.serverTimestamp(),
    dlqReason: reason,
    lastErrorAt: FieldValue.serverTimestamp(),
    processingAt: FieldValue.delete(),
    processingBy: FieldValue.delete(),
    processingExpiresAt: FieldValue.delete(),
  };
  if (errorMessage) {
    update.errorMessage = errorMessage;
  } else {
    update.errorMessage = FieldValue.delete();
  }
  if (lastErrorCode) {
    update.lastErrorCode = lastErrorCode;
  } else {
    update.lastErrorCode = FieldValue.delete();
  }
  await ref.update(update);
};

const processQueuedEmail = async (params: {
  emailId: string;
  processingBy: string;
  queuedData?: FirebaseFirestore.DocumentData;
}) => {
  const { emailId, processingBy, queuedData } = params;
  const ref = db.doc(`email_queue/${emailId}`);

  const claim = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists) {
      return {
        claimResult: "already_done" as const,
        lockExpired: false,
        queued: data,
      };
    }

    const status = data?.status;
    const processingAt = data?.processingAt as Timestamp | undefined;
    const processingExpiresAt = data?.processingExpiresAt as Timestamp | undefined;
    const now = Timestamp.now();
    const lockExpired = processingExpiresAt
      ? processingExpiresAt.toMillis() <= now.toMillis()
      : false;
    const hasLock = !!processingAt;

    if (status !== "pending") {
      return {
        claimResult: "already_done" as const,
        lockExpired: false,
        queued: data,
      };
    }

    if (hasLock && !lockExpired) {
      return {
        claimResult: "locked" as const,
        lockExpired: false,
        queued: data,
      };
    }

    // Lock expires after EMAIL_QUEUE_LOCK_TTL_MS to allow a later steal if needed.
    const expiresAt = Timestamp.fromMillis(now.toMillis() + EMAIL_QUEUE_LOCK_TTL_MS);
    transaction.update(ref, {
      // Lock is acquired when processingAt/processingBy are set.
      processingAt: FieldValue.serverTimestamp(),
      processingBy,
      processingExpiresAt: expiresAt,
    });

    return {
      claimResult: "claimed" as const,
      lockExpired: hasLock && lockExpired,
      queued: data,
    };
  });

  const queued = claim.queued ?? queuedData;
  const typeId = typeof queued?.typeId === "string" ? queued.typeId : null;
  const payload = queued?.payload;
  const unitId = typeof queued?.unitId === "string" ? queued.unitId : null;
  logger.info("Queued email claim processed", {
    emailId,
    typeId,
    unitId,
    claimResult: claim.claimResult,
    processingBy,
    lockExpired: claim.lockExpired,
  });

  if (claim.claimResult !== "claimed") {
    return;
  }

  const latestSnapshot = await ref.get();
  const latestQueued = latestSnapshot.data() ?? queued ?? queuedData;
  const latestStatus = latestQueued?.status;
  const latestSentAt = latestQueued?.sentAt as EmailQueueTimestamp | undefined;
  const nextAttemptAt = latestQueued?.nextAttemptAt as EmailQueueTimestamp | null | undefined;
  const attemptCount =
    typeof latestQueued?.attemptCount === "number" ? latestQueued.attemptCount : 0;
  const effectiveTypeId =
    typeof latestQueued?.typeId === "string" ? latestQueued.typeId : typeId;
  const effectivePayload = latestQueued?.payload ?? payload;
  const effectiveUnitId =
    typeof latestQueued?.unitId === "string" ? latestQueued.unitId : unitId;

  if (latestStatus !== "pending" || latestSentAt) {
    logger.info("Queued email already processed", {
      emailId,
      typeId: effectiveTypeId,
      unitId: effectiveUnitId,
      status: latestStatus,
    });
    await clearEmailQueueLockIfOwner(ref, processingBy);
    return;
  }

  if (isFuture(nextAttemptAt)) {
    const nextAttemptMs = toMillisStrict(nextAttemptAt);
    logger.info("Queued email backoff active", {
      emailId,
      typeId: effectiveTypeId,
      unitId: effectiveUnitId,
      nextAttemptAtMs: nextAttemptMs,
      stage: "processEarly",
    });
    await clearEmailQueueLockIfOwner(ref, processingBy);
    return;
  }

  const payloadValid =
    !!effectivePayload && typeof effectivePayload === "object" && !Array.isArray(effectivePayload);
  if (!effectiveTypeId || !payloadValid) {
    const missingFields = [
      ...(effectiveTypeId ? [] : ["typeId"]),
      ...(payloadValid ? [] : ["payload"]),
    ];
    logger.error("Queued email missing required fields", { emailId, missingFields });
    await markDlq(ref, "missing_fields", new Error("Queued email missing required fields"));
    return;
  }

  if (!isQueuedTemplateKey(effectiveTypeId)) {
    logger.error("No template found for queued email", { typeId: effectiveTypeId, emailId });
    await markDlq(
      ref,
      "invalid_type",
      new Error(`No template for typeId ${String(effectiveTypeId)}`)
    );
    return;
  }
  const template = queuedEmailTemplates[effectiveTypeId];
  const payloadData = effectivePayload as Record<string, any>;

  const allowed = await shouldSendEmail(effectiveTypeId, effectiveUnitId);
  if (!allowed) {
    logger.info("Email sending disabled via settings", {
      typeId: effectiveTypeId,
      unitId: effectiveUnitId,
      emailId,
    });
    await ref.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      // Lock is cleared after a successful send.
      processingAt: FieldValue.delete(),
      processingBy: FieldValue.delete(),
      processingExpiresAt: FieldValue.delete(),
    });
    return;
  }

  try {
    const recipients = await resolveQueuedEmailRecipients(
      effectiveTypeId,
      effectiveUnitId,
      payloadData
    );

    if (!recipients.length) {
      await markDlq(ref, "no_recipients", new Error("No recipients resolved for queued email"));
      return;
    }

    logger.info("Queued email recipients resolved", {
      typeId: effectiveTypeId,
      emailId,
      count: recipients.length,
    });

    const subject = renderTemplate(template.subject, payloadData);
    const html = renderTemplate(template.html, payloadData);

    const latestBeforeSend = await ref.get();
    const beforeSendAttemptAt = latestBeforeSend.data()?.nextAttemptAt;
    if (isFuture(beforeSendAttemptAt)) {
      const nextAttemptMs = toMillisStrict(beforeSendAttemptAt);
      logger.info("Queued email backoff active", {
        emailId,
        typeId: effectiveTypeId,
        unitId: effectiveUnitId,
        nextAttemptAtMs: nextAttemptMs,
        stage: "preSend",
      });
      await clearEmailQueueLockIfOwner(ref, processingBy);
      return;
    }

    await sendEmail({
      typeId: effectiveTypeId,
      unitId: effectiveUnitId || undefined,
      to: recipients,
      subject,
      html,
      payload: payloadData,
    });

    await ref.update({
      status: "sent",
      sentAt: FieldValue.serverTimestamp(),
      // Lock is cleared after a successful send.
      processingAt: FieldValue.delete(),
      processingBy: FieldValue.delete(),
      processingExpiresAt: FieldValue.delete(),
    });
  } catch (err: any) {
    logger.error("Failed to process queued email", {
      typeId: effectiveTypeId,
      emailId,
      message: err?.message,
    });
    if (attemptCount + 1 >= EMAIL_QUEUE_MAX_ATTEMPTS || !isTransientEmailError(err)) {
      await markDlq(ref, "send_failed", err);
      return;
    }
    await markRetry(ref, attemptCount, emailId, err);
  }
};

export const onQueuedEmailCreated = onDocumentCreated(
  {
    region: REGION,
    document: "email_queue/{emailId}",
  },
  async event => {
    /*
     * Email queue manual test checklist (emulator):
     * - Duplicate trigger prevention: invoke the same email_queue doc twice; confirm only the
     *   first invocation logs claimResult="claimed" and later retries log "locked" or "already_done".
     * - Concurrency: trigger two parallel runs; confirm only one sendEmail occurs and logs "claimed".
     * - Expired lock: set processingExpiresAt in emulator to a past timestamp, then re-trigger and
     *   confirm the next invocation logs lockExpired=true and sends.
     * - Backoff: set attemptCount > 0 + nextAttemptAt in the future, trigger and confirm "backoff_active".
     * - Retry: force gateway error and confirm attemptCount increments + nextAttemptAt increases.
     * - DLQ: cause missing fields or no recipients and confirm dlq fields are set.
     * - Idempotency: set sentAt and confirm it exits without resending.
     * - Lock cleanup: ensure processing fields clear on every exit path.
    */
    // Sanity: queued email documents must include typeId/unitId/payload/status/createdAt.
    const emailId = event.params.emailId as string;
    const createdData = event.data?.data();
    const createdStatus = createdData?.status;
    const createdNextAttemptAt = createdData?.nextAttemptAt;
    if (createdStatus === "pending" && isFuture(createdNextAttemptAt)) {
      const createdTypeId =
        typeof createdData?.typeId === "string" ? createdData.typeId : null;
      const createdUnitId =
        typeof createdData?.unitId === "string" ? createdData.unitId : null;
      logger.info("Queued email backoff active", {
        emailId,
        typeId: createdTypeId,
        unitId: createdUnitId,
        nextAttemptAtMs: toMillisStrict(createdNextAttemptAt),
        stage: "onCreated",
      });
      return;
    }
    const processingBy = event.id || randomBytes(12).toString("hex");
    await processQueuedEmail({
      emailId,
      processingBy,
      queuedData: createdData,
    });
  }
);

export const onQueuedEmailScheduled = onSchedule(
  {
    region: REGION,
    schedule: "every 1 minute",
  },
  async event => {
    const maxBatchSize = 50;
    const now = Timestamp.now();
    const baseQuery = db.collection("email_queue").where("status", "==", "pending");

    const [dueSnap, nullSnap, dueLegacySnap, nullLegacySnap] = await Promise.all([
      baseQuery.where("dlq", "==", false).where("nextAttemptAt", "<=", now).get(),
      baseQuery.where("dlq", "==", false).where("nextAttemptAt", "==", null).get(),
      baseQuery.where("dlq", "==", null).where("nextAttemptAt", "<=", now).get(),
      baseQuery.where("dlq", "==", null).where("nextAttemptAt", "==", null).get(),
    ]);

    const baseProcessingBy = String(event.scheduleTime ?? Date.now());
    const seen = new Set<string>();
    const docs = [
      ...dueSnap.docs,
      ...nullSnap.docs,
      ...dueLegacySnap.docs,
      ...nullLegacySnap.docs,
    ];
    for (const docSnap of docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
    }

    logger.info("Queued email scheduled run", {
      dueCount: dueSnap.size,
      nullCount: nullSnap.size,
      dueLegacyCount: dueLegacySnap.size,
      nullLegacyCount: nullLegacySnap.size,
      uniqueCount: seen.size,
    });

    let processed = 0;
    for (const docSnap of docs) {
      if (processed >= maxBatchSize) break;
      if (!seen.has(docSnap.id)) continue;
      seen.delete(docSnap.id);
      await processQueuedEmail({
        emailId: docSnap.id,
        processingBy: `${baseProcessingBy}:${docSnap.id}`,
        queuedData: docSnap.data(),
      });
      processed += 1;
    }
  }
);

const appendHtmlSafely = (baseHtml: string, extraHtml: string): string => {
  if (!baseHtml) return extraHtml;

  if (/<\/body>/i.test(baseHtml)) {
    return baseHtml.replace(/<\/body>/i, `${extraHtml}</body>`);
  }

  if (/<\/html>/i.test(baseHtml)) {
    return baseHtml.replace(/<\/html>/i, `${extraHtml}</html>`);
  }

  return `${baseHtml}${extraHtml}`;
};

const getPublicBaseUrl = (settings?: ReservationSettings) => {
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL;
  const baseUrl = settings?.publicBaseUrl || envUrl || 'https://mintleaf.hu';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const buildGuestManageUrl = (params: {
  publicBaseUrl: string;
  unitId: string;
  bookingId: string;
  manageToken?: string | null;
  hasManageTokenHash: boolean;
}): string | null => {
  const { publicBaseUrl, unitId, bookingId, manageToken, hasManageTokenHash } = params;
  if (hasManageTokenHash) {
    if (!manageToken) return null;
    return `${publicBaseUrl}/manage?reservationId=${bookingId}&unitId=${unitId}&token=${manageToken}`;
  }
  return `${publicBaseUrl}/manage?reservationId=${bookingId}&unitId=${unitId}&token=${bookingId}`;
};

const buildPayload = (
  booking: BookingRecord,
  unitName: string,
  locale: 'hu' | 'en',
  decisionLabel: string,
  options: {
    bookingId?: string;
    customSelects?: CustomSelectField[];
    publicBaseUrl?: string;
  } = {}
) => {
  const { bookingDate, bookingTimeFrom, bookingTimeTo, bookingTimeRange } = buildTimeFields(
    booking.startTime,
    booking.endTime,
    locale
  );

  const customData = booking.customData || {};
  const occasion = (customData.occasion as string) || booking.occasion || '';
  const occasionOther = (customData.occasionOther as string) || '';

  const bookingRef =
    booking.referenceCode?.substring(0, 8).toUpperCase() || booking.referenceCode || '';

  return {
    guestName: booking.name || '',
    unitName,
    bookingDate,
    bookingTimeFrom,
    bookingTimeTo,
    bookingTimeRange,
    headcount: booking.headcount || 0,
    decisionLabel,
    bookingRef,
    guestEmail: booking.contact?.email || booking.email || '',
    guestPhone: booking.contact?.phoneE164 || booking.phone || '',
    occasion,
    occasionOther,
    notes: booking.notes || '',
    reservationMode: booking.reservationMode,
    adminActionToken: booking.adminActionToken,
    status: booking.status,
    bookingId: options.bookingId || bookingRef,
    customSelects: options.customSelects || [],
    customData,
    locale,
    publicBaseUrl: options.publicBaseUrl,
  };
};

const getUnitName = async (unitId: string) => {
  try {
    const snap = await db.doc(`units/${unitId}`).get();
    return (snap.data()?.name as string) || 'MintLeaf egység';
  } catch (err) {
    logger.error('Failed to load unit', { unitId, err });
    return 'MintLeaf egység';
  }
};

const getReservationSettings = async (
  unitId: string
): Promise<ReservationSettings> => {
  try {
    const snap = await db.doc(`reservation_settings/${unitId}`).get();
    if (!snap.exists) return {};
    return snap.data() as ReservationSettings;
  } catch (err) {
    logger.error('Failed to fetch reservation settings', {
      unitId,
      err,
    });
    return {};
  }
};

// ---------- EMAIL SENDERS ----------

const buildButtonBlock = (
  buttons: { label: string; url: string; variant?: 'primary' | 'danger' }[],
  theme: 'light' | 'dark'
) => {
  const background = theme === 'dark' ? '#111827' : '#f9fafb';
  const spacing =
    '<span style="display: inline-block; width: 4px; height: 4px;"></span>';
  const buttonsHtml = buttons
    .map(
      btn =>
        `<a class="mintleaf-btn${btn.variant === 'danger' ? ' mintleaf-btn-danger' : ''}" href="${btn.url}" style="background: ${
          btn.variant === 'danger' ? '#dc2626' : '#16a34a'
        }; color: #ffffff; text-decoration: none;">${btn.label}</a>`
    )
    .join(spacing);

  return `
    <div class="mintleaf-card-wrapper" style="background: ${background}; padding: 16px 16px 0 16px; display: flex; gap: 12px; flex-wrap: wrap;">
      ${buttonsHtml}
    </div>
  `;
};

const sendGuestCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string,
  manageToken?: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_created_guest', unitId);
  if (!allowed) return;

  const settings = await getReservationSettings(unitId);
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageTokenValue = manageToken || bookingId;
  const manageUrl = `${publicBaseUrl}/manage?reservationId=${bookingId}&unitId=${unitId}&token=${manageTokenValue}`;
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_created_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_created_guest.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_created_guest.html,
    payload
  );

  const extraHtml = `${buildButtonBlock(
    [
      {
        label: 'FOGLALÁS MÓDOSÍTÁSA',
        url: manageUrl,
      },
    ],
    theme
  )}${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

  await sendEmail({
    typeId: 'booking_created_guest',
    unitId,
    to: guestEmail,
    subject,
    html: finalHtml,
    payload,
  });
};

const sendAdminCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string,
  adminActionTokenOverride?: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_created_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  const allowed = await shouldSendEmail('booking_created_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const adminActionToken = adminActionTokenOverride || payload.adminActionToken || '';

  const manageApproveUrl = `${publicBaseUrl}/manage?reservationId=${payload.bookingId}&unitId=${unitId}&adminToken=${adminActionToken}&action=approve`;
  const manageRejectUrl = `${publicBaseUrl}/manage?reservationId=${payload.bookingId}&unitId=${unitId}&adminToken=${adminActionToken}&action=reject`;

  const showAdminButtons =
    booking.reservationMode === 'request' && !!adminActionToken;

  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_created_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_created_admin.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_created_admin.html,
    payload
  );

  const extraHtml = `${
    showAdminButtons
      ? buildButtonBlock(
          [
            { label: 'ELFOGADÁS', url: manageApproveUrl },
            { label: 'ELUTASÍTÁS', url: manageRejectUrl, variant: 'danger' },
          ],
          theme
        )
      : ''
  }${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_created_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
      })
    )
  );
};

const sendGuestStatusEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_status_updated_guest', unitId);
  if (!allowed) return;

  const settings = await getReservationSettings(unitId);
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const decisionLabel =
    booking.status === 'confirmed'
      ? decisionLabels[locale].approved
      : decisionLabels[locale].rejected;

  const payload = buildPayload(booking, unitName, locale, decisionLabel, {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageUrl = buildGuestManageUrl({
    publicBaseUrl,
    unitId,
    bookingId,
    manageToken: null,
    hasManageTokenHash: !!booking.manageTokenHash,
  });
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_status_updated_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_status_updated_guest.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_status_updated_guest.html,
    payload
  );

  const extraHtml = `${
    manageUrl
      ? buildButtonBlock(
          [
            {
              label: 'FOGLALÁS MÓDOSÍTÁSA',
              url: manageUrl,
            },
          ],
          theme
        )
      : ''
  }${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

  await sendEmail({
    typeId: 'booking_status_updated_guest',
    unitId,
    to: guestEmail,
    subject,
    html: finalHtml,
    payload,
  });
};

const sendAdminCancellationEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const cancellationRecipients = await getAdminRecipientsOverride(
    unitId,
    'booking_cancelled_admin',
    legacyRecipients
  );
  const createdRecipients = await getAdminRecipientsOverride(
    unitId,
    'booking_created_admin',
    legacyRecipients
  );

  const recipients = Array.from(
    new Set([...(cancellationRecipients || []), ...(createdRecipients || [])])
  );
  if (!recipients.length) return;

  const allowed = await shouldSendEmail('booking_cancelled_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(
    booking,
    unitName,
    locale,
    decisionLabels[locale].cancelled,
    {
      bookingId,
      customSelects,
      publicBaseUrl,
    }
  );
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_cancelled_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_cancelled_admin.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_cancelled_admin.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildDetailsCardHtml(payload, theme)
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_cancelled_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
      })
    )
  );
};

const sendGuestModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_modified_guest', unitId);
  if (!allowed) return;

  const payload = buildPayload(booking, unitName, locale, '');
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_guest.subject,
    payload
  );
  const html = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_guest.html,
    payload
  );

  await sendEmail({
    typeId: 'booking_modified_guest',
    unitId,
    to: guestEmail,
    subject,
    html,
    payload,
  });
};

const sendAdminModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_modified_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  const allowed = await shouldSendEmail('booking_modified_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const payload = buildPayload(booking, unitName, locale, '');
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_admin.subject,
    payload
  );
  const html = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_admin.html,
    payload
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_modified_admin',
        unitId,
        to,
        subject,
        html,
        payload,
      })
    )
  );
};

// ---------- CHANGE DETECTOR ----------

const hasMeaningfulEdit = (before: BookingRecord, after: BookingRecord) => {
  const fields: (keyof BookingRecord)[] = [
    'name',
    'headcount',
    'occasion',
    'startTime',
    'endTime',
    'notes',
    'phone',
    'email',
    'reservationMode',
  ];

  return fields.some(f => {
    const b: any = (before as any)[f];
    const a: any = (after as any)[f];

    const bVal = b?.toMillis ? b.toMillis() : b;
    const aVal = a?.toMillis ? a.toMillis() : a;

    return bVal !== aVal;
  });
};

// ---------- TRIGGERS ----------

export const onReservationCreated = onDocumentCreated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const booking = event.data?.data() as BookingRecord | undefined;
    if (!booking) return;
    if (booking.skipCreateEmails) return;

    const unitId = event.params.unitId as string;
    const bookingId = event.params.bookingId as string;
    const unitName = await getUnitName(unitId);

    const tasks: Promise<void>[] = [];

    tasks.push(
      sendGuestCreatedEmail(unitId, booking, unitName, bookingId).catch(err =>
        logger.error("Failed to send guest created email", { unitId, err })
      )
    );

    tasks.push(
      sendAdminCreatedEmail(unitId, booking, unitName, bookingId).catch(err =>
        logger.error("Failed to send admin created email", { unitId, err })
      )
    );

    await Promise.all(tasks);
  }
);

export const onReservationStatusChange = onDocumentUpdated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const before = event.data?.before.data() as BookingRecord | undefined;
    const after = event.data?.after.data() as BookingRecord | undefined;
    if (!before || !after) return;

    const statusChanged = before.status !== after.status;
    const statusOrCancelChanged =
      statusChanged || before.cancelledBy !== after.cancelledBy;

    const edited = hasMeaningfulEdit(before, after);

    if (!statusOrCancelChanged && !edited) return;

    const unitId = event.params.unitId as string;
    const bookingId = event.params.bookingId as string;

    logger.info("TRIGGER FIRED", {
      unitId,
      bookingId,
      beforeStatus: before.status,
      afterStatus: after.status,
      beforeCancelledBy: before.cancelledBy,
      afterCancelledBy: after.cancelledBy,
      edited,
    });

    const unitName = await getUnitName(unitId);

    const adminDecision =
      statusChanged &&
      before.status === "pending" &&
      (after.status === "confirmed" || after.status === "cancelled");

    const guestCancelled =
      statusChanged &&
      after.status === "cancelled" &&
      after.cancelledBy === "guest";
    const adminCancelled =
      statusChanged &&
      after.status === "cancelled" &&
      after.cancelledBy !== "guest";

    const tasks: Promise<void>[] = [];

    if (adminDecision) {
      tasks.push(
        sendGuestStatusEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send guest status email", { unitId, err })
        )
      );

      tasks.push(
        db
          .collection('units')
          .doc(unitId)
          .collection('reservation_logs')
          .add({
            bookingId,
            unitId,
            type: after.status === 'confirmed' ? 'updated' : 'cancelled',
            createdAt: FieldValue.serverTimestamp(),
            createdByName: 'Email jóváhagyás',
            source: 'internal',
            message:
              after.status === 'confirmed'
                ? 'Foglalás jóváhagyva e-mailből'
                : 'Foglalás elutasítva e-mailből',
          })
          .then(() => undefined)
          .catch(err =>
            logger.error("Failed to write admin decision log", { unitId, err })
          )
      );
    }

    if (guestCancelled) {
      tasks.push(
        sendAdminCancellationEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send admin cancellation email", { unitId, err })
        )
      );
    }

    if (adminCancelled && after.startTime && after.headcount && after.headcount > 0) {
      tasks.push(
        db
          .runTransaction(async transaction => {
            const startDate =
              after.startTime instanceof Timestamp
                ? after.startTime.toDate()
                : after.startTime instanceof Date
                ? after.startTime
                : new Date(after.startTime as any);
            const dateKey = toDateKey(startDate);
            const reservationRef = db
              .collection('units')
              .doc(unitId)
              .collection('reservations')
              .doc(bookingId);
            await applyCapacityLedgerTx({
              transaction,
              db,
              unitId,
              reservationRef,
              reservationData: after as Record<string, any>,
              nextStatus: 'cancelled',
              nextDateKey: dateKey,
              nextHeadcount: Number(after.headcount || 0),
              mutationTraceId: `admin-cancel-${bookingId}`,
            });
          })
          .catch(err =>
            logger.error("Failed to adjust capacity after admin cancel", { unitId, err })
          )
      );
    }

    if (edited && !statusChanged) {
      tasks.push(
        sendGuestModifiedEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send guest modified email", { unitId, err })
        )
      );
      tasks.push(
        sendAdminModifiedEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send admin modified email", { unitId, err })
        )
      );
    }

    await Promise.all(tasks);
  }
);
