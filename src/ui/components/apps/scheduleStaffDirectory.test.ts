import test from 'node:test';
import assert from 'node:assert/strict';

import type { Shift, User } from '../../../core/models/data';
import {
  buildScheduleStaffDirectory,
  resolveVisibleStaffForSchedule,
} from './scheduleStaffDirectory';

const makeShift = (overrides: Partial<Shift>): Shift => ({
  id: 'shift-1',
  userId: 'user-1',
  userName: 'Teszt Elek',
  unitId: 'unit-a',
  position: 'Pultos',
  status: 'published',
  ...overrides,
});

test('buildScheduleStaffDirectory derives unique users in active units', () => {
  const shifts: Shift[] = [
    makeShift({ id: 's1', userId: 'u1', userName: 'Kiss Anna', unitId: 'u-a' }),
    makeShift({ id: 's2', userId: 'u1', userName: 'Kiss Anna', unitId: 'u-a' }),
    makeShift({ id: 's3', userId: 'u2', userName: 'Nagy Béla', unitId: 'u-b' }),
  ];

  const result = buildScheduleStaffDirectory(shifts, ['u-a']);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, 'u1');
  assert.equal(result[0]?.fullName, 'Kiss Anna');
});

test('resolveVisibleStaffForSchedule falls back when users list is denied', () => {
  const users: User[] = [];
  const fallback: User[] = [
    {
      id: 'u1',
      name: 'Kiss Anna',
      fullName: 'Kiss Anna',
      firstName: 'Anna',
      lastName: 'Kiss',
      email: 'u1@unknown.local',
      role: 'User',
      unitIds: ['u-a'],
      position: 'Pultos',
    },
  ];

  const result = resolveVisibleStaffForSchedule(users, fallback, true);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, 'u1');
});
