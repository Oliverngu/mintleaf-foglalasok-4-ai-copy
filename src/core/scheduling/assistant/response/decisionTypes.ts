export type DecisionRecord = {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  timestamp?: number;
};
