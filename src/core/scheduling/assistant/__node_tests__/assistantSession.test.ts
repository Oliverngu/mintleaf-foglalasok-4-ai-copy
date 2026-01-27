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

describe('assistant session', () => {
  it('persists accepted suggestions across multiple calls', () => {
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
      createAssistantSession('session-rejected', 0),
      { suggestionId, decision: 'rejected' },
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
    const emptySession = createAssistantSession('session-empty', 0);

    const responseWithSession = buildAssistantResponse(input, result, emptySession);
    const responseWithoutSession = buildAssistantResponse(input, result);

    assert.deepEqual(responseWithSession, responseWithoutSession);
  });
});
