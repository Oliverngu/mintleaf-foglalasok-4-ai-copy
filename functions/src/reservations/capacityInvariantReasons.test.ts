import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY_INVARIANT_REASONS,
  isCapacityInvariantReason,
} from './capacityInvariantReasons';

test('isCapacityInvariantReason accepts known reasons', () => {
  for (const reason of Object.values(CAPACITY_INVARIANT_REASONS)) {
    assert.equal(isCapacityInvariantReason(reason), true);
  }
});

test('isCapacityInvariantReason rejects unknown reasons', () => {
  assert.equal(isCapacityInvariantReason('not-a-reason'), false);
});
