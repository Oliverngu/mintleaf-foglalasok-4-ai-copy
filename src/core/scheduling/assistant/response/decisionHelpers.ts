import type { DecisionRecord } from './decisionTypes.js';
import { getAssistantSuggestionIdVersion } from '../ids/suggestionId.js';
import { sanitizeDecisionReason } from './decisionReason.js';

export const getSuggestionIdVersion = (id: string): 'v2' | 'v1' | 'unknown' =>
  getAssistantSuggestionIdVersion(id);

export const createDecisionRecord = (
  suggestionId: string,
  decision: DecisionRecord['decision'],
  timestamp?: number,
  sessionId?: string,
  reason?: string,
  source?: DecisionRecord['source']
): DecisionRecord => {
  const sanitized = sanitizeDecisionReason(reason);
  const version = getSuggestionIdVersion(suggestionId);
  return {
    suggestionId,
    decision,
    timestamp,
    sessionId,
    suggestionVersion: version === 'v2' || version === 'v1' ? version : 'v0',
    reason: sanitized,
    source: source ?? (sanitized ? 'user' : undefined),
  };
};
