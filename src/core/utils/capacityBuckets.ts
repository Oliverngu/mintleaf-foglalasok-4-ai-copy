type CapacityBucketInput = {
  startTime: Date;
  endTime: Date;
  bufferMinutes: number;
  bucketMinutes: number;
};

const toBucketKey = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Matches functions/src/reservations/capacityLedgerService.ts bucket math:
 * - Buckets start at the floor of startTime.
 * - End boundary is exclusive.
 * - Buffer is applied after endTime (server behavior).
 */
export const computeReservationBucketKeysClient = ({
  startTime,
  endTime,
  bufferMinutes,
  bucketMinutes,
}: CapacityBucketInput): string[] => {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime() + bufferMinutes * 60 * 1000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const dayStart = new Date(startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  const clampedStart = Math.max(startMs, dayStartMs);
  const clampedEnd = Math.min(endMs, dayEndMs);
  if (clampedEnd <= clampedStart) return [];
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  const firstBucket = Math.floor(clampedStart / bucketMs) * bucketMs;
  const keys: string[] = [];
  for (let t = firstBucket; t < clampedEnd; t += bucketMs) {
    keys.push(toBucketKey(new Date(t)));
  }
  return Array.from(new Set(keys));
};
