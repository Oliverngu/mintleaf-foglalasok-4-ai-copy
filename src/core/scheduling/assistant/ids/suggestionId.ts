import type { Suggestion } from '../../engine/types.js';

const SUGGESTION_ID_PREFIX = 'assistant-suggestion:v1';

const buildActionKey = (action: Suggestion['actions'][number]) => {
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
    SUGGESTION_ID_PREFIX,
    suggestion.type,
    suggestion.actions.map(buildActionKey).join(';'),
    suggestion.expectedImpact,
    suggestion.explanation,
  ].join(':');

export const isAssistantSuggestionIdV1 = (id: string): boolean =>
  id.startsWith(`${SUGGESTION_ID_PREFIX}:`);

export const getAssistantSuggestionIdVersion = (id: string): 'v1' | 'unknown' =>
  isAssistantSuggestionIdV1(id) ? 'v1' : 'unknown';
