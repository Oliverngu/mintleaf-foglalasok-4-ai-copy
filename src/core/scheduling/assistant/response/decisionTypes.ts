export type DecisionRecord = {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  timestamp?: number;
  sessionId?: string;
  suggestionVersion?: 'v2' | 'v1' | 'v0';
  reason?: string;
  source?: 'user' | 'system';
};
