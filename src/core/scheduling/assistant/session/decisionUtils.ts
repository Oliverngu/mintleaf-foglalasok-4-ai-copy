import type { DecisionRecord } from '../response/decisionTypes.js';

const decisionRank: Record<DecisionRecord['decision'], number> = {
  accepted: 2,
  rejected: 1,
};

const assertInvariant = (condition: boolean, message: string) => {
  if (process.env.NODE_ENV === 'production') return;
  if (!condition) {
    throw new Error(message);
  }
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

const areDecisionsNormalized = (
  decisions: DecisionRecord[],
  normalized: DecisionRecord[]
) =>
  decisions.length === normalized.length &&
  decisions.every(
    (decision, index) =>
      decision.suggestionId === normalized[index]?.suggestionId &&
      decision.decision === normalized[index]?.decision &&
      decision.timestamp === normalized[index]?.timestamp
  );

export const buildDecisionMap = (decisions?: DecisionRecord[]) => {
  const map = new Map<string, DecisionRecord['decision']>();
  if (!decisions) return map;
  const normalized = normalizeDecisions(decisions);
  assertInvariant(
    areDecisionsNormalized(decisions, normalized),
    'Decision map input must be normalized before building.'
  );
  normalized.forEach(decision => {
    map.set(decision.suggestionId, decision.decision);
  });
  return map;
};
