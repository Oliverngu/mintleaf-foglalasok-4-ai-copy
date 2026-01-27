import type { Suggestion } from '../../engine/types.js';
import { sha256HexSync } from './hashUtils.js';
import {
  assertSuggestionSignatureInvariant,
  buildSuggestionCanonicalStringV2,
} from './suggestionSignature.js';

const SUGGESTION_ID_PREFIX_V1 = 'assistant-suggestion:v1';
const SUGGESTION_ID_PREFIX_V2 = 'assistant-suggestion:v2';

const buildActionKeyV1 = (action: Suggestion['actions'][number]) => {
  if (action.type === 'moveShift') {
    return [
      action.type,
      action.shiftId,
      action.userId,
      action.dateKey,
      action.newStartTime,
      action.newEndTime,
      action.positionId ?? '',
    ].join('|');
  }

  return [
    action.type,
    action.userId,
    action.dateKey,
    action.startTime,
    action.endTime,
    action.positionId ?? '',
  ].join('|');
};

export const buildAssistantSuggestionIdV1 = (suggestion: Suggestion): string =>
  [
    SUGGESTION_ID_PREFIX_V1,
    suggestion.type,
    suggestion.actions.map(buildActionKeyV1).join(';'),
    suggestion.expectedImpact,
    suggestion.explanation,
  ].join(':');

export const isAssistantSuggestionIdV1 = (id: string): boolean =>
  id.startsWith(`${SUGGESTION_ID_PREFIX_V1}:`);

export const buildAssistantSuggestionIdV2 = (suggestion: Suggestion): string => {
  assertSuggestionSignatureInvariant(suggestion);
  const canonical = buildSuggestionCanonicalStringV2(suggestion);
  const hash = sha256HexSync(canonical);
  return `${SUGGESTION_ID_PREFIX_V2}:${hash}`;
};

export const isAssistantSuggestionIdV2 = (id: string): boolean =>
  id.startsWith(`${SUGGESTION_ID_PREFIX_V2}:`);

export const getAssistantSuggestionIdVersion = (
  id: string
): 'v2' | 'v1' | 'unknown' => {
  if (isAssistantSuggestionIdV2(id)) return 'v2';
  if (isAssistantSuggestionIdV1(id)) return 'v1';
  return 'unknown';
};
