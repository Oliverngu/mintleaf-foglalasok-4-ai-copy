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

test('same day remove when no longer included', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 3,
    newCount: 3,
    oldIncluded: true,
    newIncluded: false,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-01', delta: -3 }]);
});

test('same day add when newly included', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 0,
    newCount: 2,
    oldIncluded: false,
    newIncluded: true,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-01', delta: 2 }]);
});

test('same day no-op when both excluded', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-01',
    oldCount: 2,
    newCount: 2,
    oldIncluded: false,
    newIncluded: false,
  });
  assert.deepEqual(mutations, []);
});

test('move to different day when included', () => {
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

test('move to different day remove only', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-02',
    oldCount: 4,
    newCount: 4,
    oldIncluded: true,
    newIncluded: false,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-01', delta: -4 }]);
});

test('move to different day add only', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-02',
    oldCount: 0,
    newCount: 5,
    oldIncluded: false,
    newIncluded: true,
  });
  assert.deepEqual(mutations, [{ key: '2025-01-02', delta: 5 }]);
});

test('move to different day no-op when excluded', () => {
  const mutations = computeCapacityMutationPlan({
    oldKey: '2025-01-01',
    newKey: '2025-01-02',
    oldCount: 3,
    newCount: 3,
    oldIncluded: false,
    newIncluded: false,
  });
  assert.deepEqual(mutations, []);
});
