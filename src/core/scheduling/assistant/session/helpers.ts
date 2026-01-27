import type { DecisionRecord } from '../response/decisionTypes.js';
import type { EngineInput } from '../../engine/types.js';
import type { AssistantSession } from './types.js';
import { normalizeDecisions } from './decisionUtils.js';
import { computeAssistantContextKey } from './contextKey.js';

export const createAssistantSession = (
  sessionId: string,
  now: number = 0,
  input?: EngineInput,
  ttlMs?: number
): AssistantSession => ({
  sessionId,
  decisions: [],
  schemaVersion: 1,
  contextKey: input ? computeAssistantContextKey(input) : '',
  createdAt: now,
  updatedAt: now,
  expiresAt: ttlMs ? now + ttlMs : undefined,
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
