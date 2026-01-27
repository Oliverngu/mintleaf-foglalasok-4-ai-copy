import type {
  ConstraintViolation,
  MinCoverageRule,
  Suggestion,
  SuggestionAction
} from '../../../../core/scheduling/engine/types.js';
import type { MinCoverageOverride, Scenario } from '../../../../core/scheduling/scenarios/types.js';

export type FocusWindow = {
  dateKey: string;
  timeRange?: { startTime: string; endTime: string };
};

export type FocusTimeOption = {
  key: string;
  label: string;
  timeRange?: { startTime: string; endTime: string };
};

export const SCENARIO_TYPE_PRIORITY: Record<Scenario['type'], number> = {
  SICKNESS: 1,
  EVENT: 2,
  PEAK: 3,
  LAST_MINUTE: 4
};

const TIME_REGEX = /^\d{2}:\d{2}$/;

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const normalizeRange = (start: string, end: string): Array<[number, number]> => {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (endMinutes <= startMinutes) {
    return [
      [startMinutes, 24 * 60],
      [0, endMinutes]
    ];
  }
  return [[startMinutes, endMinutes]];
};

export const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean => {
  if (![aStart, aEnd, bStart, bEnd].every(time => TIME_REGEX.test(time))) return false;
  const aRanges = normalizeRange(aStart, aEnd);
  const bRanges = normalizeRange(bStart, bEnd);
  return aRanges.some(([aFrom, aTo]) =>
    bRanges.some(([bFrom, bTo]) => Math.max(aFrom, bFrom) < Math.min(aTo, bTo))
  );
};

export const filterRulesByFocus = (
  rules: MinCoverageRule[],
  focus: FocusWindow
): MinCoverageRule[] =>
  rules.filter(rule => {
    const dateKeys = rule.dateKeys ?? [];
    if (!dateKeys.includes(focus.dateKey)) return false;
    if (!focus.timeRange) return true;
    return rangesOverlap(rule.startTime, rule.endTime, focus.timeRange.startTime, focus.timeRange.endTime);
  });

export const buildFocusWindow = (
  weekDays: string[],
  scenarios: Scenario[],
  selectedDateKey?: string
): FocusWindow => {
  const dateKey = selectedDateKey || weekDays[0] || '';
  const eventScenario = scenarios.find(scenario =>
    scenario.type === 'EVENT' || scenario.type === 'PEAK'
  );
  const timeRange =
    eventScenario && 'timeRange' in eventScenario.payload
      ? eventScenario.payload.timeRange
      : undefined;
  return { dateKey, timeRange };
};

const getScenarioDateKeys = (scenario: Scenario): string[] => {
  if ('dateKeys' in scenario.payload) {
    return scenario.payload.dateKeys ?? [];
  }
  return scenario.dateKeys ?? [];
};

const getScenarioTimeRange = (scenario: Scenario) => {
  if (scenario.type === 'EVENT' || scenario.type === 'PEAK') {
    return scenario.payload.timeRange;
  }
  return undefined;
};

export const formatTimeRangeLabel = (range?: { startTime: string; endTime: string }): string => {
  if (!range) return 'Egész nap';
  return `${range.startTime}–${range.endTime}`;
};

export const getRuleSummaryLabel = (
  rule: MinCoverageRule,
  positionNameById: Map<string, string>
): string => {
  const positionLabel = positionNameById.get(rule.positionId) || rule.positionId;
  const dateLabel = (rule.dateKeys ?? []).join(', ');
  return `${positionLabel} · ${rule.startTime}–${rule.endTime} · ${dateLabel} · min ${rule.minCount}`;
};

export const formatOverrideLabel = (
  overrides: MinCoverageOverride[] = [],
  positionNameById?: Map<string, string>
): string => {
  if (overrides.length === 0) return '';
  return overrides
    .map(override => {
      const position = positionNameById?.get(override.positionId) || override.positionId;
      return `${position} min ${override.minCount}`;
    })
    .join(', ');
};

export const formatScenarioMeta = (
  scenario: Scenario,
  userNameById: Map<string, string>,
  positionNameById: Map<string, string>
) => {
  const dateKeys = getScenarioDateKeys(scenario);
  const dateLabel = dateKeys.join(', ');
  const timeRange = getScenarioTimeRange(scenario);
  const timeLabel = timeRange ? formatTimeRangeLabel(timeRange) : 'Egész nap';
  const overrides =
    scenario.type === 'EVENT' || scenario.type === 'PEAK'
      ? scenario.payload.minCoverageOverrides ?? []
      : [];
  const overrideLabel = formatOverrideLabel(overrides, positionNameById);
  let descriptionLine = scenario.type === 'LAST_MINUTE' ? scenario.payload.description : '';

  if (scenario.type === 'SICKNESS') {
    const name = userNameById.get(scenario.payload.userId) || scenario.payload.userId;
    descriptionLine = `${name} · ${dateLabel}`;
  } else if (scenario.type === 'EVENT' || scenario.type === 'PEAK') {
    descriptionLine = 'Fokozott igény az időszakban';
  }

  return {
    dateLabel,
    timeLabel,
    overrideLabel,
    descriptionLine
  };
};

export const sortScenariosForTimeline = (scenarios: Scenario[]): Scenario[] =>
  [...scenarios].sort((a, b) => {
    const typeDiff = SCENARIO_TYPE_PRIORITY[a.type] - SCENARIO_TYPE_PRIORITY[b.type];
    if (typeDiff !== 0) return typeDiff;
    const aPayloadDateKeys =
      'dateKeys' in a.payload ? a.payload.dateKeys : undefined;
    const bPayloadDateKeys =
      'dateKeys' in b.payload ? b.payload.dateKeys : undefined;
    const aDate = (a.dateKeys ?? aPayloadDateKeys ?? [''])[0] || '';
    const bDate = (b.dateKeys ?? bPayloadDateKeys ?? [''])[0] || '';
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    const aCreated = a.createdAt ?? '';
    const bCreated = b.createdAt ?? '';
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return a.id.localeCompare(b.id);
  });

export const describeScenario = (
  scenario: Scenario,
  userNameById: Map<string, string>,
  positionNameById: Map<string, string>
): string => {
  return formatScenarioMeta(scenario, userNameById, positionNameById).descriptionLine;
};

export const summarizeViolations = (violations: ConstraintViolation[]) => {
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const highest = violations.reduce<'low' | 'medium' | 'high' | null>((acc, violation) => {
    if (!acc) return violation.severity;
    return severityRank[violation.severity] > severityRank[acc] ? violation.severity : acc;
  }, null);
  return { total: violations.length, highestSeverity: highest };
};

export const summarizeViolationsBySeverity = (violations: ConstraintViolation[]) => {
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const counts = violations.reduce(
    (acc, violation) => {
      acc[violation.severity] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 }
  );
  const highest = violations.reduce<'low' | 'medium' | 'high' | null>((acc, violation) => {
    if (!acc) return violation.severity;
    return severityRank[violation.severity] > severityRank[acc] ? violation.severity : acc;
  }, null);
  return {
    ...counts,
    total: violations.length,
    highestSeverity: highest
  };
};

export const labelViolation = (violation: ConstraintViolation): string => {
  if (violation.constraintId === 'MIN_COVERAGE_BY_POSITION') {
    return 'Coverage Shortage';
  }
  return violation.constraintId;
};

export const getViolationDetail = (
  violation: ConstraintViolation,
  positionNameById?: Map<string, string>
): string => {
  if (violation.affected.positionId) {
    return positionNameById?.get(violation.affected.positionId) || violation.affected.positionId;
  }
  if (violation.affected.dateKeys && violation.affected.dateKeys.length > 0) {
    return violation.affected.dateKeys[0];
  }
  if (violation.affected.slots && violation.affected.slots.length > 0) {
    return violation.affected.slots[0];
  }
  return '';
};

export const getSuggestionSummary = (suggestions: Suggestion[]): string => {
  if (suggestions.length === 0) return 'Nincs javaslat.';
  if (suggestions.length === 1) return '1 javaslat';
  return `${suggestions.length} javaslat`;
};

export const getScenarioFocusTimeOptions = (
  scenarios: Scenario[],
  dateKey: string
): FocusTimeOption[] => {
  const options = new Map<string, FocusTimeOption>();
  options.set('ALL_DAY', { key: 'ALL_DAY', label: 'Egész nap' });
  scenarios.forEach(scenario => {
    if (scenario.type !== 'EVENT' && scenario.type !== 'PEAK') return;
    const dateKeys = scenario.payload.dateKeys ?? [];
    if (!dateKeys.includes(dateKey)) return;
    const range = scenario.payload.timeRange;
    const key = `${range.startTime}-${range.endTime}`;
    if (!options.has(key)) {
      options.set(key, { key, label: formatTimeRangeLabel(range), timeRange: range });
    }
  });
  const allOptions = Array.from(options.values());
  const timedOptions = allOptions
    .filter(option => option.timeRange)
    .sort((a, b) => {
      const aMinutes = toMinutes(a.timeRange!.startTime);
      const bMinutes = toMinutes(b.timeRange!.startTime);
      if (aMinutes !== bMinutes) return aMinutes - bMinutes;
      return a.timeRange!.endTime.localeCompare(b.timeRange!.endTime);
    });
  return [options.get('ALL_DAY')!, ...timedOptions];
};

const formatSuggestionActionLabel = (
  action: SuggestionAction,
  userNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
): string => {
  const userLabel = userNameById?.get(action.userId) || action.userId;
  const positionLabel = action.positionId
    ? positionNameById?.get(action.positionId) || action.positionId
    : '';
  const positionSuffix = positionLabel ? ` · ${positionLabel}` : '';
  if (action.type === 'moveShift') {
    return `Mozgatás: ${userLabel} · ${action.dateKey} · ${action.newStartTime}–${action.newEndTime}${positionSuffix}`;
  }
  return `Új műszak: ${userLabel} · ${action.dateKey} · ${action.startTime}–${action.endTime}${positionSuffix}`;
};

export const summarizeSuggestions = (
  suggestions: Suggestion[],
  userNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
) => {
  const byType = {
    SHIFT_MOVE_SUGGESTION: 0,
    ADD_SHIFT_SUGGESTION: 0
  };
  suggestions.forEach(suggestion => {
    byType[suggestion.type] += 1;
  });
  const firstAction = suggestions[0]?.actions?.[0];
  const firstActionLabel = firstAction
    ? formatSuggestionActionLabel(firstAction, userNameById, positionNameById)
    : undefined;
  return {
    total: suggestions.length,
    byType,
    firstActionLabel
  };
};
