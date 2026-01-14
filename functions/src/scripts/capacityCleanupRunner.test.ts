import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapacityWrite } from './capacityCleanupRunner';

test('buildCapacityWrite returns delete when slots are invalid', () => {
  const plan = buildCapacityWrite({
    totalCount: 2,
    count: 2,
    byTimeSlot: { afternoon: -1, evening: 1 },
  });
  assert.deepEqual(plan, {
    payload: { totalCount: 2, count: 2 },
    deletesSlots: true,
  });
});

test('buildCapacityWrite returns payload when counts mismatch only', () => {
  const plan = buildCapacityWrite({
    totalCount: 3,
    count: 1,
  });
  assert.deepEqual(plan, {
    payload: { totalCount: 3, count: 3 },
    deletesSlots: false,
  });
});

test('buildCapacityWrite returns null when no cleanup is needed', () => {
  const plan = buildCapacityWrite({
    totalCount: 2,
    count: 2,
  });
  assert.equal(plan, null);
});
