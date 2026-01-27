import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
import { buildSuggestionAffected } from '../explainability/suggestionAffected.js';
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

describe('decision explanation contract', () => {
  it('includes standardized meta and whyNow for accepted decisions', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-contract-accepted', 0, input),
      createDecisionRecord(
        suggestionId,
        'accepted',
        7,
        'session-contract-accepted',
        'Accepted reason',
        'user'
      ),
      7
    );

    const response = buildAssistantResponse(input, result, session);
    const applied = response.explanations.find(
      item => item.id === `info:suggestion-applied:${suggestionId}`
    );

    assert.ok(applied);
    const suggestion = baseResponse.suggestions[0];
    const action = suggestion.actions[0];
    const expectedAffected = buildSuggestionAffected({
      type: suggestion.type,
      expectedImpact: suggestion.expectedImpact,
      explanation: suggestion.explanation,
      actions: suggestion.actions,
    });
    assert.ok(applied.affected.userIds?.includes(action.userId));
    assert.equal(applied.affected.positionId, action.positionId);
    assert.deepEqual(applied.affected.dateKeys, [action.dateKey]);
    assert.deepEqual(applied.affected, expectedAffected);
    assert.deepEqual(applied, {
      id: `info:suggestion-applied:${suggestionId}`,
      kind: 'info',
      severity: 'low',
      title: 'Suggestion applied',
      details: baseResponse.suggestions[0].explanation,
      why: baseResponse.suggestions[0].explanation,
      whyNow: 'User decision: accepted — Accepted reason',
      whatIfAccepted: baseResponse.suggestions[0].expectedImpact,
      affected: expectedAffected,
      relatedSuggestionId: suggestionId,
      meta: {
        decisionSource: 'user',
        hasDecisionReason: true,
        decisionTimestamp: 7,
        decision: 'accepted',
      },
    });
  });

  it('includes standardized meta and whyNow for rejected decisions', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const baseResponse = buildAssistantResponse(input, result);
    const suggestionId = baseResponse.suggestions[0]?.id;

    assert.ok(suggestionId);

    const session = applyDecisionToSession(
      createAssistantSession('session-contract-rejected', 0, input),
      createDecisionRecord(
        suggestionId,
        'rejected',
        8,
        'session-contract-rejected',
        'Rejected reason',
        'system'
      ),
      8
    );

    const response = buildAssistantResponse(input, result, session);
    const dismissed = response.explanations.find(
      item => item.id === `info:suggestion-dismissed:${suggestionId}`
    );

    assert.ok(dismissed);
    const suggestion = baseResponse.suggestions[0];
    const action = suggestion.actions[0];
    const expectedAffected = buildSuggestionAffected({
      type: suggestion.type,
      expectedImpact: suggestion.expectedImpact,
      explanation: suggestion.explanation,
      actions: suggestion.actions,
    });
    assert.ok(dismissed.affected.userIds?.includes(action.userId));
    assert.equal(dismissed.affected.positionId, action.positionId);
    assert.deepEqual(dismissed.affected.dateKeys, [action.dateKey]);
    assert.deepEqual(dismissed.affected, expectedAffected);
    assert.deepEqual(dismissed, {
      id: `info:suggestion-dismissed:${suggestionId}`,
      kind: 'info',
      severity: 'low',
      title: 'Suggestion dismissed',
      details: baseResponse.suggestions[0].explanation,
      whyNow: 'System decision: rejected — Rejected reason',
      affected: expectedAffected,
      relatedSuggestionId: suggestionId,
      meta: {
        decisionSource: 'system',
        hasDecisionReason: true,
        decisionTimestamp: 8,
        decision: 'rejected',
      },
    });
  });
});
