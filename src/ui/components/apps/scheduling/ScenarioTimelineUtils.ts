import type { ConstraintViolation, MinCoverageRule, Suggestion } from '../../../../core/scheduling/engine/types.js';
import type { Scenario } from '../../../../core/scheduling/scenarios/types.js';

export type FocusWindow = {
  dateKey: string;
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
  if (scenario.type === 'SICKNESS') {
    const name = userNameById.get(scenario.payload.userId) || scenario.payload.userId;
    return `${name} · ${scenario.payload.dateKeys.join(', ')}`;
  }

  if (scenario.type === 'EVENT' || scenario.type === 'PEAK') {
    const range = scenario.payload.timeRange;
    const dateLabel = scenario.payload.dateKeys.join(', ');
    const overrides = scenario.payload.minCoverageOverrides ?? [];
    const overrideLabel = overrides
      .map(override => {
        const position = positionNameById.get(override.positionId) || override.positionId;
        return `${position} +${override.minCount}`;
      })
      .join(', ');
    return `${dateLabel} · ${range.startTime}–${range.endTime}${overrideLabel ? ` · ${overrideLabel}` : ''}`;
  }

  return scenario.payload.description;
};

export const summarizeViolations = (violations: ConstraintViolation[]) => {
  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const highest = violations.reduce<'low' | 'medium' | 'high' | null>((acc, violation) => {
    if (!acc) return violation.severity;
    return severityRank[violation.severity] > severityRank[acc] ? violation.severity : acc;
  }, null);
  return { total: violations.length, highestSeverity: highest };
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
