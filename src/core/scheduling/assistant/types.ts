import { Severity } from '../engine/types.js';

export type ExplanationKind = 'violation' | 'suggestion' | 'info';

export type ExplanationAffected = {
  userIds?: string[];
  shiftIds?: string[];
  slots?: string[];
  positionId?: string;
  dateKeys?: string[];
};

export type Explanation = {
  id: string;
  kind: ExplanationKind;
  severity: Severity;
  title: string;
  details: string;
  why?: string;
  whyNow?: string;
  whatIfAccepted?: string;
  affected: ExplanationAffected;
  relatedConstraintId?: string;
  relatedSuggestionId?: string;
  meta?: Record<string, unknown>;
};
