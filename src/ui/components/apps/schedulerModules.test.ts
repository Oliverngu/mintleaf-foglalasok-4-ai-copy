import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp, getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

import type { Shift, User } from '../../../core/models/data';
import { assertShiftUnitBoundary, SchedulerGuardError } from './schedulerGuards.ts';
import { buildPublishPlan } from './schedulerPublish.ts';
import { batchUpdateShifts, sanitizeShiftPayload } from './schedulerShiftWrites.ts';

const baseShift = (overrides: Partial<Shift>): Shift => ({
  id: 'shift-1',
  userId: 'user-1',
  userName: 'Teszt Elek',
  unitId: 'unit-a',
  position: 'Pultos',
  status: 'draft',
  start: Timestamp.fromDate(new Date('2025-01-13T08:00:00.000Z')),
  end: Timestamp.fromDate(new Date('2025-01-13T16:00:00.000Z')),
  ...overrides,
});

test('sanitizeShiftPayload keeps only whitelisted fields', () => {
  const sanitized = sanitizeShiftPayload({
    id: 'drop-me',
    unitId: 'unit-a',
    userId: 'u1',
    userName: 'Kiss Anna',
    status: 'draft',
    dayKey: '2025-01-13',
    note: 'jegyzet',
    start: Timestamp.fromDate(new Date('2025-01-13T08:00:00.000Z')),
    end: Timestamp.fromDate(new Date('2025-01-13T16:00:00.000Z')),
    isHighlighted: true,
    evil: 'nope',
  } as Partial<Shift> & { evil: string });

  assert.equal('id' in sanitized, false);
  assert.equal('evil' in sanitized, false);
  assert.equal(sanitized.unitId, 'unit-a');
  assert.equal(sanitized.dayKey, '2025-01-13');
  assert.equal(sanitized.isHighlighted, true);
});

test('sanitizeShiftPayload allows null-clearing and rejects invalid time types', () => {
  const sanitized = sanitizeShiftPayload({
    start: null,
    end: null,
    note: null,
    unitId: 'unit-a',
  });
  assert.equal(sanitized.start, null);
  assert.equal(sanitized.end, null);
  assert.equal(sanitized.note, null);

  const invalid = sanitizeShiftPayload({
    start: new Date('2025-01-13T08:00:00.000Z') as any,
    end: '10:00' as any,
    note: 42 as any,
  });
  assert.equal('start' in invalid, false);
  assert.equal('end' in invalid, false);
  assert.equal('note' in invalid, false);
});

test('assertShiftUnitBoundary throws on out-of-scope unit', () => {
  assert.throws(() => assertShiftUnitBoundary('unit-b', ['unit-a']));
  assert.doesNotThrow(() => assertShiftUnitBoundary('unit-a', ['unit-a', 'unit-c']));
});

test('buildPublishPlan affects only draft shifts in selected week and units', () => {
  const users: User[] = [
    {
      id: 'user-1',
      name: 'Kiss Anna',
      fullName: 'Kiss Anna',
      firstName: 'Anna',
      lastName: 'Kiss',
      email: 'anna@example.com',
      role: 'User',
      unitIds: ['unit-a'],
    },
  ];

  const plan = buildPublishPlan({
    shifts: [
      baseShift({ id: 's1', status: 'draft', unitId: 'unit-a' }),
      baseShift({ id: 's2', status: 'published', unitId: 'unit-a' }),
      baseShift({ id: 's3', status: 'draft', unitId: 'unit-b' }),
    ],
    weekStart: new Date('2025-01-13T00:00:00.000Z'),
    weekEnd: new Date('2025-01-19T23:59:59.000Z'),
    selectedUnitIds: ['unit-a'],
    users,
    units: [{ id: 'unit-a', name: 'A egység' }],
    currentUserName: 'Manager',
    publicUrl: 'https://example.local',
  });

  assert.deepEqual(plan.affectedShiftIds, ['s1']);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0]?.payload.status, 'published');
  assert.deepEqual(plan.emailPayload.recipients, ['anna@example.com']);
  assert.equal(plan.emailPayload.unitId, 'unit-a');
});

test('buildPublishPlan rejects multi-unit publish selection', () => {
  assert.throws(
    () =>
      buildPublishPlan({
        shifts: [baseShift({ id: 's1', unitId: 'unit-a' })],
        weekStart: new Date('2025-01-13T00:00:00.000Z'),
        weekEnd: new Date('2025-01-19T23:59:59.000Z'),
        selectedUnitIds: ['unit-a', 'unit-b'],
        users: [],
        units: [{ id: 'unit-a', name: 'A egység' }],
        currentUserName: 'Manager',
        publicUrl: 'https://example.local',
      }),
    SchedulerGuardError
  );
});

test('batchUpdateShifts sanitizes payload and targets shifts collection', () => {
  const updatesCalled: Array<{ ref: { path: string }; payload: Partial<Shift> }> = [];
  const app = initializeApp({ projectId: 'demo-scheduler-tests' }, `scheduler-test-${Date.now()}`);
  const db = getFirestore(app);
  const fakeBatch = {
    update: (ref: { path: string }, payload: Partial<Shift>) => {
      updatesCalled.push({ ref, payload });
    },
  } as any;

  const affected = batchUpdateShifts(db, fakeBatch, [
    { shiftId: 's1', payload: { status: 'published', note: null, start: new Date() as any } },
  ]);

  assert.deepEqual(affected, ['s1']);
  assert.equal(updatesCalled.length, 1);
  assert.equal(updatesCalled[0]?.ref.path, 'shifts/s1');
  assert.equal(updatesCalled[0]?.payload.status, 'published');
  assert.equal(updatesCalled[0]?.payload.note, null);
  assert.equal('start' in (updatesCalled[0]?.payload || {}), false);
});
