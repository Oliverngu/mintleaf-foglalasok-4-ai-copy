import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Explanation } from '../types.js';
import type { Suggestion } from '../../engine/types.js';
import {
  MAX_WHY_NOW_LENGTH,
  buildSuggestionExplainability,
} from '../explainability/buildSuggestionExplainability.js';

const buildSuggestion = (): Suggestion => ({
  type: 'ADD_SHIFT_SUGGESTION',
  expectedImpact: 'Improves coverage',
  explanation: 'Add a shift for coverage',
  actions: [
    {
      type: 'createShift',
      userId: 'user-1',
      dateKey: '2024-01-01',
      startTime: '08:00',
      endTime: '12:00',
      positionId: 'pos-1',
    },
  ],
});

const buildViolation = (constraintId: string): Explanation => ({
  id: `violation:${constraintId}`,
  kind: 'violation',
  severity: 'low',
  title: constraintId,
  details: 'Missing coverage',
  affected: {
    userIds: ['user-1'],
    positionId: 'pos-1',
  },
  relatedConstraintId: constraintId,
});

describe('buildSuggestionExplainability', () => {
  it('adds deterministic whyNow with sorted, truncated violations', () => {
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

    assert.equal(explainability.why, suggestion.explanation);
    assert.equal(explainability.whatIfAccepted, suggestion.expectedImpact);
    assert.equal(
      explainability.whyNow,
      'Linked to violations: C1, C2, C3, C4, C5... (+2 more)'
    );
    assert.equal(explainability.relatedConstraintId, 'C1');
  });

  it('truncates whyNow deterministically', () => {
    const suggestion = buildSuggestion();
    const longId = (index: number) => `constraint-${index}-${'x'.repeat(40)}`;
    const violationExplanations = [
      buildViolation(longId(1)),
      buildViolation(longId(2)),
      buildViolation(longId(3)),
      buildViolation(longId(4)),
      buildViolation(longId(5)),
    ];

    const explainabilityFirst = buildSuggestionExplainability(
      suggestion,
      violationExplanations
    );
    const explainabilitySecond = buildSuggestionExplainability(
      suggestion,
      violationExplanations
    );

    assert.equal(explainabilityFirst.whyNow, explainabilitySecond.whyNow);
    assert.ok((explainabilityFirst.whyNow ?? '').length <= MAX_WHY_NOW_LENGTH);
    assert.ok(explainabilityFirst.whyNow?.endsWith('...'));
  });
});
