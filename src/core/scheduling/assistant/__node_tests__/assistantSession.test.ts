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

describe('assistant session', () => {
  it('persists accepted suggestions across multiple calls', () => {
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

    const responseFirst = buildAssistantResponse(input, result, session);
    const responseSecond = buildAssistantResponse(input, runEngine(input), session);

    assert.equal(responseFirst.suggestions.length, 0);
    assert.equal(responseSecond.suggestions.length, 0);
  });

  it('keeps rejected suggestions rejected after rerun', () => {
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

    const responseFirst = buildAssistantResponse(input, result, session);
    const responseSecond = buildAssistantResponse(input, runEngine(input), session);

    assert.equal(responseFirst.suggestions[0].decisionState, 'rejected');
    assert.equal(responseSecond.suggestions[0].decisionState, 'rejected');
  });

  it('treats empty session like no session', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const emptySession = createAssistantSession('session-empty', 0, input);

    const responseWithSession = buildAssistantResponse(input, result, emptySession);
    const responseWithoutSession = buildAssistantResponse(input, result);

    assert.deepEqual(responseWithSession, responseWithoutSession);
  });

  it('treats mismatched context sessions as invalid', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const otherInput = makeEngineInput({ unitId: 'unit-b' });
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-context', 0, input),
      createDecisionRecord(suggestionId, 'accepted', 1, 'session-context'),
      1
    );

    const responseWithInvalidSession = buildAssistantResponse(otherInput, runEngine(otherInput), session);
    const responseWithoutSession = buildAssistantResponse(otherInput, runEngine(otherInput));

    assert.deepEqual(responseWithInvalidSession, responseWithoutSession);
  });

  it('treats expired sessions as invalid', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-expired', 0, input, 1),
      createDecisionRecord(suggestionId, 'accepted', 1, 'session-expired'),
      2
    );

    const responseWithExpiredSession = buildAssistantResponse(input, result, session);
    const responseWithoutSession = buildAssistantResponse(input, result);

    assert.deepEqual(responseWithExpiredSession, responseWithoutSession);
  });
});
