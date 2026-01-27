import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Suggestion } from '../../engine/types.js';
import { buildAssistantSuggestionIdV2 } from '../ids/suggestionId.js';
import { sha256HexSync } from '../ids/hashUtils.js';
import { buildSuggestionCanonicalStringV2 } from '../ids/suggestionSignature.js';

const suggestion: Suggestion = {
  type: 'SHIFT_MOVE_SUGGESTION',
  explanation: 'Move shift to cover.',
  expectedImpact: 'Coverage improved.',
  actions: [
    {
      type: 'moveShift',
      shiftId: 'shift-1',
      userId: 'user-1',
      dateKey: '2024-01-02',
      newStartTime: '09:00',
      newEndTime: '11:00',
      positionId: 'pos-1',
    },
  ],
};

describe('assistant suggestion id v2 back-compat', () => {
  it('matches the previous canonical string format', () => {
    const manualCanonical =
      'v2|SHIFT_MOVE_SUGGESTION|moveShift|shift-1|user-1|2024-01-02|09:00|11:00|pos-1';
    const computedCanonical = buildSuggestionCanonicalStringV2(suggestion);

    assert.equal(computedCanonical, manualCanonical);
  });

  it('hashes the canonical string deterministically', () => {
    const canonical = buildSuggestionCanonicalStringV2(suggestion);
    const expectedId = `assistant-suggestion:v2:${sha256HexSync(canonical)}`;

    assert.equal(buildAssistantSuggestionIdV2(suggestion), expectedId);
  });
});
