import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runEngine } from '../../engine/runEngine.js';
import { buildWeekDays, makeEngineInput } from '../../tests/engineTestHarness.js';
import { buildAssistantResponse } from '../response/buildAssistantResponse.js';

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

describe('assistant suggestion meta signature', () => {
  it('includes signature metadata on suggestions', () => {
    const input = buildInputWithSuggestion();
    const result = runEngine(input);
    const response = buildAssistantResponse(input, result);

    assert.ok(response.suggestions.length > 0);
    const meta = response.suggestions[0].meta;

    assert.equal(meta?.signatureVersion, 'sig:v2');
    assert.ok(meta?.signatureHash);
    assert.ok(meta?.signatureHashFormat);
    assert.ok(meta?.signaturePreview);
  });
});
