import type { EngineInput, EngineResult, Suggestion } from '../engine/types.js';
import type { ActionIssue } from './actionValidation.js';
import { runEngine } from '../engine/runEngine.js';
import { applySuggestionActions } from './applySuggestionActions.js';
import { buildViolationAffectedKey } from '../engine/violationUtils.js';

type ViolationDelta = {
  resolvedViolations: string[];
  remainingViolations: string[];
  newViolations: string[];
};

export type AcceptSuggestionResult = {
  before: EngineResult;
  after: EngineResult;
  delta: ViolationDelta;
  appliedActionKeys: string[];
  rejectedActionKeys: string[];
  issues: ActionIssue[];
  decision: 'accepted' | 'partially-accepted' | 'rejected';
};

const diffViolations = (
  beforeViolations: EngineResult['violations'],
  afterViolations: EngineResult['violations']
): ViolationDelta => {
  const violationKey = (violation: EngineResult['violations'][number]) =>
    `${violation.constraintId}:${buildViolationAffectedKey(violation)}`;
  const beforeKeys = new Set<string>(beforeViolations.map(violationKey));
  const afterKeys = new Set<string>(afterViolations.map(violationKey));

  const resolvedViolations = Array.from(beforeKeys).filter(key => !afterKeys.has(key));
  const newViolations = Array.from(afterKeys).filter(key => !beforeKeys.has(key));
  const remainingViolations = Array.from(beforeKeys).filter(key => afterKeys.has(key));

  return {
    resolvedViolations: resolvedViolations.sort(),
    remainingViolations: remainingViolations.sort(),
    newViolations: newViolations.sort(),
  };
};

export const acceptSuggestion = (
  input: EngineInput,
  suggestion: Suggestion
): AcceptSuggestionResult => {
  const before = runEngine(input);
  const applyResult = applySuggestionActions(input, suggestion);

  if (applyResult.appliedActionKeys.length === 0) {
    return {
      before,
      after: before,
      delta: diffViolations(before.violations, before.violations),
      appliedActionKeys: applyResult.appliedActionKeys,
      rejectedActionKeys: applyResult.rejectedActionKeys,
      issues: applyResult.issues,
      decision: 'rejected',
    };
  }

  const nextInput: EngineInput = {
    ...input,
    shifts: applyResult.nextShifts,
  };

  const after = runEngine(nextInput);
  const delta = diffViolations(before.violations, after.violations);

  let decision: AcceptSuggestionResult['decision'] = 'partially-accepted';
  if (applyResult.appliedActionKeys.length > 0 && delta.resolvedViolations.length > 0) {
    decision = 'accepted';
  }

  return {
    before,
    after,
    delta,
    appliedActionKeys: applyResult.appliedActionKeys,
    rejectedActionKeys: applyResult.rejectedActionKeys,
    issues: applyResult.issues,
    decision,
  };
};

export { diffViolations };
