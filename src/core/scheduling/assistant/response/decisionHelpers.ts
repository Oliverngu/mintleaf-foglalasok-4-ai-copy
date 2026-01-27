import type { DecisionRecord } from './decisionTypes.js';

export const getSuggestionIdVersion = (id: string): 'v1' | 'unknown' =>
  id.startsWith('assistant-suggestion:v1:') ? 'v1' : 'unknown';

export const createDecisionRecord = (
  suggestionId: string,
  decision: DecisionRecord['decision'],
  timestamp?: number,
  sessionId?: string
): DecisionRecord => ({
  suggestionId,
  decision,
  timestamp,
  sessionId,
  suggestionVersion: getSuggestionIdVersion(suggestionId) === 'v1' ? 'v1' : 'v0',
});
