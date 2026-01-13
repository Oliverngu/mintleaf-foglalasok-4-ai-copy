import test from 'node:test';
import assert from 'node:assert/strict';
import { countsTowardCapacity } from './capacityLedgerService';

test('countsTowardCapacity for accepted states', () => {
  assert.equal(countsTowardCapacity('confirmed'), true);
  assert.equal(countsTowardCapacity('pending'), true);
});

test('countsTowardCapacity for excluded states', () => {
  assert.equal(countsTowardCapacity('cancelled'), false);
  assert.equal(countsTowardCapacity('declined'), false);
  assert.equal(countsTowardCapacity('no_show'), false);
});
