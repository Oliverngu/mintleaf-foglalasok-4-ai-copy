import { describe, expect, it } from 'vitest';
import { runEngine } from '../../engine/runEngine.js';
import { MIN_COVERAGE_BY_POSITION_ID } from '../../rules/constraints/minCoverageByPosition.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';

describe('Assistant Mode v1', () => {
  it('adds info explanations for empty input', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({ weekDays });
    const result = runEngine(input);

    const pipeline = runSuggestionPipeline({ input, result });
    const kinds = pipeline.explanations.map(explanation => explanation.kind);

    expect(kinds.filter(kind => kind === 'violation')).toHaveLength(0);
    expect(kinds.filter(kind => kind === 'suggestion')).toHaveLength(0);
    expect(kinds.filter(kind => kind === 'info').length).toBeGreaterThan(0);
  });

  it('includes violation explanation for min coverage', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
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

    const pipeline = runSuggestionPipeline({ input, result });
    const violationExplanation = pipeline.explanations.find(
      explanation => explanation.relatedConstraintId === MIN_COVERAGE_BY_POSITION_ID
    );

    expect(violationExplanation?.kind).toBe('violation');
  });

  it('produces deterministic explanation ordering', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
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
    const first = runSuggestionPipeline({ input, result });
    const second = runSuggestionPipeline({ input, result });

    expect(first.explanations.map(explanation => explanation.id)).toEqual(
      second.explanations.map(explanation => explanation.id)
    );
  });
});
