import { Timestamp } from 'firebase/firestore';
import {
  Suggestion,
  SuggestionAction
} from '../../../core/scheduling/engine/types';
import { Shift, User, Position } from '../../../core/models/data';

export type SuggestionPatch = {
  type: 'moveShift' | 'createShift';
  shiftId: string;
  before?: Shift;
  after?: Shift;
  createdShift?: Shift;
};

export type AppliedSuggestion = {
  key: string;
  appliedAt: number;
  patches: SuggestionPatch[];
};

export type UndoStackItem = {
  patches: SuggestionPatch[];
  key: string;
  appliedAt: number;
};

export type ApplyContext = {
  unitId: string;
  users: User[];
  positions: Position[];
};

const buildDateFromDateKeyTime = (dateKey: string, time: string): Date =>
  new Date(`${dateKey}T${time}:00`);

const resolvePositionName = (
  positionId: string | undefined,
  positions: Position[]
): string | undefined => {
  if (!positionId) return undefined;
  return positions.find(position => position.id === positionId)?.name || positionId;
};

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

export const computeSuggestionKey = (suggestion: Suggestion): string => {
  const action = suggestion.actions[0];
  if (!action) return '';
  if (action.type === 'moveShift') {
    return `move:${action.shiftId}:${action.dateKey}:${action.newStartTime}-${action.newEndTime}`;
  }
  return `add:${action.userId}:${action.dateKey}:${action.startTime}-${action.endTime}:${action.positionId ?? ''}`;
};

const buildShiftFromCreateAction = (
  action: Extract<SuggestionAction, { type: 'createShift' }>,
  context: ApplyContext
): Shift => {
  const { start, end } = buildShiftDateRange(
    action.dateKey,
    action.startTime,
    action.endTime
  );
  const user = context.users.find(u => u.id === action.userId);
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: action.userId,
    userName: user?.fullName || 'Ismeretlen',
    unitId: context.unitId,
    position: resolvePositionName(action.positionId, context.positions) || 'N/A',
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    status: 'draft',
    isDayOff: false,
    dayKey: action.dateKey
  };
};

const applyMoveShift = (
  schedule: Shift[],
  action: Extract<SuggestionAction, { type: 'moveShift' }>,
  context: ApplyContext
): { nextSchedule: Shift[]; patches: SuggestionPatch[] } => {
  let patches: SuggestionPatch[] = [];
  const nextSchedule = schedule.map(shift => {
    if (shift.id !== action.shiftId) return shift;
    const { start, end } = buildShiftDateRange(
      action.dateKey,
      action.newStartTime,
      action.newEndTime
    );
    const updated: Shift = {
      ...shift,
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      position: action.positionId
        ? resolvePositionName(action.positionId, context.positions)
        : shift.position
    };
    patches = [
      {
        type: 'moveShift',
        shiftId: shift.id,
        before: shift,
        after: updated
      }
    ];
    return updated;
  });

  return { nextSchedule, patches };
};

const applyCreateShift = (
  schedule: Shift[],
  action: Extract<SuggestionAction, { type: 'createShift' }>,
  context: ApplyContext
): { nextSchedule: Shift[]; patches: SuggestionPatch[] } => {
  const createdShift = buildShiftFromCreateAction(action, context);
  return {
    nextSchedule: [...schedule, createdShift],
    patches: [
      {
        type: 'createShift',
        shiftId: createdShift.id,
        createdShift
      }
    ]
  };
};

export const applySuggestionToSchedule = (
  schedule: Shift[],
  suggestion: Suggestion,
  context: ApplyContext
): { nextSchedule: Shift[]; patches: SuggestionPatch[] } => {
  let nextSchedule = [...schedule];
  const patches: SuggestionPatch[] = [];

  suggestion.actions.forEach(action => {
    if (action.type === 'moveShift') {
      const result = applyMoveShift(nextSchedule, action, context);
      nextSchedule = result.nextSchedule;
      patches.push(...result.patches);
      return;
    }
    if (action.type === 'createShift') {
      const result = applyCreateShift(nextSchedule, action, context);
      nextSchedule = result.nextSchedule;
      patches.push(...result.patches);
    }
  });

  return { nextSchedule, patches };
};

export const undoPatches = (
  schedule: Shift[],
  patches: SuggestionPatch[]
): Shift[] => {
  let nextSchedule = [...schedule];

  [...patches].reverse().forEach(patch => {
    if (patch.type === 'moveShift' && patch.before) {
      nextSchedule = nextSchedule.map(shift =>
        shift.id === patch.shiftId ? patch.before! : shift
      );
    }
    if (patch.type === 'createShift') {
      nextSchedule = nextSchedule.filter(shift => shift.id !== patch.shiftId);
    }
  });

  return nextSchedule;
};
