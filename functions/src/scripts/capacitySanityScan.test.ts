import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCapacityAnomalies } from './capacitySanityScan';

test('detectCapacityAnomalies flags missing counts', () => {
  const result = detectCapacityAnomalies({ byTimeSlot: { morning: 2 } });
  assert.ok(result.anomalies.includes('missing-counts'));
});

test('detectCapacityAnomalies flags count mismatch', () => {
  const result = detectCapacityAnomalies({ totalCount: 3, count: 2 });
  assert.ok(result.anomalies.includes('count-mismatch'));
});

test('detectCapacityAnomalies flags totalCount invalid', () => {
  const result = detectCapacityAnomalies({ totalCount: -1, count: 0 });
  assert.ok(result.anomalies.includes('totalCount-invalid'));
});

test('detectCapacityAnomalies flags byTimeSlot invalid values', () => {
  const result = detectCapacityAnomalies({
    totalCount: 2,
    count: 2,
    byTimeSlot: { morning: -1, evening: 3 },
  });
  assert.ok(result.anomalies.includes('byTimeSlot-invalid'));
});

test('detectCapacityAnomalies flags byTimeSlot sum mismatch', () => {
  const result = detectCapacityAnomalies({
    totalCount: 3,
    count: 3,
    byTimeSlot: { morning: 1, evening: 1 },
  });
  assert.ok(result.anomalies.includes('byTimeSlot-sum-mismatch'));
});

test('detectCapacityAnomalies is clean when data matches', () => {
  const result = detectCapacityAnomalies({
    totalCount: 2,
    count: 2,
    byTimeSlot: { morning: 1, evening: 1 },
  });
  assert.deepEqual(result.anomalies, []);
});
