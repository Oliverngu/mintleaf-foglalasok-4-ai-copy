import type { DecisionRecord } from '../response/decisionTypes.js';

const decisionRank: Record<DecisionRecord['decision'], number> = {
  accepted: 2,
  rejected: 1,
};

export const normalizeDecisions = (decisions: DecisionRecord[]): DecisionRecord[] => {
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

export const buildDecisionMap = (decisions?: DecisionRecord[]) => {
  const map = new Map<string, DecisionRecord['decision']>();
  if (!decisions) return map;
  normalizeDecisions(decisions).forEach(decision => {
    map.set(decision.suggestionId, decision.decision);
  });
  return map;
};
