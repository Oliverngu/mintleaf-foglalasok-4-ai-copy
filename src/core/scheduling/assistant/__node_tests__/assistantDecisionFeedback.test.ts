import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
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

describe('assistant decision feedback', () => {
  it('removes accepted suggestions from the response', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-accepted', 0),
      { suggestionId, decision: 'accepted' },
      1
    );
    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 0);
    assert.ok(
      response.explanations.some(
        explanation =>
          explanation.title === 'Suggestion applied' &&
          explanation.relatedSuggestionId === suggestionId
      )
    );
  });

  it('keeps rejected suggestions with decisionState=rejected', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-rejected', 0),
      { suggestionId, decision: 'rejected' },
      1
    );
    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 1);
    assert.equal(response.suggestions[0].decisionState, 'rejected');
    assert.ok(
      response.explanations.some(
        explanation =>
          explanation.title === 'Suggestion dismissed' &&
          explanation.relatedSuggestionId === suggestionId
      )
    );
  });

  it('sets decisionState=pending when session has decisions for other suggestions', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const session = applyDecisionToSession(
      createAssistantSession('session-pending', 0),
      { suggestionId: 'other-suggestion', decision: 'rejected' },
      1
    );
    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 1);
    assert.equal(response.suggestions[0].decisionState, 'pending');
  });

  it('returns deterministic output for the same session snapshot', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-deterministic', 0),
      { suggestionId, decision: 'rejected' },
      1
    );
    const first = buildAssistantResponse(input, result, session);
    const second = buildAssistantResponse(input, result, session);

    assert.deepEqual(first, second);
  });

  it('keeps behavior unchanged when no session is passed', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);

    const response = buildAssistantResponse(input, result);
    const responseUndefined = buildAssistantResponse(input, result, undefined);

    assert.deepEqual(response, responseUndefined);
  });
});
