import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Explanation } from '../types.js';
import type { Suggestion } from '../../engine/types.js';
import {
  MAX_LINKED_VIOLATIONS,
  buildSuggestionExplainability,
} from '../explainability/buildSuggestionExplainability.js';

const buildSuggestion = (): Suggestion => ({
  type: 'SHIFT_MOVE_SUGGESTION',
  expectedImpact: 'Helps resolve coverage',
  explanation: 'Move a shift to resolve coverage',
  actions: [
    {
      type: 'moveShift',
      shiftId: 'shift-1',
      userId: 'user-1',
      dateKey: '2024-01-02',
      newStartTime: '09:00',
      newEndTime: '12:00',
      positionId: 'pos-1',
    },
  ],
});

const buildViolation = (constraintId: string): Explanation => ({
  id: `violation:${constraintId}`,
  kind: 'violation',
  severity: 'low',
  title: constraintId,
  details: 'Coverage issue',
  affected: {
    userIds: ['user-1'],
    positionId: 'pos-1',
  },
  relatedConstraintId: constraintId,
});

describe('buildSuggestionExplainability snapshot', () => {
  it('produces stable explainability fields', () => {
    const suggestion = buildSuggestion();
    const violationExplanations = [
      buildViolation('C3'),
      buildViolation('C1'),
      buildViolation('C2'),
      buildViolation('C5'),
      buildViolation('C4'),
      buildViolation('C7'),
      buildViolation('C6'),
    ];

    const explainability = buildSuggestionExplainability(
      suggestion,
      violationExplanations
    );

    assert.deepEqual(explainability, {
      why: 'Move a shift to resolve coverage',
      whyNow: `Linked to violations: C1, C2, C3, C4, C5... (+${
        violationExplanations.length - MAX_LINKED_VIOLATIONS
      } more)`,
      whatIfAccepted: 'Helps resolve coverage',
      relatedConstraintId: 'C1',
    });
  });
});
