import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldWarnCapacityInvariant } from './capacityLedgerService';

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
    reasons: ['count-mismatch'],
    prevHadSlots: false,
    unitId: 'unit',
    dateKey: '2024-01-01',
  });
  assert.equal(result, false);
});

test('shouldWarnCapacityInvariant warns when slots were present', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: ['byTimeSlot-invalid'],
    prevHadSlots: true,
    unitId: 'unit',
    dateKey: '2024-01-02',
  });
  assert.equal(result, true);
});

test('shouldWarnCapacityInvariant warns for totalCount-invalid without slots', () => {
  const result = shouldWarnCapacityInvariant({
    reasons: ['totalCount-invalid'],
    prevHadSlots: false,
    unitId: 'unit',
    dateKey: '2024-01-03',
  });
  assert.equal(result, true);
});

test('shouldWarnCapacityInvariant rate-limits per key', () => {
  const args = {
    reasons: ['totalCount-invalid'],
    prevHadSlots: true,
    unitId: 'unit',
    dateKey: '2024-01-04',
    mutationTraceId: 'trace',
  };
  assert.equal(shouldWarnCapacityInvariant(args), true);
  assert.equal(shouldWarnCapacityInvariant(args), false);
});
