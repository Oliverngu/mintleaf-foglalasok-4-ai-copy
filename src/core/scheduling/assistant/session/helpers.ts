import type { DecisionRecord } from '../response/decisionTypes.js';
import type { AssistantSession } from './types.js';

const decisionRank: Record<DecisionRecord['decision'], number> = {
  accepted: 2,
  rejected: 1,
};

const normalizeDecisions = (decisions: DecisionRecord[]): DecisionRecord[] => {
  const sorted = [...decisions].sort((a, b) => {
    const idCompare = a.suggestionId.localeCompare(b.suggestionId);
    if (idCompare !== 0) return idCompare;
    const timeA = a.timestamp ?? -1;
    const timeB = b.timestamp ?? -1;
    if (timeA !== timeB) return timeB - timeA;
    return decisionRank[b.decision] - decisionRank[a.decision];
  });

  const seen = new Set<string>();
  const unique: DecisionRecord[] = [];
  sorted.forEach(decision => {
    if (seen.has(decision.suggestionId)) return;
    seen.add(decision.suggestionId);
    unique.push(decision);
  });

  return unique;
};

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
