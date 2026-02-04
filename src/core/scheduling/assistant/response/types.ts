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
    signatureHashFormat?: 'sha256:hex' | 'fnv1a:hex' | 'unknown';
    signaturePreview?: string;
    signatureDegraded?: boolean;
    signatureDegradeReason?: 'missing_fields' | 'invalid_fields' | 'unknown_action';
    signatureDegradeActionType?: string;
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
