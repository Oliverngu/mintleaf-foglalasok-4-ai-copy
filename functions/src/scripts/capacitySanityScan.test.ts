import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapacityAnomalies } from './capacitySanityScan';
import { CAPACITY_INVARIANT_REASONS } from '../reservations/capacityInvariantReasons';

test('detectCapacityAnomalies flags missing counts', () => {
  const result = detectCapacityAnomalies({ byTimeSlot: { morning: 2 } });
  assert.ok(result.anomalies.includes(CAPACITY_INVARIANT_REASONS.missingCounts));
});

test('detectCapacityAnomalies flags count mismatch', () => {
  const result = detectCapacityAnomalies({ totalCount: 3, count: 2 });
  assert.ok(result.anomalies.includes(CAPACITY_INVARIANT_REASONS.countMismatch));
});

test('detectCapacityAnomalies flags totalCount invalid', () => {
  const result = detectCapacityAnomalies({ totalCount: -1, count: 0 });
  assert.ok(result.anomalies.includes(CAPACITY_INVARIANT_REASONS.totalCountInvalid));
});

test('detectCapacityAnomalies flags byTimeSlot invalid values', () => {
  const result = detectCapacityAnomalies({
    totalCount: 2,
    count: 2,
    byTimeSlot: { morning: -1, evening: 3 },
  });
  assert.ok(result.anomalies.includes(CAPACITY_INVARIANT_REASONS.byTimeSlotInvalid));
});

test('detectCapacityAnomalies flags byTimeSlot sum mismatch', () => {
  const result = detectCapacityAnomalies({
    totalCount: 3,
    count: 3,
    byTimeSlot: { morning: 1, evening: 1 },
  });
  assert.ok(result.anomalies.includes(CAPACITY_INVARIANT_REASONS.byTimeSlotSumMismatch));
});

test('detectCapacityAnomalies is clean when data matches', () => {
  const result = detectCapacityAnomalies({
    totalCount: 2,
    count: 2,
    byTimeSlot: { morning: 1, evening: 1 },
  });
  assert.deepEqual(result.anomalies, []);
});
