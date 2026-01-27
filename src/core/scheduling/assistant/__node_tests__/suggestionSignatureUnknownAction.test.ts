import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Suggestion } from '../../engine/types.js';
import {
  buildSuggestionCanonicalKeysV2,
  buildSuggestionCanonicalStringV2,
} from '../ids/suggestionSignature.js';

describe('suggestion signature unknown action handling', () => {
  it('produces deterministic keys for unknown action types', () => {
    const suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      explanation: 'Unknown action',
      expectedImpact: 'Unknown impact',
      actions: [
        {
          type: 'deleteShift',
          shiftId: 's1',
          userId: 'u1',
          dateKey: '2024-01-01',
        },
      ],
    } as unknown as Suggestion;

    const firstKeys = buildSuggestionCanonicalKeysV2(suggestion);
    const secondKeys = buildSuggestionCanonicalKeysV2(suggestion);
    const firstCanonical = buildSuggestionCanonicalStringV2(suggestion);
    const secondCanonical = buildSuggestionCanonicalStringV2(suggestion);

    assert.deepEqual(firstKeys, secondKeys);
    assert.equal(firstCanonical, secondCanonical);
    assert.ok(firstKeys[0]?.startsWith('unknown|deleteShift|sha256:'));
  });

  it('does not include undefined in unknown action keys', () => {
    const suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      explanation: 'Unknown action',
      expectedImpact: 'Unknown impact',
      actions: [
        {
          type: 'weirdAction',
          foo: undefined,
          arr: [1, undefined, 2],
        },
      ],
    } as unknown as Suggestion;

    const keys = buildSuggestionCanonicalKeysV2(suggestion);
    assert.ok(keys.length > 0);
    assert.equal(keys.some(key => key.includes('undefined')), false);
  });

  it('degrades malformed createShift actions in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const suggestion = {
        type: 'ADD_SHIFT_SUGGESTION',
        explanation: 'Bad action',
        expectedImpact: 'Bad impact',
        actions: [
          {
            type: 'createShift',
            userId: 'u1',
            dateKey: '2024-01-01',
            endTime: '10:00',
          },
        ],
      } as unknown as Suggestion;

      const keys = buildSuggestionCanonicalKeysV2(suggestion);
      assert.ok(keys[0]?.startsWith('unknown|createShift|sha256:'));
      assert.equal(keys.some(key => key.includes('undefined')), false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
