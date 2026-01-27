import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';

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

describe('assistant suggestion id v2 collision guard', () => {
  it('throws in dev when two suggestions share a v2 id but differ in v1 metadata', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseSuggestion = result.suggestions[0];

    assert.ok(baseSuggestion);

    const collidingSuggestion = {
      ...baseSuggestion,
      explanation: `${baseSuggestion.explanation} updated`,
      expectedImpact: `${baseSuggestion.expectedImpact} updated`,
    };

    const responseInput = {
      ...result,
      suggestions: [baseSuggestion, collidingSuggestion],
    };

    assert.throws(
      () => buildAssistantResponse(input, responseInput),
      /collision/i
    );
  });
});
