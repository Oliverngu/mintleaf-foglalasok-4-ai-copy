import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Suggestion } from '../../engine/types.js';
import {
  buildAssistantSuggestionIdV1,
  buildAssistantSuggestionIdV2,
} from '../ids/suggestionId.js';

const baseSuggestion: Suggestion = {
  type: 'ADD_SHIFT_SUGGESTION',
  explanation: 'Add coverage for a gap.',
  expectedImpact: 'Coverage improved.',
  actions: [
    {
      type: 'createShift',
      userId: 'user-1',
      dateKey: '2024-01-01',
      startTime: '08:00',
      endTime: '12:00',
      positionId: 'pos-1',
    },
  ],
};

describe('assistant suggestion id v2 determinism', () => {
  it('returns the same v2 id for the same suggestion', () => {
    const first = buildAssistantSuggestionIdV2(baseSuggestion);
    const second = buildAssistantSuggestionIdV2(baseSuggestion);

    assert.equal(first, second);
  });

  it('ignores explanation and expectedImpact changes for v2', () => {
    const originalV2 = buildAssistantSuggestionIdV2(baseSuggestion);
    const originalV1 = buildAssistantSuggestionIdV1(baseSuggestion);

    const updatedSuggestion: Suggestion = {
      ...baseSuggestion,
      explanation: 'Updated explanation.',
      expectedImpact: 'Updated impact.',
    };

    const updatedV2 = buildAssistantSuggestionIdV2(updatedSuggestion);
    const updatedV1 = buildAssistantSuggestionIdV1(updatedSuggestion);

    assert.equal(originalV2, updatedV2);
    assert.notEqual(originalV1, updatedV1);
  });
});
