import {
  CapacityMap,
  ConstraintViolation,
  EngineInput,
  EngineShift,
  Suggestion
} from './types.js';
import {
  addMinutes,
  combineDateAndTime,
  diffHours,
  formatDateKey,
  startOfNextDay,
  toTimeString
} from './timeUtils.js';
import { MIN_COVERAGE_BY_POSITION_ID } from '../rules/constraints/minCoverageByPosition.js';
import { MAX_HOURS_PER_DAY_ID } from '../rules/constraints/maxHoursPerDay.js';
import { MIN_REST_HOURS_BETWEEN_SHIFTS_ID } from '../rules/constraints/minRestHoursBetweenShifts.js';
import { getShiftTimeRange } from './computeCapacity.js';

const parseSlotKey = (slotKey: string): { dateKey: string; time: string } => {
  const [dateKey, time] = slotKey.split('T');
  return { dateKey, time };
};

const rangesOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;

const splitRangeByDay = (start: Date, end: Date): Map<string, number> => {
  const map = new Map<string, number>();
  let cursor = new Date(start);
  while (cursor < end) {
    const nextDayStart = startOfNextDay(cursor);
    const segmentEnd = nextDayStart < end ? nextDayStart : end;
    const dateKey = formatDateKey(cursor);
    map.set(dateKey, (map.get(dateKey) || 0) + diffHours(cursor, segmentEnd));
    cursor = segmentEnd;
  }
  return map;
};

const calculateUserHoursForDate = (
  userId: string,
  dateKey: string,
  shifts: EngineShift[],
  input: EngineInput
): number => {
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  return shifts.reduce((total, shift) => {
    if (shift.userId !== userId || shift.isDayOff) return total;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return total;
    const range = getShiftTimeRange(shift, input, dayIndex);
    if (!range) return total;
    const hoursByDay = splitRangeByDay(range.start, range.end);
    return total + (hoursByDay.get(dateKey) || 0);
  }, 0);
};

const wouldExceedMaxHours = (
  userId: string,
  dateKey: string,
  shifts: EngineShift[],
  input: EngineInput,
  proposedShift: EngineShift
): boolean => {
  const rule = input.ruleset.maxHoursPerDay;
  if (!rule) return false;

  const existingHours = calculateUserHoursForDate(userId, dateKey, shifts, input);
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );
  const dayIndex = dayIndexMap.get(proposedShift.dateKey);
  if (dayIndex === undefined) return false;
  const proposedRange = getShiftTimeRange(proposedShift, input, dayIndex);
  if (!proposedRange) return false;
  const hoursByDay = splitRangeByDay(proposedRange.start, proposedRange.end);
  const proposedHours = hoursByDay.get(dateKey) || 0;

  return existingHours + proposedHours > rule.maxHoursPerDay;
};

const wouldBreakMinRest = (
  userId: string,
  shifts: EngineShift[],
  input: EngineInput,
  proposedShift: EngineShift,
  ignoreShiftId?: string
): boolean => {
  const rule = input.ruleset.minRestHoursBetweenShifts;
  if (!rule) return false;

  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  const ranges = shifts
    .filter(shift => shift.userId === userId && !shift.isDayOff)
    .filter(shift => shift.id !== ignoreShiftId)
    .map(shift => {
      const dayIndex = dayIndexMap.get(shift.dateKey);
      if (dayIndex === undefined) return null;
      const range = getShiftTimeRange(shift, input, dayIndex);
      return range ? { id: shift.id, start: range.start, end: range.end } : null;
    })
    .filter(
      (range): range is { id: string; start: Date; end: Date } => range !== null
    );

  const proposedDayIndex = dayIndexMap.get(proposedShift.dateKey);
  if (proposedDayIndex === undefined) return false;
  const proposedRange = getShiftTimeRange(proposedShift, input, proposedDayIndex);
  if (!proposedRange) return false;

  ranges.push({ id: proposedShift.id, start: proposedRange.start, end: proposedRange.end });
  ranges.sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let i = 0; i < ranges.length - 1; i += 1) {
    const current = ranges[i];
    const next = ranges[i + 1];
    const restHours = diffHours(current.end, next.start);
    if (restHours < rule.minRestHours) {
      return true;
    }
  }

  return false;
};

const isUserAvailableForSlot = (
  userId: string,
  slotStart: Date,
  slotEnd: Date,
  shifts: EngineShift[],
  input: EngineInput,
  ignoreShiftId?: string
): boolean => {
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  return !shifts.some(shift => {
    if (shift.userId !== userId || shift.isDayOff) return false;
    if (ignoreShiftId && shift.id === ignoreShiftId) return false;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return false;
    const range = getShiftTimeRange(shift, input, dayIndex);
    if (!range) return false;
    return rangesOverlap(range.start, range.end, slotStart, slotEnd);
  });
};

const isUserAvailableForRange = (
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  shifts: EngineShift[],
  input: EngineInput,
  ignoreShiftId?: string
): boolean => {
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  return !shifts.some(shift => {
    if (shift.userId !== userId || shift.isDayOff) return false;
    if (ignoreShiftId && shift.id === ignoreShiftId) return false;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return false;
    const range = getShiftTimeRange(shift, input, dayIndex);
    if (!range) return false;
    return rangesOverlap(range.start, range.end, rangeStart, rangeEnd);
  });
};

const hasDayOff = (userId: string, dateKey: string, shifts: EngineShift[]) =>
  shifts.some(
    shift => shift.userId === userId && shift.dateKey === dateKey && shift.isDayOff
  );

const canUseUserForSlot = (
  userId: string,
  slotDateKey: string,
  slotStart: Date,
  slotEnd: Date,
  shifts: EngineShift[],
  input: EngineInput,
  proposedShift: EngineShift
): boolean => {
  if (hasDayOff(userId, slotDateKey, shifts)) return false;
  if (!isUserAvailableForSlot(userId, slotStart, slotEnd, shifts, input)) return false;
  if (wouldExceedMaxHours(userId, slotDateKey, shifts, input, proposedShift)) return false;
  if (wouldBreakMinRest(userId, shifts, input, proposedShift)) return false;
  return true;
};

const buildMoveSuggestion = (
  violation: ConstraintViolation,
  input: EngineInput,
  shifts: EngineShift[],
  bucketMinutes: number
): Suggestion | null => {
  const positionId = violation.affected.positionId;
  if (!positionId || !violation.affected.slots?.length) return null;

  const slotKey = violation.affected.slots[0];
  const { dateKey, time } = parseSlotKey(slotKey);
  const slotStart = combineDateAndTime(dateKey, time);
  const slotEnd = addMinutes(slotStart, bucketMinutes);

  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );
  const candidateShift = shifts.find(shift => {
    if (shift.isDayOff) return false;
    if (shift.positionId !== positionId) return false;
    if (shift.dateKey !== dateKey) return false;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return false;
    const range = getShiftTimeRange(shift, input, dayIndex);
    if (!range) return false;
    if (rangesOverlap(range.start, range.end, slotStart, slotEnd)) return false;
    return isUserAvailableForRange(
      shift.userId,
      slotStart,
      slotEnd,
      shifts,
      input,
      shift.id
    );
  });

  if (!candidateShift) return null;

  const dayIndex = dayIndexMap.get(candidateShift.dateKey);
  if (dayIndex === undefined) return null;
  const currentRange = getShiftTimeRange(candidateShift, input, dayIndex);
  if (!currentRange) return null;
  const coversSlot =
    currentRange.start <= slotStart && currentRange.end >= slotEnd;
  if (coversSlot) return null;

  const proposedStart = slotStart;
  const proposedEnd = slotEnd;

  const proposedShift: EngineShift = {
    ...candidateShift,
    dateKey,
    startTime: toTimeString(proposedStart),
    endTime: toTimeString(proposedEnd)
  };

  if (
    !isUserAvailableForRange(
      candidateShift.userId,
      proposedStart,
      proposedEnd,
      shifts,
      input,
      candidateShift.id
    )
  ) {
    return null;
  }

  if (wouldExceedMaxHours(candidateShift.userId, dateKey, shifts, input, proposedShift)) {
    return null;
  }
  if (wouldBreakMinRest(candidateShift.userId, shifts, input, proposedShift, candidateShift.id)) {
    return null;
  }

  return {
    type: 'SHIFT_MOVE_SUGGESTION',
    actions: [
      {
        type: 'moveShift',
        shiftId: candidateShift.id,
        userId: candidateShift.userId,
        dateKey,
        newStartTime: toTimeString(proposedStart),
        newEndTime: toTimeString(proposedEnd),
        positionId
      }
    ],
    expectedImpact: 'A hiányzó lefedettség pótlása a műszak időablakának módosításával.',
    explanation: 'A műszak időablaka igazítható úgy, hogy lefedje a hiányos idősávot.'
  };
};

const buildAddShiftSuggestion = (
  violation: ConstraintViolation,
  input: EngineInput,
  shifts: EngineShift[],
  bucketMinutes: number
): Suggestion | null => {
  const positionId = violation.affected.positionId;
  if (!positionId || !violation.affected.slots?.length) return null;

  const slotKey = violation.affected.slots[0];
  const { dateKey, time } = parseSlotKey(slotKey);
  const slotStart = combineDateAndTime(dateKey, time);
  const slotEnd = addMinutes(slotStart, bucketMinutes);

  const candidateUser = input.users.find(user => {
    if (user.isActive === false) return false;
    if (user.unitIds && !user.unitIds.includes(input.unitId)) return false;

    const proposedShift: EngineShift = {
      id: `suggested-${user.id}-${slotKey}`,
      userId: user.id,
      dateKey,
      startTime: time,
      endTime: toTimeString(slotEnd),
      positionId
    };

    return canUseUserForSlot(
      user.id,
      dateKey,
      slotStart,
      slotEnd,
      shifts,
      input,
      proposedShift
    );
  });

  if (!candidateUser) return null;

  return {
    type: 'ADD_SHIFT_SUGGESTION',
    actions: [
      {
        type: 'createShift',
        userId: candidateUser.id,
        dateKey,
        startTime: time,
        endTime: toTimeString(slotEnd),
        positionId
      }
    ],
    expectedImpact: 'Új műszak létrehozása a hiányos lefedettséghez.',
    explanation: 'A kiválasztott munkatárs szabad és nem sért pihenő vagy óraszabályt.'
  };
};

export const generateSuggestions = (
  input: EngineInput,
  capacityMap: CapacityMap,
  violations: ConstraintViolation[]
): Suggestion[] => {
  const bucketMinutes = input.ruleset.bucketMinutes ?? 60;
  const minCoverageViolations = violations.filter(
    violation => violation.constraintId === MIN_COVERAGE_BY_POSITION_ID
  );

  if (minCoverageViolations.length === 0) return [];

  const suggestionCandidates: Array<{
    suggestion: Suggestion;
    violation: ConstraintViolation;
    slotKey: string;
  }> = [];

  minCoverageViolations.forEach(violation => {
    const slotKey = violation.affected.slots?.[0] || '';
    const moveSuggestion = buildMoveSuggestion(
      violation,
      input,
      input.shifts,
      bucketMinutes
    );
    if (moveSuggestion) {
      suggestionCandidates.push({
        suggestion: moveSuggestion,
        violation,
        slotKey
      });
      return;
    }

    const addSuggestion = buildAddShiftSuggestion(
      violation,
      input,
      input.shifts,
      bucketMinutes
    );
    if (addSuggestion) {
      suggestionCandidates.push({
        suggestion: addSuggestion,
        violation,
        slotKey
      });
    }
  });

  const severityRank: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1
  };
  const typeRank: Record<Suggestion['type'], number> = {
    SHIFT_MOVE_SUGGESTION: 2,
    ADD_SHIFT_SUGGESTION: 1
  };

  const sorted = suggestionCandidates.sort((a, b) => {
    const severityDiff =
      (severityRank[b.violation.severity] || 0) -
      (severityRank[a.violation.severity] || 0);
    if (severityDiff !== 0) return severityDiff;

    const typeDiff =
      typeRank[b.suggestion.type] - typeRank[a.suggestion.type];
    if (typeDiff !== 0) return typeDiff;

    return a.slotKey.localeCompare(b.slotKey);
  });

  const deduped: Suggestion[] = [];
  const seenKeys = new Set<string>();

  sorted.forEach(({ suggestion }) => {
    const action = suggestion.actions[0];
    if (!action) return;
    let key = '';
    if (action.type === 'moveShift') {
      key = `move:${action.shiftId}:${action.dateKey}:${action.newStartTime}-${action.newEndTime}`;
    } else {
      key = `add:${action.userId}:${action.dateKey}:${action.startTime}-${action.endTime}:${action.positionId ?? ''}`;
    }
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    deduped.push(suggestion);
  });

  return deduped;
};
