import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';
import type { Explanation } from '../types.js';

describe('buildAssistantResponse', () => {
  it('returns deterministic response for the same input', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
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

    const result = runEngine(input);
    const first = buildAssistantResponse(input, result);
    const second = buildAssistantResponse(input, result);

    assert.deepEqual(first, second);
  });

  it('builds stable suggestion ids', () => {
    const weekDays = buildWeekDays();
    const input = makeEngineInput({
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

    const result = runEngine(input);
    const response = buildAssistantResponse(input, result);

    assert.ok(response.suggestions.length > 0);
    response.suggestions.forEach(suggestion => {
      assert.ok(suggestion.id.length > 0);
      assert.ok(suggestion.id.startsWith('assistant-suggestion:v1:'));
    });
  });

  it('returns info explanations with no suggestions for empty inputs', () => {
    const input = makeEngineInput({
      shifts: [],
      ruleset: { bucketMinutes: 60 },
    });

    const result = runEngine(input);
    const response = buildAssistantResponse(input, result);

    assert.equal(response.suggestions.length, 0);
    assert.ok(response.explanations.some(explanation => explanation.kind === 'info'));
  });

  it('passes through explanations with extended fields', () => {
    const input = makeEngineInput();
    const result = runEngine(input);
    const response = buildAssistantResponse(input, result);
    const withWhy: Explanation = {
      id: 'custom-explanation',
      kind: 'info',
      severity: 'low',
      title: 'Custom',
      details: 'Details',
      why: 'Because reasons',
      whyNow: 'Current schedule state',
      whatIfAccepted: 'Expected benefit',
      affected: {},
    };

    const augmentedResponse = {
      ...response,
      explanations: [...response.explanations, withWhy],
    };

    const explanation = augmentedResponse.explanations.find(
      item => item.id === 'custom-explanation'
    );

    assert.equal(explanation?.why, 'Because reasons');
    assert.equal(explanation?.whyNow, 'Current schedule state');
    assert.equal(explanation?.whatIfAccepted, 'Expected benefit');
  });

  it('does not set decisionState when no decisions are provided', () => {
    const input = makeEngineInput();
    const result = runEngine(input);
    const response = buildAssistantResponse(input, result);

    response.suggestions.forEach(suggestion => {
      assert.equal('decisionState' in suggestion, false);
    });
  });
});
