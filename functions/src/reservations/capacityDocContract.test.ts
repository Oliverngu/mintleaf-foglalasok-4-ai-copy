import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCapacityDelta,
  normalizeCapacityDoc,
  readCapacityBase,
  slotKeyFromReservation,
} from './capacityDocContract';
import { normalizeCapacitySnapshot } from './capacityCleanup';

test('readCapacityBase prefers totalCount then count', () => {
  assert.equal(readCapacityBase({ totalCount: 5, count: 9 }), 5);
  assert.equal(readCapacityBase({ count: 3 }), 3);
  assert.equal(readCapacityBase({}), 0);
});

test('normalizeCapacityDoc hydrates totals and filters byTimeSlot', () => {
  const normalized = normalizeCapacityDoc({
    count: 2,
    byTimeSlot: { afternoon: 2, evening: 'nope', night: 0, late: -1 },
  });
  assert.equal(normalized.totalCount, 2);
  assert.equal(normalized.count, 2);
  assert.deepEqual(normalized.byTimeSlot, { afternoon: 2, night: 0 });
});

test('normalizeCapacityDoc drops byTimeSlot when totalCount is zero', () => {
  const normalized = normalizeCapacityDoc({
    totalCount: 0,
    byTimeSlot: { afternoon: 1 },
  });
  assert.equal(normalized.totalCount, 0);
  assert.equal(normalized.byTimeSlot, undefined);
});

test('normalizeCapacityDoc drops byTimeSlot when sum mismatches total', () => {
  const normalized = normalizeCapacityDoc({
    totalCount: 3,
    byTimeSlot: { afternoon: 1, evening: 1 },
  });
  assert.equal(normalized.totalCount, 3);
  assert.equal(normalized.byTimeSlot, undefined);
});

test('normalizeCapacityDoc mirrors count to totalCount', () => {
  const normalized = normalizeCapacityDoc({ totalCount: 4, count: 9 });
  assert.equal(normalized.count, 4);
});

test('applyCapacityDelta updates totals and legacy count', () => {
  const next = applyCapacityDelta({ totalCount: 4, count: 4 }, { totalDelta: -2 });
  assert.equal(next.totalCount, 2);
  assert.equal(next.count, 2);
});

test('applyCapacityDelta updates byTimeSlot when present', () => {
  const next = applyCapacityDelta(
    { totalCount: 3, byTimeSlot: { afternoon: 2, evening: 1 } },
    { totalDelta: -2, slotDeltas: { afternoon: -2 } }
  );
  assert.equal(next.totalCount, 1);
  assert.deepEqual(next.byTimeSlot, { evening: 1 });
});

test('applyCapacityDelta keeps byTimeSlot sum aligned with totalCount', () => {
  const next = applyCapacityDelta(
    { totalCount: 5, byTimeSlot: { afternoon: 2, evening: 3 } },
    { totalDelta: 2, slotDeltas: { evening: 2 } }
  );
  const sum = Object.values(next.byTimeSlot || {}).reduce((acc, value) => acc + value, 0);
  assert.equal(next.totalCount, 7);
  assert.equal(sum, next.totalCount);
});

test('applyCapacityDelta clamps negative totals to zero', () => {
  const next = applyCapacityDelta({ totalCount: 1, byTimeSlot: { afternoon: 1 } }, { totalDelta: -5 });
  assert.equal(next.totalCount, 0);
  assert.equal(next.count, 0);
  assert.equal(next.byTimeSlot, undefined);
});

test('applyCapacityDelta does not create byTimeSlot when absent', () => {
  const next = applyCapacityDelta({ totalCount: 2 }, { totalDelta: 0, slotDeltas: { evening: 2 } });
  assert.equal(next.byTimeSlot, undefined);
});

test('applyCapacityDelta drops byTimeSlot when sum mismatches total', () => {
  const next = applyCapacityDelta(
    { totalCount: 4, byTimeSlot: { afternoon: 2, evening: 2 } },
    { totalDelta: -1 }
  );
  assert.equal(next.totalCount, 3);
  assert.equal(next.byTimeSlot, undefined);
});

test('applyCapacityDelta ignores zero and non-finite slot deltas', () => {
  const next = applyCapacityDelta(
    { totalCount: 4, byTimeSlot: { afternoon: 2, evening: 2 } },
    { totalDelta: 0, slotDeltas: { afternoon: 0, evening: Number.NaN } }
  );
  assert.equal(next.totalCount, 4);
  assert.deepEqual(next.byTimeSlot, { afternoon: 2, evening: 2 });
});

test('normalizeCapacitySnapshot drops invalid slot breakdowns', () => {
  const result = normalizeCapacitySnapshot({
    totalCount: 2,
    count: 2,
    byTimeSlot: { afternoon: -1, evening: 1 },
  });
  assert.deepEqual(result, {
    update: { totalCount: 2, count: 2 },
    deletes: ['byTimeSlot'],
  });
});

test('normalizeCapacitySnapshot ignores negative slots in raw sum checks', () => {
  const result = normalizeCapacitySnapshot({
    totalCount: 0,
    count: 0,
    byTimeSlot: { afternoon: -3 },
  });
  assert.deepEqual(result, {
    update: { totalCount: 0, count: 0 },
    deletes: ['byTimeSlot'],
  });
});

test('normalizeCapacitySnapshot clears slots when totalCount is zero', () => {
  const result = normalizeCapacitySnapshot({
    totalCount: 0,
    count: 0,
    byTimeSlot: { afternoon: 1 },
  });
  assert.deepEqual(result, {
    update: { totalCount: 0, count: 0 },
    deletes: ['byTimeSlot'],
  });
});

test('normalizeCapacitySnapshot omits update when no slot cleanup is needed', () => {
  const unchanged = normalizeCapacitySnapshot({ totalCount: 2, count: 2 });
  assert.deepEqual(unchanged, {});
  const adjusted = normalizeCapacitySnapshot({ totalCount: 2, count: 1 });
  assert.deepEqual(adjusted, { update: { totalCount: 2, count: 2 } });
});

test('slotKeyFromReservation prefers allocation intent then preferredTimeSlot', () => {
  assert.equal(slotKeyFromReservation({ allocationIntent: { timeSlot: 'evening' } }), 'evening');
  assert.equal(slotKeyFromReservation({ preferredTimeSlot: 'afternoon' }), 'afternoon');
  assert.equal(
    slotKeyFromReservation({ allocationIntent: { timeSlot: ' ' }, preferredTimeSlot: 'night' }),
    'night'
  );
  assert.equal(slotKeyFromReservation({}), '');
});
