export const CAPACITY_INVARIANT_REASONS = {
  missingCounts: 'missing-counts',
  countMismatch: 'count-mismatch',
  totalCountInvalid: 'totalCount-invalid',
  byTimeSlotInvalid: 'byTimeSlot-invalid',
  byTimeSlotSumMismatch: 'byTimeSlot-sum-mismatch',
  byTimeSlotRemovedZero: 'byTimeSlot-removed-zero',
} as const;

export type CapacityInvariantReason =
  (typeof CAPACITY_INVARIANT_REASONS)[keyof typeof CAPACITY_INVARIANT_REASONS];

const capacityInvariantReasonSet = new Set<string>(
  Object.values(CAPACITY_INVARIANT_REASONS)
);

export const isCapacityInvariantReason = (value: string): value is CapacityInvariantReason =>
  capacityInvariantReasonSet.has(value);
