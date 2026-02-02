import type { EngineInput, EngineShift, Suggestion } from '../engine/types';
import {
  buildCreateShiftKey,
  buildMoveShiftKey,
  validateCreateShift,
  validateMoveShift,
} from './actionValidation';
import type { ActionIssue } from './actionValidation';

type ApplySuggestionResult = {
  nextShifts: EngineShift[];
  appliedActionKeys: string[];
  rejectedActionKeys: string[];
  issues: ActionIssue[];
};

const buildGeneratedShiftId = (shift: {
  userId: string;
  dateKey: string;
  startTime?: string | null;
  endTime?: string | null;
  positionId?: string;
}) =>
  [
    'gen',
    shift.userId,
    shift.dateKey,
    shift.startTime ?? '',
    shift.endTime ?? '',
    shift.positionId ?? '',
  ].join(':');

const sortShifts = (shifts: EngineShift[]) =>
  [...shifts].sort((a, b) => {
    const dateDiff = a.dateKey.localeCompare(b.dateKey);
    if (dateDiff !== 0) return dateDiff;
    const startDiff = (a.startTime ?? '').localeCompare(b.startTime ?? '');
    if (startDiff !== 0) return startDiff;
    const userDiff = a.userId.localeCompare(b.userId);
    if (userDiff !== 0) return userDiff;
    const positionDiff = (a.positionId ?? '').localeCompare(b.positionId ?? '');
    if (positionDiff !== 0) return positionDiff;
    return a.id.localeCompare(b.id);
  });

export const applySuggestionActions = (
  input: EngineInput,
  suggestion: Suggestion
): ApplySuggestionResult => {
  let nextShifts = [...input.shifts];
  const appliedActionKeys: string[] = [];
  const rejectedActionKeys: string[] = [];
  const issues: ActionIssue[] = [];

  suggestion.actions.forEach(action => {
    if (action.type === 'moveShift') {
      const actionKey = buildMoveShiftKey(action);
      const validationIssues = validateMoveShift(input, action);
      if (validationIssues.length > 0) {
        rejectedActionKeys.push(actionKey);
        issues.push(...validationIssues);
        return;
      }

      const updated = nextShifts.map(shift => {
        if (shift.id !== action.shiftId) return shift;
        return {
          ...shift,
          dateKey: action.dateKey,
          startTime: action.newStartTime,
          endTime: action.newEndTime,
          positionId: action.positionId ?? shift.positionId,
        };
      });

      nextShifts = updated;
      appliedActionKeys.push(actionKey);
      return;
    }

    const actionKey = buildCreateShiftKey(action);
    const validationIssues = validateCreateShift(action);
    if (validationIssues.length > 0) {
      rejectedActionKeys.push(actionKey);
      issues.push(...validationIssues);
      return;
    }

    const newShift: EngineShift = {
      id: buildGeneratedShiftId({
        userId: action.userId,
        dateKey: action.dateKey,
        startTime: action.startTime,
        endTime: action.endTime,
        positionId: action.positionId,
      }),
      userId: action.userId,
      unitId: input.unitId,
      dateKey: action.dateKey,
      startTime: action.startTime,
      endTime: action.endTime,
      positionId: action.positionId,
    };

    nextShifts = [...nextShifts, newShift];
    appliedActionKeys.push(actionKey);
  });

  return {
    nextShifts: sortShifts(nextShifts),
    appliedActionKeys,
    rejectedActionKeys,
    issues,
  };
};

export type { ApplySuggestionResult };
