import type { EngineInput } from '../../engine/types.js';
import type { AssistantSession } from './types.js';
import { normalizeDecisions } from './decisionUtils.js';
import { computeAssistantContextKey } from './contextKey.js';

const CURRENT_SESSION_SCHEMA_VERSION: AssistantSession['schemaVersion'] = 1;

export const isSessionValid = (
  session: AssistantSession,
  input: EngineInput,
  now: number
): boolean => {
  if (session.schemaVersion !== CURRENT_SESSION_SCHEMA_VERSION) return false;
  if (session.contextKey !== computeAssistantContextKey(input)) return false;
  if (session.expiresAt !== undefined && now > session.expiresAt) return false;
  return true;
};

export const normalizeOrResetSession = (
  session: AssistantSession | undefined,
  input: EngineInput,
  now: number
): AssistantSession | undefined => {
  if (!session) return undefined;
  if (!isSessionValid(session, input, now)) return undefined;
  return {
    ...session,
    decisions: normalizeDecisions(session.decisions),
  };
};
