import type { DecisionExplanationMeta, Explanation } from '../types.js';

export const isDecisionExplanationMeta = (
  meta?: Explanation['meta']
): meta is DecisionExplanationMeta => {
  if (!meta || typeof meta !== 'object') return false;
  const record = meta as DecisionExplanationMeta;
  return (
    (record.decisionSource === 'user' || record.decisionSource === 'system') &&
    typeof record.hasDecisionReason === 'boolean' &&
    (record.decisionTimestamp === undefined || typeof record.decisionTimestamp === 'number') &&
    (record.decision === 'accepted' || record.decision === 'rejected')
  );
};
