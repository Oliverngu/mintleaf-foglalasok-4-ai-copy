import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCapacityMutationPlan } from './capacityDelta';

test('same day increase headcount', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 2,
    newCount: 4,
    oldIncluded: true,
    newIncluded: true,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-01', delta: 2 }]);
});

test('same day decrease headcount', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 5,
    newCount: 3,
    oldIncluded: true,
    newIncluded: true,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-01', delta: -2 }]);
});

test('move to different day', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-02',
    oldCount: 2,
    newCount: 3,
    oldIncluded: true,
    newIncluded: true,
  });
  assert.deepEqual(mutations, [
    { key: '2025-01-01', delta: -2 },
    { key: '2025-01-02', delta: 3 },
  ]);
});

test('override reject keeps old unchanged', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 2,
    newCount: 4,
    oldIncluded: true,
    newIncluded: false,
  });
  assert.deepEqual(mutations, []);
});
