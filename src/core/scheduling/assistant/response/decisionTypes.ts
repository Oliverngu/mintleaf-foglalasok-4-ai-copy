export type DecisionRecord = {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  timestamp?: number;
  sessionId?: string;
  suggestionVersion?: 'v1' | 'v0';
};
