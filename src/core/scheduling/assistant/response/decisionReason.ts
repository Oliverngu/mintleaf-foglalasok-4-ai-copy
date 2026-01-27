export const MAX_DECISION_REASON_LENGTH = 280;

export const sanitizeDecisionReason = (input?: string): string | undefined => {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return undefined;
  if (trimmed.length <= MAX_DECISION_REASON_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_DECISION_REASON_LENGTH - 3)}...`;
};
