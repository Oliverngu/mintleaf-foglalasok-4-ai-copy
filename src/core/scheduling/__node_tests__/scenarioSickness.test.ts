import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../engine/runEngine.js';
import { getSlotKey } from '../engine/timeUtils.js';
import { buildWeekDays, makeEngineInput } from '../tests/engineTestHarness.js';
import type { Scenario } from '../scenarios/types.js';

const buildSlotKey = (dateKey: string, time: string) =>
  getSlotKey(new Date(`${dateKey}T${time}:00`));

describe('scenario sickness', () => {
  it('removes shifts for sick users on specified days', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '09:00',
          endTime: '12:00',
          positionId: 'p1',
        },
      ],
      scenarios: [
        {
          id: 'scenario-1',
          unitId: 'unit-a',
          weekStartDate: weekDays[0],
          type: 'SICKNESS',
          dateKeys: [weekDays[0]],
          payload: {
            userId: 'u1',
            dateKeys: [weekDays[0]],
          },
        } satisfies Scenario,
      ],
    });

    const result = runEngine(input);
    const slotKey = buildSlotKey(weekDays[0], '09:00');
    assert.equal(result.capacityMap[slotKey]?.p1 ?? 0, 0);
  });
});
