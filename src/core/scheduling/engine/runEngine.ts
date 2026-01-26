import { computeCapacity } from './computeCapacity';
import { evaluateConstraints } from './evaluateConstraints';
import { generateSuggestions } from './generateSuggestions';
import { EngineInput, EngineResult } from './types';

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
  trace.push('computeCapacity');
  const { capacityMap } = computeCapacity(input);

  trace.push('evaluateConstraints');
  const violations = evaluateConstraints(input, capacityMap);

  trace.push('generateSuggestions');
  const suggestions = generateSuggestions(input, capacityMap, violations);

  return {
    capacityMap,
    violations,
    suggestions,
    explanation: {
      trace
    }
  };
};
