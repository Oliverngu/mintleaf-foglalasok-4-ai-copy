import type { DecisionRecord } from './decisionTypes.js';
import { getAssistantSuggestionIdVersion } from '../ids/suggestionId.js';
import { sanitizeDecisionReason } from './decisionReason.js';

export const getSuggestionIdVersion = (id: string): 'v1' | 'unknown' =>
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
  return {
    suggestionId,
    decision,
    timestamp,
    sessionId,
    suggestionVersion: getSuggestionIdVersion(suggestionId) === 'v1' ? 'v1' : 'v0',
    reason: sanitized,
    source: source ?? (sanitized ? 'user' : undefined),
  };
};
