import type { EngineInput, EngineResult, Suggestion } from '../engine/types';
import type { ActionIssue } from './actionValidation';
import { runEngine } from '../engine/runEngine';
import { applySuggestionActions } from './applySuggestionActions';
import { buildViolationAffectedKey } from '../engine/violationUtils';

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
  const beforeKeys = new Set(beforeViolations.map(buildViolationAffectedKey));
  const afterKeys = new Set(afterViolations.map(buildViolationAffectedKey));

  const resolvedViolations = [...beforeKeys].filter(key => !afterKeys.has(key));
  const newViolations = [...afterKeys].filter(key => !beforeKeys.has(key));
  const remainingViolations = [...beforeKeys].filter(key => afterKeys.has(key));

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
