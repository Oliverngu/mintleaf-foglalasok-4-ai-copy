import { describe, expect, it } from 'vitest';
import { runEngine } from '../runEngine';
import { EngineInput } from '../types';
import {
  buildScheduleSettings,
  buildWeekDays,
  makeEngineInput,
} from '../../tests/engineTestHarness';

describe('Engine v1', () => {
  it('handles empty input', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({ weekDays });

    const result = runEngine(input);
    expect(Object.keys(result.capacityMap)).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('computes capacity for a single shift', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '09:00',
          endTime: '11:00',
          positionId: 'p1',
        },
      ],
    });

    const result = runEngine(input);
    expect(result.capacityMap['2025-01-06T09:00']?.p1).toBe(1);
    expect(result.capacityMap['2025-01-06T10:00']?.p1).toBe(1);
  });

  it('handles cross-midnight capacity', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '22:00',
          endTime: '02:00',
          positionId: 'p1',
        },
      ],
    });

    const result = runEngine(input);
    expect(result.capacityMap['2025-01-06T23:00']?.p1).toBe(1);
    expect(result.capacityMap['2025-01-07T01:00']?.p1).toBe(1);
  });

  it('uses default closing time when daily settings are missing', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      scheduleSettings: buildScheduleSettings({
        dailySettings: {
          0: { openingTime: '08:00', closingTime: '20:00', isOpen: false },
        },
        mergeDailySettings: false,
        defaultClosingTime: '21:00',
        defaultClosingOffsetMinutes: 60,
      }),
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[1],
          startTime: '20:00',
          endTime: null,
          positionId: 'p1',
        },
      ],
    });

    const result = runEngine(input);
    expect(result.capacityMap['2025-01-07T20:00']?.p1).toBe(1);
    expect(result.capacityMap['2025-01-07T21:00']?.p1).toBe(1);
  });

  it('does not create violations for zero min coverage', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      ruleset: {
        minCoverageByPosition: [
          {
            positionId: 'p1',
            dateKeys: [weekDays[0]],
            startTime: '08:00',
            endTime: '09:00',
            minCount: 0,
          },
        ],
      },
    });

    const result = runEngine(input);
    expect(result.violations).toHaveLength(0);
  });

  it('creates a min coverage violation when missing coverage', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      ruleset: {
        minCoverageByPosition: [
          {
            positionId: 'p1',
            dateKeys: [weekDays[0]],
            startTime: '08:00',
            endTime: '09:00',
            minCount: 1,
          },
        ],
      },
    });

    const result = runEngine(input);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintId).toBe('MIN_COVERAGE_BY_POSITION');
  });

  it('flags min rest violations on overlapping shifts', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '12:00',
          positionId: 'p1',
        },
        {
          id: 's2',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '11:00',
          endTime: '15:00',
          positionId: 'p1',
        },
      ],
      ruleset: {
        minRestHoursBetweenShifts: { minRestHours: 11 },
      },
    });

    const result = runEngine(input);
    expect(
      result.violations.some(v => v.constraintId === 'MIN_REST_HOURS_BETWEEN_SHIFTS')
    ).toBe(true);
  });

  it('flags max hours per day violations', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u2',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '18:00',
          positionId: 'p1',
        },
      ],
      ruleset: {
        maxHoursPerDay: { maxHoursPerDay: 8 },
      },
    });

    const result = runEngine(input);
    expect(result.violations.some(v => v.constraintId === 'MAX_HOURS_PER_DAY')).toBe(true);
  });

  it('orders violations deterministically', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '22:00',
          endTime: '02:00',
          positionId: 'p1',
        },
        {
          id: 's2',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[1],
          startTime: '10:00',
          endTime: '18:00',
          positionId: 'p1',
        },
      ],
      ruleset: {
        minCoverageByPosition: [
          {
            positionId: 'p1',
            dateKeys: [weekDays[2]],
            startTime: '08:00',
            endTime: '09:00',
            minCount: 1,
          },
        ],
        maxHoursPerDay: { maxHoursPerDay: 6 },
        minRestHoursBetweenShifts: { minRestHours: 11 },
      },
    });

    const result = runEngine(input);
    const constraintIds = result.violations.map(v => v.constraintId);
    expect(constraintIds).toEqual([
      'MIN_COVERAGE_BY_POSITION',
      'MIN_REST_HOURS_BETWEEN_SHIFTS',
      'MAX_HOURS_PER_DAY'
    ]);
  });

  it('isolates multi-unit inputs', () => {
    const weekDays = buildWeekDays();
    const inputA: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '09:00',
          endTime: '10:00',
          positionId: 'p1',
        },
      ],
    });

    const inputB: EngineInput = makeEngineInput({
      weekDays,
      unitId: 'unit-b',
      shifts: [
        {
          id: 's2',
          userId: 'u2',
          unitId: 'unit-b',
          dateKey: weekDays[0],
          startTime: '12:00',
          endTime: '13:00',
          positionId: 'p1',
        },
      ],
    });

    const resultA = runEngine(inputA);
    const resultB = runEngine(inputB);

    expect(!!resultA.capacityMap['2025-01-06T09:00']).toBe(true);
    expect(!!resultA.capacityMap['2025-01-06T12:00']).toBe(false);
    expect(!!resultB.capacityMap['2025-01-06T12:00']).toBe(true);
  });
});
