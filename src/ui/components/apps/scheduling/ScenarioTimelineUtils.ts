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

export type ViolationRef = {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  rawIndex: number;
};

export type SuggestionRef = {
  key: string;
  label: string;
  type: Suggestion['type'];
  rawIndex: number;
};

export const SCENARIO_TYPE_PRIORITY: Record<Scenario['type'], number> = {
  SICKNESS: 1,
  EVENT: 2,
  PEAK: 3,
  LAST_MINUTE: 4
};

const TIME_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /\d{4}-\d{2}-\d{2}/;

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

const extractDateFromSlots = (slots?: string[]): string | undefined => {
  if (!slots) return undefined;
  const hit = slots.find(slot => DATE_REGEX.test(slot));
  return hit ? hit.match(DATE_REGEX)?.[0] : undefined;
};

const extractTimeRangeFromSlot = (
  slot?: string
): { startTime: string; endTime: string } | undefined => {
  if (!slot) return undefined;
  const matches = slot.match(/\d{2}:\d{2}/g);
  if (!matches || matches.length < 2) return undefined;
  const [startTime, endTime] = matches;
  return { startTime, endTime };
};

const getSuggestionActionRange = (
  action: SuggestionAction
): { startTime: string; endTime: string } | undefined => {
  if (action.type === 'moveShift') {
    return { startTime: action.newStartTime, endTime: action.newEndTime };
  }
  if (action.type === 'createShift') {
    return { startTime: action.startTime, endTime: action.endTime };
  }
  return undefined;
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

const getScenarioDateKeys = (scenario: Scenario): string[] => {
  const baseKeys = scenario.dateKeys ?? [];
  if ('dateKeys' in scenario.payload) {
    return Array.from(new Set([...baseKeys, ...(scenario.payload.dateKeys ?? [])]));
  }
  return baseKeys;
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
    const typeLabel = scenario.type === 'EVENT' ? 'Esemény' : 'Csúcsidőszak';
    const metaBits = [dateLabel, timeLabel, overrideLabel].filter(Boolean);
    descriptionLine = [typeLabel, ...metaBits].join(' · ');
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

export const getScenarioFocusTimeOptions = (
  scenarios: Scenario[],
  dateKey: string
): FocusTimeOption[] => {
  const options = new Map<string, FocusTimeOption>();
  options.set('ALL_DAY', { key: 'ALL_DAY', label: 'Egész nap' });
  scenarios.forEach(scenario => {
    if (scenario.type !== 'EVENT' && scenario.type !== 'PEAK') return;
    const dateKeys = getScenarioDateKeys(scenario);
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

export const buildViolationKey = (violation: ConstraintViolation): string => {
  const parts = [
    violation.constraintId,
    violation.severity,
    violation.affected.positionId ?? '',
    violation.affected.dateKeys?.[0] ?? extractDateFromSlots(violation.affected.slots) ?? '',
    violation.affected.slots?.[0] ?? ''
  ];
  return parts.filter(Boolean).join('|');
};

export const buildSuggestionKey = (suggestion: Suggestion): string => {
  const action = suggestion.actions[0];
  if (!action) return suggestion.type;
  const timeRange = getSuggestionActionRange(action);
  const parts = [
    suggestion.type,
    action.type,
    action.userId,
    action.dateKey,
    action.positionId ?? '',
    timeRange ? `${timeRange.startTime}-${timeRange.endTime}` : ''
  ];
  return parts.filter(Boolean).join('|');
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

export const summarizeSuggestionLabel = (
  suggestion: Suggestion,
  userNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
): string => {
  const action = suggestion.actions[0];
  if (action) {
    return formatSuggestionActionLabel(action, userNameById, positionNameById);
  }
  return suggestion.type === 'SHIFT_MOVE_SUGGESTION' ? 'Átmozgatás' : 'Új műszak';
};

export const labelViolationCompact = (
  violation: ConstraintViolation,
  positionNameById?: Map<string, string>
): string => {
  const label = labelViolation(violation);
  const detail = getViolationDetail(violation, positionNameById);
  const dateLabel = violation.affected.dateKeys?.[0] ?? extractDateFromSlots(violation.affected.slots);
  const slotLabel = violation.affected.slots?.[0];
  return [label, detail, dateLabel, slotLabel].filter(Boolean).join(' · ');
};

export const buildSuggestionViolationLinks = (
  violations: ConstraintViolation[],
  suggestions: Suggestion[],
  userNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
) => {
  const violationsByKey = new Map<string, ViolationRef>();
  const suggestionsByKey = new Map<string, SuggestionRef>();
  const violationToSuggestions = new Map<string, string[]>();
  const suggestionToViolations = new Map<string, string[]>();

  const suggestionRefs = suggestions.map((suggestion, index) => {
    const key = buildSuggestionKey(suggestion);
    const label = summarizeSuggestionLabel(suggestion, userNameById, positionNameById);
    const ref: SuggestionRef = {
      key,
      label,
      type: suggestion.type,
      rawIndex: index
    };
    suggestionsByKey.set(key, ref);
    return { suggestion, ref };
  });

  const violationRefs = violations.map((violation, index) => {
    const key = buildViolationKey(violation);
    const label = labelViolationCompact(violation, positionNameById);
    const ref: ViolationRef = {
      key,
      label,
      severity: violation.severity,
      rawIndex: index
    };
    violationsByKey.set(key, ref);
    return { violation, ref };
  });

  violationRefs.forEach(({ violation, ref }) => {
    const scored = suggestionRefs
      .map(({ suggestion, ref: suggestionRef }) => {
        const violationDate =
          violation.affected.dateKeys?.[0] ?? extractDateFromSlots(violation.affected.slots);
        const violationPosition = violation.affected.positionId;
        const violationSlotRange = extractTimeRangeFromSlot(violation.affected.slots?.[0]);

        let dateMatch = false;
        let positionMatch = false;
        let timeMatch = false;

        suggestion.actions.forEach(action => {
          if (violationDate && action.dateKey === violationDate) {
            dateMatch = true;
          }
          if (violationPosition && action.positionId === violationPosition) {
            positionMatch = true;
          }
          if (violationSlotRange) {
            const actionRange = getSuggestionActionRange(action);
            if (actionRange) {
              timeMatch =
                timeMatch ||
                rangesOverlap(
                  actionRange.startTime,
                  actionRange.endTime,
                  violationSlotRange.startTime,
                  violationSlotRange.endTime
                );
            }
          }
        });

        let score = 0;
        if (dateMatch) score += 3;
        if (positionMatch) score += 2;
        if (timeMatch) score += 1;

        const meetsThreshold =
          score >= 3 || (dateMatch && suggestion.type === 'ADD_SHIFT_SUGGESTION');

        return meetsThreshold ? { key: suggestionRef.key, score } : null;
      })
      .filter((entry): entry is { key: string; score: number } => entry !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.key.localeCompare(b.key);
      })
      .slice(0, 3);

    const suggestionKeys = scored.map(entry => entry.key);
    violationToSuggestions.set(ref.key, suggestionKeys);
    suggestionKeys.forEach(key => {
      const existing = suggestionToViolations.get(key) ?? [];
      suggestionToViolations.set(key, [...existing, ref.key]);
    });
  });

  suggestionToViolations.forEach((keys, suggestionKey) => {
    const unique = Array.from(new Set(keys));
    suggestionToViolations.set(suggestionKey, unique);
  });

  return {
    violationsByKey,
    suggestionsByKey,
    violationToSuggestions,
    suggestionToViolations
  };
};

export const filterSuggestionViolationLinksByFocus = (
  links: {
    violationsByKey: Map<string, ViolationRef>;
    suggestionsByKey: Map<string, SuggestionRef>;
    violationToSuggestions: Map<string, string[]>;
    suggestionToViolations: Map<string, string[]>;
  },
  focus: FocusWindow,
  violations: ConstraintViolation[],
  suggestions: Suggestion[]
) => {
  const violationByKey = new Map<string, ConstraintViolation>();
  violations.forEach(violation => {
    violationByKey.set(buildViolationKey(violation), violation);
  });
  const suggestionByKey = new Map<string, Suggestion>();
  suggestions.forEach(suggestion => {
    suggestionByKey.set(buildSuggestionKey(suggestion), suggestion);
  });

  const nextViolationToSuggestions = new Map<string, string[]>();
  const nextSuggestionToViolations = new Map<string, string[]>();

  const isViolationInFocus = (violation: ConstraintViolation): boolean => {
    const dateKey =
      violation.affected.dateKeys?.[0] ?? extractDateFromSlots(violation.affected.slots);
    if (dateKey !== focus.dateKey) return false;
    if (!focus.timeRange) return true;
    const slotRange = extractTimeRangeFromSlot(violation.affected.slots?.[0]);
    if (!slotRange) return true;
    return rangesOverlap(
      slotRange.startTime,
      slotRange.endTime,
      focus.timeRange.startTime,
      focus.timeRange.endTime
    );
  };

  const isSuggestionInFocus = (suggestion: Suggestion): boolean => {
    return suggestion.actions.some(action => {
      if (action.dateKey !== focus.dateKey) return false;
      if (!focus.timeRange) return true;
      const actionRange = getSuggestionActionRange(action);
      if (!actionRange) return true;
      return rangesOverlap(
        actionRange.startTime,
        actionRange.endTime,
        focus.timeRange.startTime,
        focus.timeRange.endTime
      );
    });
  };

  links.violationToSuggestions.forEach((suggestionKeys, violationKey) => {
    const violation = violationByKey.get(violationKey);
    if (!violation || !isViolationInFocus(violation)) return;
    const filteredSuggestions = suggestionKeys.filter(suggestionKey => {
      const suggestion = suggestionByKey.get(suggestionKey);
      return suggestion ? isSuggestionInFocus(suggestion) : false;
    });
    nextViolationToSuggestions.set(violationKey, filteredSuggestions);
    filteredSuggestions.forEach(suggestionKey => {
      const existing = nextSuggestionToViolations.get(suggestionKey) ?? [];
      nextSuggestionToViolations.set(suggestionKey, [...existing, violationKey]);
    });
  });

  nextSuggestionToViolations.forEach((violationKeys, suggestionKey) => {
    const unique = Array.from(new Set(violationKeys));
    nextSuggestionToViolations.set(suggestionKey, unique);
  });

  return {
    violationsByKey: links.violationsByKey,
    suggestionsByKey: links.suggestionsByKey,
    violationToSuggestions: nextViolationToSuggestions,
    suggestionToViolations: nextSuggestionToViolations
  };
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
