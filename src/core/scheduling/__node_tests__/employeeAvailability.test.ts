import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../tests/engineTestHarness.js';
import type { EmployeeProfileV1 } from '../employeeProfiles/types.js';

const buildProfile = (
  userId: string,
  unitId: string,
  weekly: EmployeeProfileV1['availability']['weekly'],
  exceptions: EmployeeProfileV1['availability']['exceptions'] = []
): EmployeeProfileV1 => ({
  version: 1,
  userId,
  unitId,
  availability: {
    weekly,
    exceptions
  },
  skillsByPositionId: {},
});

const dayKeyForDateKey = (dateKey: string): string =>
  String(new Date(dateKey).getDay());

const buildInputWithRule = (dateKey: string) =>
  makeEngineInput({
    weekDays: buildWeekDays(),
    ruleset: {
      minCoverageByPosition: [
        {
          positionId: 'p1',
          dateKeys: [dateKey],
          startTime: '08:00',
          endTime: '09:00',
          minCount: 1,
        },
      ],
    },
  });

describe('employee availability exclusions', () => {
  it('excludes unavailable user from add-shift suggestion', () => {
    const weekDays = buildWeekDays();
    const dateKey = weekDays[0];
    const dayKey = dayKeyForDateKey(dateKey);
    const input = buildInputWithRule(dateKey);
    input.employeeProfilesByUserId = {
      u1: buildProfile('u1', input.unitId, { [dayKey]: [] }),
      u2: buildProfile('u2', input.unitId, { [dayKey]: [{ startHHmm: '08:00', endHHmm: '12:00' }] }),
    };

    const result = runEngine(input);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].actions[0]?.userId, 'u2');
  });

  it('uses exception day availability over weekly windows', () => {
    const weekDays = buildWeekDays();
    const dateKey = weekDays[0];
    const dayKey = dayKeyForDateKey(dateKey);
    const input = buildInputWithRule(dateKey);
    input.employeeProfilesByUserId = {
      u1: buildProfile('u1', input.unitId, { [dayKey]: [{ startHHmm: '08:00', endHHmm: '12:00' }] }),
      u2: buildProfile('u2', input.unitId, { [dayKey]: [{ startHHmm: '08:00', endHHmm: '12:00' }] }, [
        { dateKey, available: false },
      ]),
    };

    const result = runEngine(input);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].actions[0]?.userId, 'u1');
  });

  it('handles cross-midnight availability windows', () => {
    const weekDays = buildWeekDays();
    const dateKey = weekDays[0];
    const dayKey = dayKeyForDateKey(dateKey);
    const input = makeEngineInput({
      weekDays,
      ruleset: {
        minCoverageByPosition: [
          {
            positionId: 'p1',
            dateKeys: [dateKey],
            startTime: '23:00',
            endTime: '00:00',
            minCount: 1,
          },
        ],
      },
    });
    input.employeeProfilesByUserId = {
      u1: buildProfile('u1', input.unitId, { [dayKey]: [{ startHHmm: '20:00', endHHmm: '22:00' }] }),
      u2: buildProfile('u2', input.unitId, { [dayKey]: [{ startHHmm: '22:00', endHHmm: '02:00' }] }),
    };

    const result = runEngine(input);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].actions[0]?.userId, 'u2');
  });

  it('treats missing profile as available', () => {
    const weekDays = buildWeekDays();
    const dateKey = weekDays[0];
    const dayKey = dayKeyForDateKey(dateKey);
    const input = buildInputWithRule(dateKey);
    input.users = [
      { id: 'u1', displayName: 'User 1', isActive: true },
      { id: 'u2', displayName: 'User 2', isActive: true },
    ];
    input.employeeProfilesByUserId = {
      u2: buildProfile('u2', input.unitId, { [dayKey]: [] }),
    };

    const result = runEngine(input);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].actions[0]?.userId, 'u1');
  });
});
