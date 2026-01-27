import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import {
  buildAssistantSuggestionIdV1,
  buildAssistantSuggestionIdV2,
} from '../ids/suggestionId.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
import { createDecisionRecord } from '../response/decisionHelpers.js';
import { applyDecisionToSession, createAssistantSession } from '../session/helpers.js';

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

describe('assistant suggestion id v2 legacy decision mapping', () => {
  it('hides v2 suggestions when a legacy v1 decision matches', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const suggestion = result.suggestions[0];
    const v1SuggestionId = buildAssistantSuggestionIdV1(suggestion);
    const v2SuggestionId = buildAssistantSuggestionIdV2(suggestion);

    const session = applyDecisionToSession(
      createAssistantSession('session-legacy-mapped', 0, input),
      createDecisionRecord(v1SuggestionId, 'accepted', 1, 'session-legacy-mapped'),
      1
    );
    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 0);
    const applied = response.explanations.find(
      item => item.id === `info:suggestion-applied:${v2SuggestionId}`
    );
    assert.ok(applied);
  });

  it('keeps suggestions when a legacy v1 decision does not match', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const session = applyDecisionToSession(
      createAssistantSession('session-legacy-unmapped', 0, input),
      createDecisionRecord(
        'assistant-suggestion:v1:does-not-exist',
        'accepted',
        1,
        'session-legacy-unmapped'
      ),
      1
    );

    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 1);
    assert.ok(response.suggestions[0].meta?.v1SuggestionId?.startsWith('assistant-suggestion:v1:'));
  });
});
