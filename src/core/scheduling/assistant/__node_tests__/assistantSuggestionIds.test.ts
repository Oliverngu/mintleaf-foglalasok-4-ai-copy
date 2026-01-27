import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
import { runSuggestionPipeline } from '../suggestionPipeline.js';

const buildInputWithSuggestion = () => {
  const weekDays = buildWeekDays();
  return makeEngineInput({
    weekDays,
    shifts: [],
    ruleset: {
      minCoverageByPosition: [
        {
          positionId: 'p1',
          dateKeys: [weekDays[0]],
          startTime: '08:00',
          endTime: '10:00',
          minCount: 1,
        },
      ],
    },
  });
};

describe('assistant suggestion ids', () => {
  it('matches suggestion ids between pipeline and response', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const pipeline = runSuggestionPipeline({
      input,
      result: {
        capacityMap: result.capacityMap,
        violations: result.violations,
        suggestions: result.suggestions,
      },
    });
    const response = buildAssistantResponse(input, result);

    const pipelineSuggestionIds = pipeline.explanations
      .filter(explanation => explanation.kind === 'suggestion')
      .map(explanation => explanation.relatedSuggestionId)
      .filter((id): id is string => Boolean(id))
      .sort();
    const responseSuggestionIds = response.suggestions.map(suggestion => suggestion.id).sort();

    assert.deepEqual(responseSuggestionIds, pipelineSuggestionIds);
  });
});
