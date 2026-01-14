import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldWarnCapacityInvariant } from './capacityLedgerService';
import { CAPACITY_INVARIANT_REASONS } from './capacityInvariantReasons';

test('shouldWarnCapacityInvariant returns false with no reasons', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: [],
    prevHadSlots: true,
    unitId: 'unit',
    dateKey: '2024-01-01',
  });
  assert.equal(result, false);
});

test('shouldWarnCapacityInvariant ignores non-severe reasons without slots', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: [CAPACITY_INVARIANT_REASONS.countMismatch],
    prevHadSlots: false,
    unitId: 'unit',
    dateKey: '2024-01-01',
  });
  assert.equal(result, false);
});

test('shouldWarnCapacityInvariant warns when slots were present', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: [CAPACITY_INVARIANT_REASONS.byTimeSlotInvalid],
    prevHadSlots: true,
    unitId: 'unit',
    dateKey: '2024-01-02',
  });
  assert.equal(result, true);
});

test('shouldWarnCapacityInvariant warns for totalCount-invalid without slots', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: [CAPACITY_INVARIANT_REASONS.totalCountInvalid],
    prevHadSlots: false,
    unitId: 'unit',
    dateKey: '2024-01-03',
  });
  assert.equal(result, true);
});

test('shouldWarnCapacityInvariant rate-limits per key', () => {
  const args = {
    reasons: [CAPACITY_INVARIANT_REASONS.totalCountInvalid],
    prevHadSlots: true,
    unitId: 'unit',
    dateKey: '2024-01-04',
    mutationTraceId: 'trace',
  };
  assert.equal(shouldWarnCapacityInvariant(args), true);
  assert.equal(shouldWarnCapacityInvariant(args), false);
});
