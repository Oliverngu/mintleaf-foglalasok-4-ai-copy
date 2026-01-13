import test from 'node:test';
import assert from 'node:assert/strict';
import { countsTowardCapacity, resolveLedgerCurrentKey, toDateKeyLocal } from './capacityLedgerService';

test('countsTowardCapacity for accepted states', () => {
  assert.equal(countsTowardCapacity('confirmed'), true);
  assert.equal(countsTowardCapacity('pending'), true);
});

test('countsTowardCapacity for excluded states', () => {
  assert.equal(countsTowardCapacity('cancelled'), false);
  assert.equal(countsTowardCapacity('declined'), false);
  assert.equal(countsTowardCapacity('no_show'), false);
});

test('toDateKeyLocal formats local date keys', () => {
  const start = new Date('2025-02-03T10:00:00.000Z');
  const expectedKey = toDateKeyLocal(start);
  assert.equal(expectedKey, '2025-02-03');
});

test('resolveLedgerCurrentKey prefers reservation startTime', () => {
  const start = new Date('2025-02-03T10:00:00.000Z');
  const result = resolveLedgerCurrentKey({
    ledgerKey: null,
    reservationStartTime: start,
    nextDateKey: '2025-02-04',
  });
  assert.equal(result, '2025-02-03');
});
