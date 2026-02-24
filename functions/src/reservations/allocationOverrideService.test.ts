import test from 'node:test';
import assert from 'node:assert/strict';
import { mapOverrideDocToDecision } from './allocationOverrideService';

const base = {
  enabled: true,
  decision: 'accept' as const,
  source: 'admin',
};

test('mapOverrideDocToDecision returns null when disabled', () => {
  const result = mapOverrideDocToDecision({ ...base, enabled: false });
  assert.equal(result, null);
});

test('mapOverrideDocToDecision maps accept', () => {
  const result = mapOverrideDocToDecision({ ...base, decision: 'accept' });
  assert.deepEqual(result, {
    decision: 'accept',
    source: 'admin',
    reasonCode: null,
  });
});

test('mapOverrideDocToDecision maps reject with reason', () => {
  const result = mapOverrideDocToDecision({
    enabled: true,
    decision: 'reject',
    source: 'ops',
    reasonCode: 'OVERRIDE_REJECT',
  });
  assert.deepEqual(result, {
    decision: 'reject',
    source: 'ops',
    reasonCode: 'OVERRIDE_REJECT',
  });
});
