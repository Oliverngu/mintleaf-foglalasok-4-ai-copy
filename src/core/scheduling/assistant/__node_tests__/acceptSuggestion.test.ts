import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { acceptSuggestion } from '../acceptSuggestion.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import type { Suggestion } from '../../engine/types.js';

describe('acceptSuggestion', () => {
  it('accepts a suggestion that resolves a min coverage violation', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [],
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

    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Cover opening slot',
      explanation: 'Add a shift to cover the required slot.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '09:00',
          positionId: 'p1',
        },
      ],
    };

    const result = acceptSuggestion(input, suggestion);

    assert.equal(result.decision, 'accepted');
    assert.equal(result.delta.resolvedViolations.length > 0, true);
  });

  it('partially accepts when some actions are rejected', () => {
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
    });

    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift and adjust coverage',
      explanation: 'Move existing shift and try an invalid move.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '10:00',
          newEndTime: '14:00',
          positionId: 'p1',
        },
        {
          type: 'moveShift',
          shiftId: 'missing',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '10:00',
          newEndTime: '14:00',
          positionId: 'p1',
        },
      ],
    };

    const result = acceptSuggestion(input, suggestion);

    assert.equal(result.decision, 'partially-accepted');
    assert.equal(result.appliedActionKeys.length, 1);
    assert.equal(result.rejectedActionKeys.length, 1);
  });

  it('rejects when no actions are applied', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({ weekDays, shifts: [] });

    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Invalid move.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 'missing',
          userId: 'u1',
          dateKey: weekDays[1],
          newStartTime: '10:00',
          newEndTime: '14:00',
          positionId: 'p1',
        },
      ],
    };

    const result = acceptSuggestion(input, suggestion);

    assert.equal(result.decision, 'rejected');
    assert.equal(result.appliedActionKeys.length, 0);
  });

  it('does not introduce new violations when covering min coverage', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
      weekDays,
      shifts: [],
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

    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Cover opening slot',
      explanation: 'Add a shift to cover the required slot.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: weekDays[0],
          startTime: '08:00',
          endTime: '09:00',
          positionId: 'p1',
        },
      ],
    };

    const result = acceptSuggestion(input, suggestion);

    assert.equal(result.delta.newViolations.length, 0);
  });
});
