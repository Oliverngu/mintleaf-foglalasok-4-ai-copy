import type { Suggestion } from '../../engine/types.js';
import type { Explanation } from '../types.js';
import { buildSuggestionAffected } from './suggestionAffected.js';

export const MAX_LINKED_VIOLATIONS = 5;
export const MAX_WHY_NOW_LENGTH = 200;

const hasOverlap = (left?: string[], right?: string[]) => {
  if (!left?.length || !right?.length) return false;
  return left.some(value => right.includes(value));
};

const isSuggestionRelatedToViolation = (
  suggestionAffected: Explanation['affected'],
  violationAffected: Explanation['affected']
) =>
  (suggestionAffected.positionId &&
    suggestionAffected.positionId === violationAffected.positionId) ||
  hasOverlap(suggestionAffected.userIds, violationAffected.userIds) ||
  hasOverlap(suggestionAffected.shiftIds, violationAffected.shiftIds) ||
  hasOverlap(suggestionAffected.dateKeys, violationAffected.dateKeys) ||
  hasOverlap(suggestionAffected.slots, violationAffected.slots);

const truncateWhyNow = (value?: string) => {
  if (!value) return undefined;
  if (value.length <= MAX_WHY_NOW_LENGTH) return value;
  return `${value.slice(0, MAX_WHY_NOW_LENGTH - 3)}...`;
};

const formatWhyNow = (linkedConstraintIds: string[]) => {
  if (linkedConstraintIds.length === 0) return undefined;
  const shown = linkedConstraintIds.slice(0, MAX_LINKED_VIOLATIONS);
  const remaining = linkedConstraintIds.length - shown.length;
  const suffix = remaining > 0 ? `... (+${remaining} more)` : '';
  return truncateWhyNow(`Linked to violations: ${shown.join(', ')}${suffix}`);
};

export const buildSuggestionExplainability = (
  suggestion: Suggestion,
  violationExplanations: Explanation[]
): {
  why?: string;
  whyNow?: string;
  whatIfAccepted?: string;
  relatedConstraintId?: string;
} => {
  const affected = buildSuggestionAffected(suggestion);
  const linkedConstraintIds = violationExplanations
    .filter(violation => isSuggestionRelatedToViolation(affected, violation.affected))
    .map(violation => violation.relatedConstraintId ?? violation.title)
    .filter((value): value is string => Boolean(value));
  const sorted = linkedConstraintIds.sort();

  return {
    why: suggestion.explanation,
    whyNow: formatWhyNow(sorted),
    whatIfAccepted: suggestion.expectedImpact,
    relatedConstraintId: sorted[0],
  };
};
