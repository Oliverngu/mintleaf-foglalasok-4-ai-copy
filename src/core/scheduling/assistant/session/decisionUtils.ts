import type { DecisionRecord } from '../response/decisionTypes.js';

const decisionRank: Record<DecisionRecord['decision'], number> = {
  accepted: 2,
  rejected: 1,
};

const sourceRank = (source?: DecisionRecord['source']) =>
  source === 'system' ? 2 : source === 'user' ? 1 : 0;

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
    const decisionDiff = decisionRank[b.decision] - decisionRank[a.decision];
    if (decisionDiff !== 0) return decisionDiff;
    const sourceDiff = sourceRank(b.source) - sourceRank(a.source);
    if (sourceDiff !== 0) return sourceDiff;
    return (a.reason ?? '').localeCompare(b.reason ?? '');
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
      decision.timestamp === normalized[index]?.timestamp &&
      // reason and source are part of the normalization contract
      decision.reason === normalized[index]?.reason &&
      decision.source === normalized[index]?.source
  );

export const buildDecisionMap = (decisions?: DecisionRecord[]) => {
  const map = new Map<string, DecisionRecord['decision']>();
  if (!decisions) return map;
  const normalized = normalizeDecisions(decisions);
  const normalizedTwice = normalizeDecisions(normalized);
  assertInvariant(
    areDecisionsNormalized(normalized, normalizedTwice),
    'Decision normalization must be stable.'
  );
  normalized.forEach(decision => {
    map.set(decision.suggestionId, decision.decision);
  });
  return map;
};
