import type { EngineInput, MinCoverageRule } from '../engine/types.js';
import type {
  Scenario,
  ScenarioTimeRange,
  MinCoverageOverride,
  SicknessScenarioPayload,
  EventScenarioPayload,
  PeakScenarioPayload
} from './types.js';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

const isValidDateKey = (value: string): boolean => DATE_KEY_REGEX.test(value);

const isValidTime = (value: string): boolean => TIME_REGEX.test(value);

const normalizeDateKeys = (dateKeys?: string[]): string[] =>
  (dateKeys ?? []).filter((dateKey, index, self) =>
    isValidDateKey(dateKey) && self.indexOf(dateKey) === index
  );

const resolveScenarioDateKeys = (scenario: Scenario, payloadDateKeys?: string[]): string[] => {
  const combined = payloadDateKeys ?? scenario.dateKeys ?? [];
  return normalizeDateKeys(combined);
};

const isValidTimeRange = (range?: ScenarioTimeRange): range is ScenarioTimeRange =>
  !!range && isValidTime(range.startTime) && isValidTime(range.endTime);

const normalizeOverrides = (overrides?: MinCoverageOverride[]): MinCoverageOverride[] =>
  (overrides ?? []).filter(override =>
    !!override.positionId && Number.isFinite(override.minCount) && override.minCount > 0
  );

const applySicknessScenario = (
  shifts: EngineInput['shifts'],
  payload: SicknessScenarioPayload,
  scenario: Scenario
): EngineInput['shifts'] => {
  const dateKeys = resolveScenarioDateKeys(scenario, payload.dateKeys);
  if (!payload.userId || dateKeys.length === 0) return shifts;
  const dateKeySet = new Set(dateKeys);
  return shifts.filter(shift =>
    !(shift.userId === payload.userId && dateKeySet.has(shift.dateKey))
  );
};

const buildCoverageRules = (
  scenario: Scenario,
  payload: EventScenarioPayload | PeakScenarioPayload
): MinCoverageRule[] => {
  const dateKeys = resolveScenarioDateKeys(scenario, payload.dateKeys);
  if (dateKeys.length === 0 || !isValidTimeRange(payload.timeRange)) return [];
  const overrides = normalizeOverrides(payload.minCoverageOverrides);
  if (overrides.length === 0) return [];

  return overrides.map(override => ({
    positionId: override.positionId,
    dateKeys,
    startTime: payload.timeRange.startTime,
    endTime: payload.timeRange.endTime,
    minCount: Math.floor(override.minCount),
  }));
};

const ruleMatchesScenario = (
  rule: MinCoverageRule,
  dateKey: string,
  scenarioRule: MinCoverageRule
): boolean => {
  const ruleDateKeys = rule.dateKeys ?? [];
  return (
    rule.positionId === scenarioRule.positionId &&
    rule.startTime === scenarioRule.startTime &&
    rule.endTime === scenarioRule.endTime &&
    ruleDateKeys.includes(dateKey)
  );
};

const shouldInheritRule = (
  existingRules: MinCoverageRule[],
  scenarioRule: MinCoverageRule
): boolean => {
  const dateKeys = scenarioRule.dateKeys ?? [];
  if (dateKeys.length === 0) return false;
  return dateKeys.every(
    dateKey => !existingRules.some(rule => ruleMatchesScenario(rule, dateKey, scenarioRule))
  );
};

export type ScenarioEffects = {
  removedShiftsCount: number;
  addedRulesCount: number;
  overriddenRulesCount: number;
};

export const applyScenariosToEngineInputWithEffects = (
  input: EngineInput
): { adjustedInput: EngineInput; effects: ScenarioEffects } => {
  const scenarios = input.scenarios ?? [];
  if (scenarios.length === 0) {
    return {
      adjustedInput: input,
      effects: { removedShiftsCount: 0, addedRulesCount: 0, overriddenRulesCount: 0 }
    };
  }

  let nextShifts = input.shifts;
  let currentRules = input.ruleset.minCoverageByPosition ?? [];
  let addedRulesCount = 0;
  let overriddenRulesCount = 0;

  scenarios.forEach(scenario => {
    switch (scenario.type) {
      case 'SICKNESS':
        nextShifts = applySicknessScenario(nextShifts, scenario.payload, scenario);
        break;
      case 'EVENT':
      case 'PEAK': {
        const rules = buildCoverageRules(scenario, scenario.payload);
        if (rules.length > 0) {
          const inheritMode = scenario.inheritMode ?? 'ADD';
          if (inheritMode === 'ADD') {
            currentRules = currentRules.concat(rules);
            addedRulesCount += rules.length;
          } else if (inheritMode === 'OVERRIDE') {
            rules.forEach(rule => {
              const dateKeys = rule.dateKeys ?? [];
              let updatedRules = currentRules;
              dateKeys.forEach(dateKey => {
                const nextRules = updatedRules.filter(
                  existingRule => !ruleMatchesScenario(existingRule, dateKey, rule)
                );
                // P0 NOTE: overriddenRulesCount can overcount when a rule spans multiple dateKeys;
                // de-duplication is intentionally deferred to a later phase (P1+).
                overriddenRulesCount += updatedRules.length - nextRules.length;
                updatedRules = nextRules;
              });
              currentRules = updatedRules.concat(rule);
              addedRulesCount += 1;
            });
          } else if (inheritMode === 'INHERIT_IF_EMPTY') {
            rules.forEach(rule => {
              if (shouldInheritRule(currentRules, rule)) {
                currentRules = currentRules.concat(rule);
                addedRulesCount += 1;
              }
            });
          }
        }
        break;
      }
      case 'LAST_MINUTE':
      default:
        break;
    }
  });

  if (currentRules === (input.ruleset.minCoverageByPosition ?? []) && nextShifts === input.shifts) {
    return {
      adjustedInput: input,
      effects: { removedShiftsCount: 0, addedRulesCount: 0, overriddenRulesCount: 0 }
    };
  }

  const adjustedInput = {
    ...input,
    shifts: nextShifts,
    ruleset: {
      ...input.ruleset,
      minCoverageByPosition: currentRules
    }
  };

  return {
    adjustedInput,
    effects: {
      removedShiftsCount: Math.max(0, input.shifts.length - nextShifts.length),
      addedRulesCount,
      overriddenRulesCount
    }
  };
};

export const applyScenariosToEngineInput = (input: EngineInput): EngineInput =>
  applyScenariosToEngineInputWithEffects(input).adjustedInput;

export const computeScenarioEffects = (
  originalInput: EngineInput,
  adjustedInput: EngineInput,
  overrides?: Partial<ScenarioEffects>
): ScenarioEffects => {
  const originalShiftCount = originalInput.shifts.length;
  const adjustedShiftCount = adjustedInput.shifts.length;
  const originalRulesCount = originalInput.ruleset.minCoverageByPosition?.length ?? 0;
  const adjustedRulesCount = adjustedInput.ruleset.minCoverageByPosition?.length ?? 0;

  return {
    removedShiftsCount:
      overrides?.removedShiftsCount ?? Math.max(0, originalShiftCount - adjustedShiftCount),
    addedRulesCount:
      overrides?.addedRulesCount ?? Math.max(0, adjustedRulesCount - originalRulesCount),
    overriddenRulesCount: overrides?.overriddenRulesCount ?? 0,
  };
};
