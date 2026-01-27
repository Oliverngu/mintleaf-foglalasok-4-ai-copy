import type { DecisionRecord } from '../response/decisionTypes.js';
import type { AssistantSession } from './types.js';
import { normalizeDecisions } from './decisionUtils.js';

export const createAssistantSession = (
  sessionId: string,
  now: number = 0
): AssistantSession => ({
  sessionId,
  decisions: [],
  createdAt: now,
  updatedAt: now,
});

export const applyDecisionToSession = (
  session: AssistantSession,
  decision: DecisionRecord,
  now: number = session.updatedAt
): AssistantSession => {
  const decisions = normalizeDecisions([...session.decisions, decision]);
  return {
    ...session,
    decisions,
    updatedAt: now,
  };
};

export const getSessionDecisions = (session: AssistantSession): DecisionRecord[] =>
  normalizeDecisions(session.decisions);
