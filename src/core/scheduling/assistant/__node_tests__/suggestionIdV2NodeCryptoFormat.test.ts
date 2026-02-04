import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Suggestion } from '../../engine/types.js';
import { buildAssistantSuggestionIdV2 } from '../ids/suggestionId.js';

const suggestion: Suggestion = {
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

describe('assistant suggestion id v2 node crypto format', () => {
  it('uses sha256 hex in node runtime', () => {
    const id = buildAssistantSuggestionIdV2(suggestion);
    assert.match(id, /^assistant-suggestion:v2:[0-9a-f]{64}$/);
  });
});
