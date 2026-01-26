import { describe, expect, it } from 'vitest';
import { runEngine } from '../engine/runEngine';
import { EngineInput } from '../engine/types';
import { buildWeekDays, makeEngineInput } from './engineTestHarness';

describe('runEngine', () => {
  it('covers overnight shifts across days', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '15:00',
          endTime: '03:00',
          positionId: 'p1',
        },
      ],
    });

    const result = runEngine(input);
    expect(result.capacityMap['2025-01-06T15:00']?.p1).toBe(1);
    expect(result.capacityMap['2025-01-07T02:00']?.p1).toBe(1);
  });

  it('excludes day-off shifts from capacity and suggestions', () => {
    const weekDays = buildWeekDays();
    const input: EngineInput = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '00:00',
          endTime: null,
          positionId: 'p1',
          isDayOff: true,
        },
      ],
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
    expect(Object.keys(result.capacityMap)).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('keeps capacity isolated per unit input', () => {
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
          userId: 'u1',
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

  it('detects rest violations', () => {
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
        minRestHoursBetweenShifts: { minRestHours: 11 },
      },
    });

    const result = runEngine(input);
    expect(
      result.violations.some(v => v.constraintId === 'MIN_REST_HOURS_BETWEEN_SHIFTS')
    ).toBe(true);
  });

  it('deduplicates suggestions for duplicate coverage rules', () => {
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
    expect(result.suggestions).toHaveLength(1);
  });
});
