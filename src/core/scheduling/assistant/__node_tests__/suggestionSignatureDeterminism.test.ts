import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Suggestion } from '../../engine/types.js';
import {
  buildSuggestionSignatureV2,
  stringifySuggestionSignature,
} from '../ids/suggestionSignature.js';

const baseSuggestion: Suggestion = {
  type: 'ADD_SHIFT_SUGGESTION',
  explanation: 'Add coverage.',
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

describe('suggestion signature determinism', () => {
  it('returns the same signature string for identical suggestions', () => {
    const first = stringifySuggestionSignature(buildSuggestionSignatureV2(baseSuggestion));
    const second = stringifySuggestionSignature(buildSuggestionSignatureV2(baseSuggestion));

    assert.equal(first, second);
  });

  it('ignores explanation and expectedImpact', () => {
    const original = stringifySuggestionSignature(buildSuggestionSignatureV2(baseSuggestion));
    const updated = stringifySuggestionSignature(
      buildSuggestionSignatureV2({
        ...baseSuggestion,
        explanation: 'Updated explanation.',
        expectedImpact: 'Updated impact.',
      })
    );

    assert.equal(original, updated);
  });
});
