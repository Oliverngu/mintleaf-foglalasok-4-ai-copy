import type { DecisionRecord } from '../response/decisionTypes.js';

export type AssistantSession = {
  sessionId: string;
  decisions: DecisionRecord[];
  schemaVersion: 1;
  contextKey: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
};
