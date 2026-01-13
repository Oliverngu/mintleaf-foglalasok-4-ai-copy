import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { computeCapacityMutationPlan } from './capacityDelta';

export type CapacityLedger = {
  applied?: boolean;
  key?: string | null;
  count?: number | null;
  appliedAt?: Timestamp | null;
  lastMutationTraceId?: string | null;
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

  const desiredIncluded = countsTowardCapacity(nextStatus);
  const desiredKey = nextDateKey;
  const desiredCount = nextHeadcount;

  const mutations = computeCapacityMutationPlan({
    oldKey: currentKey,
    newKey: desiredKey,
    oldCount: currentCount,
    newCount: desiredCount,
    oldIncluded: currentApplied,
    newIncluded: desiredIncluded,
  });

  for (const mutation of mutations) {
    if (mutation.delta === 0) continue;
    const capacityRef = db
      .collection('units')
      .doc(unitId)
      .collection('reservation_capacity')
      .doc(mutation.key);
    transaction.set(
      capacityRef,
      {
        date: mutation.key,
        count: FieldValue.increment(mutation.delta),
        totalCount: FieldValue.increment(mutation.delta),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
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
