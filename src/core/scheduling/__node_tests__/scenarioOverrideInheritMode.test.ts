import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../engine/runEngine.js';
import { MIN_COVERAGE_BY_POSITION_ID } from '../rules/constraints/minCoverageByPosition.js';
import { buildWeekDays, makeEngineInput } from '../tests/engineTestHarness.js';
import { applyScenariosToEngineInputWithEffects } from '../scenarios/applyScenarios.js';
import type { Scenario } from '../scenarios/types.js';

describe('scenario inheritMode OVERRIDE', () => {
  it('replaces existing min coverage rules with override', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      ruleset: {
        bucketMinutes: 60,
        minCoverageByPosition: [
          {
            positionId: 'p1',
            dateKeys: [weekDays[0]],
            startTime: '10:00',
            endTime: '12:00',
            minCount: 1,
          },
        ],
      },
      scenarios: [
        {
          id: 'scenario-override',
          unitId: 'unit-a',
          weekStartDate: weekDays[0],
          type: 'EVENT',
          inheritMode: 'OVERRIDE',
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

    const { adjustedInput } = applyScenariosToEngineInputWithEffects(input);
    const rules = adjustedInput.ruleset.minCoverageByPosition ?? [];
    assert.equal(rules.length, 1);
    assert.equal(rules[0].minCount, 2);

    const result = runEngine(adjustedInput);
    const hasViolation = result.violations.some(
      violation => violation.constraintId === MIN_COVERAGE_BY_POSITION_ID
    );
    assert.equal(hasViolation, true);
  });
});
