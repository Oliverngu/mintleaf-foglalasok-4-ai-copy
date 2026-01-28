import type { EngineResult } from '../../../../core/scheduling/engine/types';
import { buildSuggestionKey, buildViolationKey } from './ScenarioTimelineUtils';

const uniq = (items: string[]) => Array.from(new Set(items));

const filterByWeek = (items: string[], weekDayKeys?: string[]) => {
  if (!weekDayKeys || weekDayKeys.length === 0) return items;
  const allowed = new Set(weekDayKeys);
  return items.filter(item => {
    const [, dayKey] = item.split('|');
    return allowed.has(dayKey);
  });
};

export const getSuggestionHighlightCellKeys = (
  engineResult: EngineResult,
  suggestionKey: string,
  context?: { weekDayKeys?: string[] }
): string[] => {
  const suggestion = engineResult.suggestions.find(
    item => buildSuggestionKey(item) === suggestionKey
  );
  if (!suggestion) return [];

  const keys = suggestion.actions
    .map(action => `${action.userId}|${action.dateKey}`)
    .filter(Boolean);

  return filterByWeek(uniq(keys), context?.weekDayKeys);
};

export const getViolationHighlightCellKeys = (
  engineResult: EngineResult,
  violationKey: string,
  context?: { weekDayKeys?: string[] }
): string[] => {
  const violation = engineResult.violations.find(
    item => buildViolationKey(item) === violationKey
  );
  if (!violation) return [];

  const userIds = violation.affected.userIds ?? [];
  const dateKeys = violation.affected.dateKeys ?? [];

  if (userIds.length === 0 || dateKeys.length === 0) return [];

  const keys: string[] = [];
  userIds.forEach(userId => {
    dateKeys.forEach(dateKey => {
      keys.push(`${userId}|${dateKey}`);
    });
  });

  return filterByWeek(uniq(keys), context?.weekDayKeys);
};
