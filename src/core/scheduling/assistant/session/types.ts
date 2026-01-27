import type { DecisionRecord } from '../response/decisionTypes.js';

export type AssistantSession = {
  sessionId: string;
  decisions: DecisionRecord[];
  createdAt: number;
  updatedAt: number;
};
