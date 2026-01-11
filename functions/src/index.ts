import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { createHash, randomBytes } from "crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  computeAllocationDecisionForBooking,
  writeAllocationDecisionLogForBooking,
} from "./allocation";
import { normalizeTable, normalizeZone } from "./allocation/normalize";
import type { FloorplanTable, FloorplanZone } from "./allocation/types";

// 🔹 Firebase Admin init – EGYSZER, LEGELŐL
admin.initializeApp();

// 🔹 Itt definiáljuk, és CSAK EZT használjuk mindenhol
const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;
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

const normalizePreferredTimeSlot = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const capped = trimmed.slice(0, 64);
  const safePattern = /^[a-zA-Z0-9:_\- ]+$/;
  if (!safePattern.test(capped)) return null;
  return capped;
};

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

const computeAllocationDiagnostics = (
  preferredTimeSlot: string | null,
  seatingPreference: SeatingPreference,
  zones: FloorplanZone[],
  tables: FloorplanTable[],
  matchedZoneId: string | null
): AllocationDiagnostics => {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!zones.length) warnings.push('NO_ZONES');
  if (!tables.length) warnings.push('NO_TABLES');

  let intentQuality: 'none' | 'weak' | 'good' = 'none';

  if (seatingPreference === 'any') {
    if (preferredTimeSlot) intentQuality = 'weak';
  } else if (!matchedZoneId) {
    intentQuality = 'weak';
    reasons.push('ZONE_NO_MATCH');
  } else {
    intentQuality = 'good';
  }

  return {
    intentQuality,
    matchedZoneId: matchedZoneId || null,
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
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 16);
  const docId = `${unitId}_${ipHash}`;
  const ref = db.collection('guest_rate_limits').doc(docId);

  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const now = Date.now();
    const data = snap.exists ? snap.data() || {} : {};
    const windowStartMs =
      typeof data.windowStartMs === 'number' ? data.windowStartMs : now;
    const count = typeof data.count === 'number' ? data.count : 0;
    const withinWindow = now - windowStartMs < RATE_LIMIT_WINDOW_MS;

    if (withinWindow && count >= RATE_LIMIT_MAX) {
      throw new Error('RATE_LIMIT');
    }

    if (!withinWindow) {
      transaction.set(ref, { windowStartMs: now, count: 1 }, { merge: true });
      return;
    }

    transaction.set(
      ref,
      { windowStartMs, count: count + 1 },
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

          if (latest.startTime && latest.headcount > 0) {
            const startDate = latest.startTime.toDate();
            const dateKey = toDateKey(startDate);
            const capacityRef = db
              .collection('units')
              .doc(unitId)
              .collection('reservation_capacity')
              .doc(dateKey);
            const capacitySnap = await transaction.get(capacityRef);
            const currentCount = capacitySnap.exists
              ? (capacitySnap.data()?.count as number) || 0
              : 0;
            const nextCount = Math.max(0, currentCount - (latest.headcount || 0));
            transaction.set(
              capacityRef,
              {
                date: dateKey,
                count: nextCount,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }

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

export const guestCreateReservation = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
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
        const nextCount = currentCount + headcount;

        if (typeof limit === 'number' && nextCount > limit) {
          throw new Error('CAPACITY_FULL');
        }

        const reservationRef = reservationsRef.doc();
        const referenceCode = reservationRef.id;

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
          skipCreateEmails: true,
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

        return { bookingId: referenceCode };
      });

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

      res.status(200).json({ ...createResult, manageToken });
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

        const status = action === 'approve' ? 'confirmed' : 'cancelled';
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
  startTime: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  endTime?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date | null;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  notes?: string;
  phone?: string;
  email?: string;
  contact?: {
    phoneE164?: string;
    email?: string;
  };
  locale?: 'hu' | 'en';
  cancelledAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  cancelReason?: string;
  referenceCode?: string;
  reservationMode?: 'auto' | 'request';
  adminActionToken?: string;
  adminActionTokenHash?: string;
  adminActionHandledAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  adminActionSource?: 'email' | 'manual';
  cancelledBy?: 'guest' | 'admin' | 'system';
  customData?: Record<string, any>;
  manageTokenHash?: string;
  skipCreateEmails?: boolean;
}

interface QueuedEmail {
  typeId: string;
  unitId?: string | null;
  payload: Record<string, any>;
  createdAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  status: "pending" | "sent" | "error";
  errorMessage?: string;
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
        to: params.to,
      });
      throw new Error(`Email gateway error ${response.status}: ${text}`);
    }

    logger.info("EMAIL GATEWAY OK", {
      status: response.status,
      typeId: params.typeId,
      unitId: params.unitId,
      to: params.to,
    });
  } catch (err: any) {
    logger.error("sendEmail() FAILED", {
      typeId: params.typeId,
      unitId: params.unitId,
      to: params.to,
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
    if (Array.isArray(payload.adminEmails) && payload.adminEmails.length) {
      return payload.adminEmails;
    }
    if (unitId) {
      const recipients = await getAdminRecipientsOverride(
        unitId,
        typeId,
        []
      );
      return recipients;
    }
    return [];
  }

  if (typeId === "schedule_published") {
    if (Array.isArray(payload.recipients) && payload.recipients.length) {
      return payload.recipients;
    }
    if (unitId) {
      const recipients = await getAdminRecipientsOverride(
        unitId,
        typeId,
        []
      );
      return recipients;
    }
    return [];
  }

  if (typeId === "leave_request_approved" || typeId === "leave_request_rejected") {
    if (typeof payload.userEmail === "string" && payload.userEmail) {
      return [payload.userEmail];
    }
    if (typeof payload.email === "string" && payload.email) {
      return [payload.email];
    }
    return [];
  }

  if (typeId === "register_welcome") {
    if (typeof payload.email === "string" && payload.email) {
      return [payload.email];
    }
    return [];
  }

  return [];
};

type TimestampLike =
  | FirebaseFirestore.Timestamp
  | admin.firestore.Timestamp;

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
  start: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date,
  end: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date | null | undefined,
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

export const onQueuedEmailCreated = onDocumentCreated(
  {
    region: REGION,
    document: "email_queue/{emailId}",
  },
  async event => {
    const queued = event.data?.data() as QueuedEmail | undefined;
    const emailId = event.params.emailId as string;
    const ref = db.doc(`email_queue/${emailId}`);

    if (!queued || !queued.typeId || !queued.payload) {
      logger.error("Queued email missing required fields", { emailId });
      return;
    }

    const { typeId, unitId = null, payload } = queued;
    const template = queuedEmailTemplates[typeId as keyof typeof queuedEmailTemplates];

    if (!template) {
      logger.error("No template found for queued email", { typeId, emailId });
      await ref.update({
        status: "error",
        errorMessage: `No template for typeId ${typeId}`,
      });
      return;
    }

    const allowed = await shouldSendEmail(typeId, unitId);
    if (!allowed) {
      logger.info("Email sending disabled via settings", { typeId, unitId, emailId });
      await ref.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    try {
      const recipients = await resolveQueuedEmailRecipients(typeId, unitId, payload);

      if (!recipients.length) {
        throw new Error("No recipients resolved for queued email");
      }

      const subject = renderTemplate(template.subject, payload);
      const html = renderTemplate(template.html, payload);

      await sendEmail({
        typeId,
        unitId: unitId || undefined,
        to: recipients,
        subject,
        html,
        payload,
      });

      await ref.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      logger.error("Failed to process queued email", { typeId, emailId, message: err?.message });
      await ref.update({
        status: "error",
        errorMessage: err?.message || "Unknown error",
      });
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
              after.startTime instanceof admin.firestore.Timestamp
                ? after.startTime.toDate()
                : after.startTime instanceof Date
                ? after.startTime
                : new Date(after.startTime as any);
            const dateKey = toDateKey(startDate);
            const capacityRef = db
              .collection('units')
              .doc(unitId)
              .collection('reservation_capacity')
              .doc(dateKey);
            const capacitySnap = await transaction.get(capacityRef);
            const currentCount = capacitySnap.exists
              ? (capacitySnap.data()?.count as number) || 0
              : 0;
            const nextCount = Math.max(0, currentCount - (after.headcount || 0));
            transaction.set(
              capacityRef,
              {
                date: dateKey,
                count: nextCount,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
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
