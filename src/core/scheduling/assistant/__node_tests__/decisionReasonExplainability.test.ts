import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
import { createDecisionRecord } from '../response/decisionHelpers.js';
import {
  MAX_DECISION_REASON_LENGTH,
  sanitizeDecisionReason,
} from '../response/decisionReason.js';
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

describe('decision reason explainability', () => {
  it('adds sanitized reason to accepted decision explanations', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-reason', 0, input),
      createDecisionRecord(
        suggestionId,
        'accepted',
        1,
        'session-reason',
        '  user   reason\nwith  spacing  ',
        'user'
      ),
      1
    );
    const response = buildAssistantResponse(input, result, session);
    const explanation = response.explanations.find(
      item => item.title === 'Suggestion applied' && item.relatedSuggestionId === suggestionId
    );

    assert.ok(explanation);
    assert.equal(
      explanation.whyNow,
      'User decision: accepted — user reason with spacing'
    );
    assert.equal(explanation.meta?.decisionSource, 'user');
    assert.equal(explanation.meta?.hasDecisionReason, true);
    assert.equal(explanation.meta?.decisionTimestamp, 1);
    assert.equal(explanation.meta?.decision, 'accepted');
  });

  it('adds system decision reason to dismissed explanations', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-system', 0, input),
      createDecisionRecord(
        suggestionId,
        'rejected',
        2,
        'session-system',
        'Policy blocked',
        'system'
      ),
      2
    );
    const response = buildAssistantResponse(input, result, session);
    const explanation = response.explanations.find(
      item => item.title === 'Suggestion dismissed' && item.relatedSuggestionId === suggestionId
    );

    assert.ok(explanation);
    assert.equal(explanation.whyNow, 'System decision: rejected — Policy blocked');
    assert.equal(explanation.meta?.decisionSource, 'system');
    assert.equal(explanation.meta?.hasDecisionReason, true);
    assert.equal(explanation.meta?.decisionTimestamp, 2);
    assert.equal(explanation.meta?.decision, 'rejected');
  });

  it('truncates long reasons deterministically', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const longReason = `reason-${'x'.repeat(MAX_DECISION_REASON_LENGTH)}`;
    const sanitized = sanitizeDecisionReason(longReason);
    const session = applyDecisionToSession(
      createAssistantSession('session-long', 0, input),
      createDecisionRecord(
        suggestionId,
        'accepted',
        3,
        'session-long',
        longReason,
        'user'
      ),
      3
    );
    const response = buildAssistantResponse(input, result, session);
    const explanation = response.explanations.find(
      item => item.title === 'Suggestion applied' && item.relatedSuggestionId === suggestionId
    );

    assert.ok(explanation);
    assert.ok(sanitized);
    assert.ok(sanitized.endsWith('...'));
    assert.equal(explanation.whyNow, `User decision: accepted — ${sanitized}`);
    assert.equal(explanation.meta?.decisionSource, 'user');
    assert.equal(explanation.meta?.hasDecisionReason, true);
    assert.equal(explanation.meta?.decisionTimestamp, 3);
    assert.equal(explanation.meta?.decision, 'accepted');
  });

  it('keeps behavior unchanged when no reason is provided', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-none', 0, input),
      createDecisionRecord(suggestionId, 'accepted', 4, 'session-none'),
      4
    );
    const response = buildAssistantResponse(input, result, session);
    const explanation = response.explanations.find(
      item => item.title === 'Suggestion applied' && item.relatedSuggestionId === suggestionId
    );

    assert.ok(explanation);
    assert.equal(explanation.whyNow, undefined);
    assert.equal(explanation.meta?.hasDecisionReason, false);
    assert.equal(explanation.meta?.decisionSource, 'user');
    assert.equal(explanation.meta?.decisionTimestamp, 4);
    assert.equal(explanation.meta?.decision, 'accepted');
  });

  it('treats whitespace-only reason as undefined', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-whitespace', 0, input),
      createDecisionRecord(
        suggestionId,
        'rejected',
        6,
        'session-whitespace',
        '   \n  ',
        'user'
      ),
      6
    );
    const response = buildAssistantResponse(input, result, session);
    const explanation = response.explanations.find(
      item => item.title === 'Suggestion dismissed' && item.relatedSuggestionId === suggestionId
    );

    assert.ok(explanation);
    assert.equal(explanation.whyNow, undefined);
    assert.equal(explanation.meta?.hasDecisionReason, false);
    assert.equal(explanation.meta?.decisionSource, 'user');
    assert.equal(explanation.meta?.decisionTimestamp, 6);
    assert.equal(explanation.meta?.decision, 'rejected');
  });

  it('returns deterministic output for the same session snapshot', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-deterministic', 0, input),
      createDecisionRecord(
        suggestionId,
        'accepted',
        5,
        'session-deterministic',
        'Reason for acceptance',
        'user'
      ),
      5
    );
    const first = buildAssistantResponse(input, result, session);
    const second = buildAssistantResponse(input, result, session);

    assert.deepEqual(first, second);
  });
});
