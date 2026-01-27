import type { Suggestion, SuggestionAction } from '../../engine/types.js';
import type { Explanation } from '../types.js';

export type AssistantSuggestion = {
  id: string;
  type: Suggestion['type'];
  severity: 'low' | 'medium' | 'high';
  meta?: {
    v1SuggestionId?: string;
    signatureVersion?: 'sig:v2';
    signatureHash?: string;
    signaturePreview?: string;
  };
  why?: string;
  whyNow?: string;
  whatIfAccepted?: string;
  explanation: string;
  expectedImpact: string;
  actions: SuggestionAction[];
  decisionState?: 'accepted' | 'rejected' | 'pending';
};

export type AssistantResponse = {
  explanations: Explanation[];
  suggestions: AssistantSuggestion[];
};
