import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { computeCapacityMutationPlan } from './capacityDelta';
import {
  applyCapacityDelta,
  normalizeCapacityDoc,
  normalizeCapacityForWrite,
  slotKeyFromReservation,
} from './capacityDocContract';
import { CAPACITY_INVARIANT_REASONS } from './capacityInvariantReasons';
import type { CapacityInvariantReason } from './capacityInvariantReasons';

export type CapacityLedger = {
  applied?: boolean;
  key?: string | null;
  count?: number | null;
  appliedAt?: Timestamp | null;
  lastMutationTraceId?: string | null;
};

const warnedCapacityInvariantKeys = new Set<string>();
const warnedCapacityReplayKeys = new Set<string>();

export const shouldWarnCapacityInvariant = ({
  reasons,
  prevHadSlots,
  unitId,
  dateKey,
  mutationTraceId,
}: {
  reasons: CapacityInvariantReason[];
  prevHadSlots: boolean;
  unitId: string;
  dateKey: string;
  mutationTraceId?: string | null;
}) => {
  if (reasons.length === 0) return false;
  const severe = reasons.includes(CAPACITY_INVARIANT_REASONS.totalCountInvalid);
  if (!prevHadSlots && !severe) return false;
  const key = `${unitId}/${dateKey}/${mutationTraceId ?? 'no-trace'}`;
  if (warnedCapacityInvariantKeys.has(key)) return false;
  warnedCapacityInvariantKeys.add(key);
  return true;
};

export const isLedgerReplay = ({
  ledger,
  desiredIncluded,
  desiredKey,
  desiredCount,
  mutationTraceId,
}: {
  ledger: CapacityLedger;
  desiredIncluded: boolean;
  desiredKey: string;
  desiredCount: number;
  mutationTraceId?: string | null;
}) => {
  if (!mutationTraceId) return false;
  if (ledger.lastMutationTraceId !== mutationTraceId) return false;
  if (ledger.applied !== desiredIncluded) return false;
  if (desiredIncluded) {
    return ledger.key === desiredKey && ledger.count === desiredCount;
  }
  return ledger.key == null && ledger.count == null;
};

export const shouldSkipCapacityMutation = ({
  mutationTraceId,
  capacityTraceId,
}: {
  mutationTraceId?: string | null;
  capacityTraceId?: string | null;
}) => Boolean(mutationTraceId && capacityTraceId && mutationTraceId === capacityTraceId);

const shouldWarnCapacityReplay = ({
  unitId,
  reservationId,
  mutationTraceId,
}: {
  unitId: string;
  reservationId: string;
  mutationTraceId?: string | null;
}) => {
  if (!mutationTraceId) return false;
  const key = `${unitId}/${reservationId}/${mutationTraceId}`;
  if (warnedCapacityReplayKeys.has(key)) return false;
  warnedCapacityReplayKeys.add(key);
  return true;
};

export const toDateKeyLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const resolveLedgerCurrentKey = ({
  ledgerKey,
  reservationStartTime,
  nextDateKey,
}: {
  ledgerKey?: string | null;
  reservationStartTime?: Date | null;
  nextDateKey: string;
}) => {
  if (typeof ledgerKey === 'string' && ledgerKey) {
    return ledgerKey;
  }
  if (
    reservationStartTime instanceof Date &&
    Number.isFinite(reservationStartTime.getTime())
  ) {
    return toDateKeyLocal(reservationStartTime);
  }
  return nextDateKey;
};

export const countsTowardCapacity = (status: string | null | undefined): boolean => {
  if (!status) return false;
  if (status === 'cancelled' || status === 'declined' || status === 'no_show') {
    return false;
  }
  return status === 'confirmed' || status === 'pending' || status === 'approved' || status === 'accepted';
};

export const applyCapacityLedgerTx = async ({
  transaction,
  db,
  unitId,
  reservationRef,
  reservationData,
  nextStatus,
  nextDateKey,
  nextHeadcount,
  mutationTraceId,
}: {
  transaction: Transaction;
  db: Firestore;
  unitId: string;
  reservationRef: FirebaseFirestore.DocumentReference;
  reservationData?: Record<string, any> | null;
  nextStatus: string;
  nextDateKey: string;
  nextHeadcount: number;
  mutationTraceId?: string | null;
}): Promise<void> => {
  const reservation = reservationData
    ? reservationData
    : (await transaction.get(reservationRef)).data() || {};

  const ledger = (reservation.capacityLedger || {}) as CapacityLedger;
  const currentApplied = ledger.applied === true;
  const reservationStart = reservation.startTime?.toDate
    ? reservation.startTime.toDate()
    : reservation.startTime instanceof Date
    ? reservation.startTime
    : null;
  const currentKey = resolveLedgerCurrentKey({
    ledgerKey: ledger.key ?? null,
    reservationStartTime: reservationStart,
    nextDateKey,
  });
  const currentCount =
    typeof ledger.count === 'number'
      ? ledger.count
      : typeof reservation.headcount === 'number'
      ? reservation.headcount
      : 0;
  const currentSlotKey = slotKeyFromReservation(reservation);
  const desiredSlotKey = slotKeyFromReservation(reservation);

  const desiredIncluded = countsTowardCapacity(nextStatus);
  const desiredKey = nextDateKey;
  const desiredCount = nextHeadcount;

  if (
    isLedgerReplay({
      ledger,
      desiredIncluded,
      desiredKey,
      desiredCount,
      mutationTraceId,
    })
  ) {
    if (
      shouldWarnCapacityReplay({
        unitId,
        reservationId: reservationRef.id,
        mutationTraceId,
      })
    ) {
      console.warn(
        `[capacity-replay] unitId=${unitId} reservationId=${reservationRef.id} ` +
          `traceId=${mutationTraceId} desiredKey=${desiredKey} desiredCount=${desiredCount} ` +
          `desiredIncluded=${desiredIncluded} ledgerKey=${ledger.key ?? 'null'} ` +
          `ledgerCount=${ledger.count ?? 'null'} ledgerApplied=${ledger.applied ?? 'null'}`
      );
    }
    return;
  }

  const mutations = computeCapacityMutationPlan({
    oldKey: currentKey,
    newKey: desiredKey,
    oldCount: currentCount,
    newCount: desiredCount,
    oldIncluded: currentApplied,
    newIncluded: desiredIncluded,
    oldSlotKey: currentSlotKey,
    newSlotKey: desiredSlotKey,
  });

  for (const mutation of mutations) {
    const hasSlotDeltas = mutation.slotDeltas && Object.keys(mutation.slotDeltas).length > 0;
    if (mutation.totalDelta === 0 && !hasSlotDeltas) continue;
    const capacityRef = db
      .collection('units')
      .doc(unitId)
      .collection('reservation_capacity')
      .doc(mutation.key);
    const capacitySnap = await transaction.get(capacityRef);
    const capacityData = capacitySnap.exists ? capacitySnap.data() || {} : {};
    if (
      shouldSkipCapacityMutation({
        mutationTraceId,
        capacityTraceId: (capacityData.lastMutationTraceId as string | null | undefined) ?? null,
      })
    ) {
      continue;
    }
    const prevDoc = normalizeCapacityDoc(capacityData);
    const nextDoc = applyCapacityDelta(prevDoc, {
      totalDelta: mutation.totalDelta,
      slotDeltas: mutation.slotDeltas,
    });
    const normalized = normalizeCapacityForWrite(nextDoc);
    const update: Record<string, unknown> = {
      date: mutation.key,
      totalCount: normalized.payload.totalCount,
      updatedAt: FieldValue.serverTimestamp(),
      count: normalized.payload.count ?? normalized.payload.totalCount,
    };
    if (mutationTraceId) {
      update.lastMutationTraceId = mutationTraceId;
    }
    const prevHadSlots = !!prevDoc.byTimeSlot;
    if (normalized.payload.byTimeSlot) {
      update.byTimeSlot = normalized.payload.byTimeSlot;
    } else if (normalized.deletesByTimeSlot && prevHadSlots) {
      update.byTimeSlot = FieldValue.delete();
    }
    if (
      shouldWarnCapacityInvariant({
        reasons: normalized.reasons,
        prevHadSlots,
        unitId,
        dateKey: mutation.key,
        mutationTraceId,
      })
    ) {
      const slotKeys = mutation.slotDeltas ? Object.keys(mutation.slotDeltas) : [];
      const slotKey = slotKeys.length === 1 ? slotKeys[0] : null;
      const slotInfo = slotKey ? ` slotKey=${slotKey}` : '';
      console.warn(
        `[capacity-invariant] unitId=${unitId} dateKey=${mutation.key}${slotInfo} ` +
          `reasons=${JSON.stringify(normalized.reasons)}`
      );
    }
    transaction.set(capacityRef, update, { merge: true });
  }

  const appliedAt =
    desiredIncluded && !currentApplied
      ? FieldValue.serverTimestamp()
      : desiredIncluded
      ? ledger.appliedAt ?? FieldValue.serverTimestamp()
      : null;

  transaction.update(reservationRef, {
    capacityLedger: {
      applied: desiredIncluded,
      key: desiredIncluded ? desiredKey : null,
      count: desiredIncluded ? desiredCount : null,
      appliedAt,
      lastMutationTraceId: mutationTraceId ?? ledger.lastMutationTraceId ?? null,
    },
  });
};
