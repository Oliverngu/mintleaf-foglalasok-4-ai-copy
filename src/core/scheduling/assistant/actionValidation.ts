import type { EngineInput, SuggestionAction } from '../engine/types';

export type ActionIssue = {
  actionKey: string;
  message: string;
};

export const buildMoveShiftKey = (action: Extract<SuggestionAction, { type: 'moveShift' }>) =>
  [
    'moveShift',
    action.shiftId,
    action.userId,
    action.dateKey,
    action.newStartTime,
    action.newEndTime,
    action.positionId ?? '',
  ].join('|');

export const buildCreateShiftKey = (
  action: Extract<SuggestionAction, { type: 'createShift' }>
) =>
  [
    'createShift',
    action.userId,
    action.dateKey,
    action.startTime,
    action.endTime,
    action.positionId ?? '',
  ].join('|');

export const validateMoveShift = (
  input: EngineInput,
  action: Extract<SuggestionAction, { type: 'moveShift' }>
): ActionIssue[] => {
  const issues: ActionIssue[] = [];
  if (!action.shiftId) {
    issues.push({ actionKey: buildMoveShiftKey(action), message: 'Missing shiftId.' });
    return issues;
  }
  const shift = input.shifts.find(existing => existing.id === action.shiftId);
  if (!shift) {
    issues.push({
      actionKey: buildMoveShiftKey(action),
      message: `Shift ${action.shiftId} not found.`,
    });
  }
  if (!action.dateKey) {
    issues.push({
      actionKey: buildMoveShiftKey(action),
      message: 'Missing dateKey for moveShift action.',
    });
  }
  if (!action.newStartTime || !action.newEndTime) {
    issues.push({
      actionKey: buildMoveShiftKey(action),
      message: 'Missing start or end time for moveShift action.',
    });
  }
  return issues;
};

export const validateCreateShift = (
  action: Extract<SuggestionAction, { type: 'createShift' }>
): ActionIssue[] => {
  const issues: ActionIssue[] = [];
  if (!action.userId || !action.dateKey) {
    issues.push({
      actionKey: buildCreateShiftKey(action),
      message: 'Missing userId or dateKey for createShift action.',
    });
  }
  if (!action.startTime || !action.endTime) {
    issues.push({
      actionKey: buildCreateShiftKey(action),
      message: 'Missing start or end time for createShift action.',
    });
  }
  return issues;
};
