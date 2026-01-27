import type { Suggestion } from '../../engine/types.js';
import type { Explanation } from '../types.js';

const normalizeArray = (values: string[]) => Array.from(new Set(values)).sort();

export const buildSuggestionAffected = (
  suggestion: Suggestion
): Explanation['affected'] => {
  const userIds: string[] = [];
  const shiftIds: string[] = [];
  const dateKeys: string[] = [];
  const positionIds: string[] = [];

  suggestion.actions.forEach(action => {
    userIds.push(action.userId);
    if (action.type === 'moveShift') {
      shiftIds.push(action.shiftId);
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    } else {
      dateKeys.push(action.dateKey);
      if (action.positionId) positionIds.push(action.positionId);
    }
  });

  return {
    userIds: normalizeArray(userIds),
    shiftIds: normalizeArray(shiftIds),
    dateKeys: normalizeArray(dateKeys),
    positionId: positionIds.sort()[0],
  };
};
