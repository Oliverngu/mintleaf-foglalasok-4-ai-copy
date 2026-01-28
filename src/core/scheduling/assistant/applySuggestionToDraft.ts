import { Timestamp } from 'firebase/firestore';
import type { Shift } from '../../models/data.js';
import type { Suggestion, SuggestionAction } from '../engine/types.js';

export type DraftSchedule = {
  shifts: Shift[];
};

const buildDateFromDateKeyTime = (dateKey: string, time: string): Date =>
  new Date(`${dateKey}T${time}:00`);

const buildShiftDateRange = (
  dateKey: string,
  startTime: string,
  endTime: string
): { start: Date; end: Date } => {
  const start = buildDateFromDateKeyTime(dateKey, startTime);
  const end = buildDateFromDateKeyTime(dateKey, endTime);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};

const applyMoveShift = (
  shifts: Shift[],
  action: Extract<SuggestionAction, { type: 'moveShift' }>
): Shift[] => {
  let found = false;
  const next = shifts.map(shift => {
    if (shift.id !== action.shiftId) return shift;
    found = true;
    const { start, end } = buildShiftDateRange(
      action.dateKey,
      action.newStartTime,
      action.newEndTime
    );
    return {
      ...shift,
      dayKey: action.dateKey,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      position: action.positionId ?? shift.position
    };
  });
  return found ? next : shifts;
};

const buildShiftFromCreateAction = (
  action: Extract<SuggestionAction, { type: 'createShift' }>,
  unitId?: string
): Shift => {
  const { start, end } = buildShiftDateRange(
    action.dateKey,
    action.startTime,
    action.endTime
  );
  return {
    id: `shift_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    userId: action.userId,
    userName: action.userId,
    unitId,
    position: action.positionId ?? 'N/A',
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    status: 'draft',
    isDayOff: false,
    dayKey: action.dateKey
  };
};

export const applySuggestionToDraft = (
  draft: DraftSchedule,
  suggestion: Suggestion
): DraftSchedule => {
  let nextShifts = [...draft.shifts];
  const fallbackUnitId = draft.shifts[0]?.unitId;

  suggestion.actions.forEach(action => {
    if (action.type === 'moveShift') {
      nextShifts = applyMoveShift(nextShifts, action);
      return;
    }
    if (action.type === 'createShift') {
      const createdShift = buildShiftFromCreateAction(action, fallbackUnitId);
      nextShifts = [...nextShifts, createdShift];
    }
  });

  return { shifts: nextShifts };
};
