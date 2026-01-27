import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getShiftTimeRange } from '../engine/computeCapacity.js';
import { toTimeString } from '../engine/timeUtils.js';
import { buildScheduleSettings, buildWeekDays, makeEngineInput } from '../tests/engineTestHarness.js';

describe('engine closing time inheritance', () => {
  it('uses default closing time when inherit is true and applies offset', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      scheduleSettings: buildScheduleSettings({
        dailySettings: {
          0: {
            openingTime: '08:00',
            closingTime: '19:00',
            closingTimeInherit: true,
            closingOffsetMinutes: 30,
          },
        },
        mergeDailySettings: false,
        defaultClosingTime: '21:00',
        defaultClosingOffsetMinutes: 0,
      }),
      shifts: [
        {
          id: 's1',
          userId: 'u1',
          unitId: 'unit-a',
          dateKey: weekDays[0],
          startTime: '20:00',
          endTime: null,
        },
      ],
    });

    const range = getShiftTimeRange(input.shifts[0], input, 0);
    assert.ok(range);
    assert.equal(toTimeString(range.end), '21:30');
  });
});
