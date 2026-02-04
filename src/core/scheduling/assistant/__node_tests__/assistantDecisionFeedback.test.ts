import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
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

describe('assistant decision feedback', () => {
  it('removes accepted suggestions from the response', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-accepted', 0, input),
      createDecisionRecord(suggestionId, 'accepted', 1, 'session-accepted'),
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
    assert.equal(
      response.explanations.some(
        explanation =>
          explanation.kind === 'suggestion' &&
          explanation.relatedSuggestionId === suggestionId
      ),
      false
    );
  });

  it('keeps rejected suggestions with decisionState=rejected', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-rejected', 0, input),
      createDecisionRecord(suggestionId, 'rejected', 1, 'session-rejected'),
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
      createAssistantSession('session-pending', 0, input),
      createDecisionRecord('other-suggestion', 'rejected', 1, 'session-pending'),
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
      createAssistantSession('session-deterministic', 0, input),
      createDecisionRecord(suggestionId, 'rejected', 1, 'session-deterministic'),
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

  it('does not match legacy suggestion ids against v1 suggestions', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const session = applyDecisionToSession(
      createAssistantSession('session-legacy', 0, input),
      createDecisionRecord('assistant-suggestion:legacy', 'accepted', 1, 'session-legacy'),
      1
    );

    const response = buildAssistantResponse(input, result, session);

    assert.equal(response.suggestions.length, 1);
    assert.ok(response.suggestions[0].id.startsWith('assistant-suggestion:v2:'));
  });
});
