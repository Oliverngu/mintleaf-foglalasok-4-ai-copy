import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DecisionRecord } from '../response/decisionTypes.js';
import { normalizeDecisions } from '../session/decisionUtils.js';

const buildDecision = (overrides: Partial<DecisionRecord>): DecisionRecord => ({
  suggestionId: 'assistant-suggestion:v1:test',
  decision: 'accepted',
  ...overrides,
});

describe('normalizeDecisions', () => {
  it('keeps the latest decision and preserves its reason', () => {
    const older = buildDecision({
      decision: 'rejected',
      timestamp: 1,
      reason: 'Older reason',
      source: 'user',
    });
    const newer = buildDecision({
      decision: 'accepted',
      timestamp: 2,
      reason: 'Newer reason',
      source: 'system',
    });

    const normalized = normalizeDecisions([older, newer]);

    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].decision, 'accepted');
    assert.equal(normalized[0].reason, 'Newer reason');
    assert.equal(normalized[0].source, 'system');
  });

  it('prefers system decisions for equal timestamps', () => {
    const userDecision = buildDecision({
      decision: 'accepted',
      timestamp: 1,
      reason: 'User reason',
      source: 'user',
    });
    const systemDecision = buildDecision({
      decision: 'accepted',
      timestamp: 1,
      reason: 'System reason',
      source: 'system',
    });

    const normalized = normalizeDecisions([userDecision, systemDecision]);

    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].source, 'system');
    assert.equal(normalized[0].reason, 'System reason');
  });
});
