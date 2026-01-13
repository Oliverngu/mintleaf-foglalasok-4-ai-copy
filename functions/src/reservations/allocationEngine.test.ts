import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAllocation } from './allocationEngine';
import type { AllocationEngineInput } from './allocationEngine';

const baseInput = (): AllocationEngineInput => ({
  unitId: 'unit-1',
  dateKey: '2025-01-01',
  startTime: new Date('2025-01-01T12:00:00.000Z'),
  endTime: new Date('2025-01-01T13:00:00.000Z'),
  partySize: 4,
  capacitySnapshot: { currentCount: 10, limit: 20 },
  settings: { bookableWindow: { from: '10:00', to: '22:00' } },
});

test('capacity available => accept', () => {
  const result = decideAllocation(baseInput());
  assert.equal(result.decision.status, 'accepted');
  assert.equal(result.decision.reasonCode, 'CAPACITY_AVAILABLE');
});

test('capacity full => reject', () => {
  const input = baseInput();
  input.capacitySnapshot = { currentCount: 19, limit: 20 };
  input.partySize = 2;
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'CAPACITY_FULL');
});

test('override accept despite full => accept', () => {
  const input = baseInput();
  input.capacitySnapshot = { currentCount: 20, limit: 20 };
  input.overrides = { decision: 'accept', source: 'admin' };
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'accepted');
  assert.equal(result.decision.reasonCode, 'OVERRIDE_ACCEPT');
});

test('override reject despite available => reject', () => {
  const input = baseInput();
  input.overrides = { decision: 'reject', source: 'admin' };
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'OVERRIDE_REJECT');
});

test('invalid time (outside open hours) => reject', () => {
  const input = baseInput();
  input.startTime = new Date('2025-01-01T23:30:00.000Z');
  input.endTime = new Date('2025-01-02T00:30:00.000Z');
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'OUTSIDE_BOOKABLE_WINDOW');
});

test('boundary time (exact open) => accept', () => {
  const input = baseInput();
  input.startTime = new Date('2025-01-01T10:00:00.000Z');
  input.endTime = new Date('2025-01-01T11:00:00.000Z');
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'accepted');
});

test('boundary time (exact close) => reject', () => {
  const input = baseInput();
  input.startTime = new Date('2025-01-01T22:00:00.000Z');
  input.endTime = new Date('2025-01-01T23:00:00.000Z');
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'OUTSIDE_BOOKABLE_WINDOW');
});

test('partySize extreme (0) => reject', () => {
  const input = baseInput();
  input.partySize = 0;
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'INVALID_INPUT');
});

test('missing unitId/date => reject', () => {
  const input = baseInput();
  input.unitId = '';
  input.dateKey = '';
  const result = decideAllocation(input);
  assert.equal(result.decision.status, 'rejected');
  assert.equal(result.decision.reasonCode, 'INVALID_INPUT');
});

test('determinism check (same input => same output)', () => {
  const input = baseInput();
  const first = decideAllocation(input);
  const second = decideAllocation(input);
  assert.deepEqual(first, second);
});
