import { computeCapacity } from './computeCapacity.js';
import { evaluateConstraints } from './evaluateConstraints.js';
import { generateSuggestions } from './generateSuggestions.js';
import { EngineInput, EngineResult } from './types.js';
import {
  applyScenariosToEngineInputWithEffects,
  computeScenarioEffects
} from '../scenarios/applyScenarios.js';

/**
 * runEngine
 *
 * V1 usage:
 * const result = runEngine(input);
 * console.log(result.violations, result.suggestions);
 *
 * The engine is UI-agnostic: pass normalized week data (date keys, shifts, users)
 * and schedule settings to calculate capacity, constraints, and suggestions.
 */
export const runEngine = (input: EngineInput): EngineResult => {
  const trace: string[] = [];
  const { adjustedInput, effects } = applyScenariosToEngineInputWithEffects(input);
  const scenarioEffects = computeScenarioEffects(input, adjustedInput, effects);
  trace.push('computeCapacity');
  const { capacityMap } = computeCapacity(adjustedInput);

  trace.push('evaluateConstraints');
  const violations = evaluateConstraints(adjustedInput, capacityMap);

  trace.push('generateSuggestions');
  const suggestions = generateSuggestions(adjustedInput, capacityMap, violations);

  return {
    capacityMap,
    violations,
    suggestions,
    scenarioEffects,
    explanation: {
      trace
    }
  };
};
