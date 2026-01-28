import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../engine/runEngine.js';
import { MIN_COVERAGE_BY_POSITION_ID } from '../rules/constraints/minCoverageByPosition.js';
import { buildWeekDays, makeEngineInput } from '../tests/engineTestHarness.js';
import type { Scenario } from '../scenarios/types.js';

describe('scenario min coverage override', () => {
  it('adds min coverage rules for event scenarios', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [],
      scenarios: [
        {
          id: 'scenario-event',
          unitId: 'unit-a',
          weekStartDate: weekDays[0],
          type: 'EVENT',
          dateKeys: [weekDays[0]],
          payload: {
            dateKeys: [weekDays[0]],
            timeRange: { startTime: '10:00', endTime: '12:00' },
            minCoverageOverrides: [
              { positionId: 'p1', minCount: 2 },
            ],
          },
        } satisfies Scenario,
      ],
    });

    const result = runEngine(input);
    const hasViolation = result.violations.some(
      violation => violation.constraintId === MIN_COVERAGE_BY_POSITION_ID
    );
    assert.equal(hasViolation, true);
  });
});
