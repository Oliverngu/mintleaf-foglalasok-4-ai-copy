import { CAPACITY_INVARIANT_REASONS } from './capacityInvariantReasons';
import type { CapacityInvariantReason } from './capacityInvariantReasons';

export interface CapacityDoc {
  totalCount: number;
  count?: number;
  byTimeSlot?: Record<string, number>;
}

export type CapacityWriteNormalization = {
  payload: CapacityDoc;
  deletesByTimeSlot: boolean;
  reasons: CapacityInvariantReason[];
};

export const readCapacityBase = (data: unknown): number => {
  if (!data || typeof data !== 'object') return 0;
  const record = data as Record<string, unknown>;
  if (typeof record.totalCount === 'number') return record.totalCount;
  if (typeof record.count === 'number') return record.count;
  return 0;
};

const normalizeByTimeSlot = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, slotValue]) =>
      typeof slotValue === 'number' && Number.isFinite(slotValue) && slotValue >= 0
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
};

export const normalizeCapacityDoc = (data: unknown): CapacityDoc => {
  if (!data || typeof data !== 'object') {
    return { totalCount: 0 };
  }
  const record = data as Record<string, unknown>;
  const baseCount = readCapacityBase(record);
  const totalCount = Math.max(0, baseCount);
  const count = totalCount;
  let byTimeSlot = normalizeByTimeSlot(record.byTimeSlot);
  if (totalCount === 0) {
    byTimeSlot = undefined;
  } else if (byTimeSlot) {
    const sum = Object.values(byTimeSlot).reduce((acc, value) => acc + value, 0);
    if (sum !== totalCount) {
      byTimeSlot = undefined;
    }
  }
  return {
    totalCount,
    count,
    ...(byTimeSlot ? { byTimeSlot } : {}),
  };
};

export const normalizeCapacityForWrite = (data: unknown): CapacityWriteNormalization => {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawTotal = typeof record.totalCount === 'number' ? record.totalCount : undefined;
  const rawCount = typeof record.count === 'number' ? record.count : undefined;
  const reasons: CapacityInvariantReason[] = [];

  let totalCount = Number.isFinite(rawTotal)
    ? rawTotal
    : Number.isFinite(rawCount)
    ? rawCount
    : 0;
  if (!Number.isFinite(totalCount) || totalCount < 0) {
    reasons.push(CAPACITY_INVARIANT_REASONS.totalCountInvalid);
    totalCount = 0;
  }
  if (rawCount !== totalCount) {
    reasons.push(CAPACITY_INVARIANT_REASONS.countMismatch);
  }

  const hasByTimeSlot = Object.prototype.hasOwnProperty.call(record, 'byTimeSlot');
  let byTimeSlot: Record<string, number> | undefined;
  if (hasByTimeSlot) {
    if (totalCount === 0) {
      reasons.push(CAPACITY_INVARIANT_REASONS.byTimeSlotRemovedZero);
    } else {
      const normalizedSlots = normalizeByTimeSlot(record.byTimeSlot);
      if (!normalizedSlots) {
        reasons.push(CAPACITY_INVARIANT_REASONS.byTimeSlotInvalid);
      } else {
        const sum = Object.values(normalizedSlots).reduce((acc, value) => acc + value, 0);
        if (sum !== totalCount) {
          reasons.push(CAPACITY_INVARIANT_REASONS.byTimeSlotSumMismatch);
        } else {
          byTimeSlot = normalizedSlots;
        }
      }
    }
  }

  const payload: CapacityDoc = {
    totalCount,
    count: totalCount,
    ...(byTimeSlot ? { byTimeSlot } : {}),
  };

  return {
    payload,
    deletesByTimeSlot: hasByTimeSlot && !byTimeSlot,
    reasons,
  };
};

export const applyCapacityDelta = (
  prevDoc: CapacityDoc,
  delta: { totalDelta: number; slotDeltas?: Record<string, number> }
): CapacityDoc => {
  const nextTotal = Math.max(0, prevDoc.totalCount + delta.totalDelta);
  if (nextTotal === 0) {
    return { totalCount: 0, count: 0 };
  }
  const nextCount = nextTotal;

  let nextByTimeSlot = prevDoc.byTimeSlot ? { ...prevDoc.byTimeSlot } : undefined;
  if (nextByTimeSlot && delta.slotDeltas) {
    for (const [slotKey, slotDelta] of Object.entries(delta.slotDeltas)) {
      if (typeof slotDelta !== 'number' || !Number.isFinite(slotDelta) || slotDelta === 0) continue;
      const currentSlot = typeof nextByTimeSlot[slotKey] === 'number' ? nextByTimeSlot[slotKey] : 0;
      const nextSlot = currentSlot + slotDelta;
      if (nextSlot <= 0) {
        delete nextByTimeSlot[slotKey];
      } else {
        nextByTimeSlot[slotKey] = nextSlot;
      }
    }
    if (Object.keys(nextByTimeSlot).length === 0) {
      nextByTimeSlot = undefined;
    }
  }
  if (nextByTimeSlot) {
    const slotValues = Object.values(nextByTimeSlot);
    const slotsValid = slotValues.every(
      value => typeof value === 'number' && Number.isFinite(value) && value >= 0
    );
    const sum = slotValues.reduce((acc, value) => acc + value, 0);
    if (!slotsValid || sum === 0 || sum !== nextTotal) {
      nextByTimeSlot = undefined;
    }
  }

  return {
    totalCount: nextTotal,
    count: nextCount,
    ...(nextByTimeSlot ? { byTimeSlot: nextByTimeSlot } : {}),
  };
};

export const slotKeyFromReservation = (reservation: Record<string, any> | null | undefined): string => {
  const intentSlot = reservation?.allocationIntent?.timeSlot;
  if (typeof intentSlot === 'string' && intentSlot.trim()) return intentSlot;
  const preferredSlot = reservation?.preferredTimeSlot;
  if (typeof preferredSlot === 'string' && preferredSlot.trim()) return preferredSlot;
  return '';
};
