import test from 'node:test';
import assert from 'node:assert/strict';
import { countsTowardCapacity, toDateKeyLocal } from './capacityLedgerService';

test('countsTowardCapacity for accepted states', () => {
  assert.equal(countsTowardCapacity('confirmed'), true);
  assert.equal(countsTowardCapacity('pending'), true);
});

test('countsTowardCapacity for excluded states', () => {
  assert.equal(countsTowardCapacity('cancelled'), false);
  assert.equal(countsTowardCapacity('declined'), false);
  assert.equal(countsTowardCapacity('no_show'), false);
});

test('ledger fallback prefers startTime dateKey', () => {
  const start = new Date('2025-02-03T10:00:00.000Z');
  const expectedKey = toDateKeyLocal(start);
  assert.equal(expectedKey, '2025-02-03');
});
