import {
  CapacityMap,
  EngineInput,
  EngineShift,
  ShiftTimeRange
} from './types';
import {
  addMinutes,
  combineDateAndTime,
  DEFAULT_CLOSING_OFFSET_MINUTES,
  DEFAULT_CLOSING_TIME,
  getSlotKey,
  normalizeBucketMinutes
} from './timeUtils';

export const UNKNOWN_POSITION_ID = 'unknown';

const resolveShiftTimeRange = (
  shift: EngineShift,
  input: EngineInput,
  dayIndex: number
): ShiftTimeRange | null => {
  if (!shift.startTime) return null;

  const start = combineDateAndTime(shift.dateKey, shift.startTime);
  let end: Date | null = null;

  if (shift.endTime) {
    end = combineDateAndTime(shift.dateKey, shift.endTime);
  } else {
    const dailySettings = input.scheduleSettings.dailySettings[dayIndex];
    const closingTime =
      dailySettings?.closingTime ||
      input.scheduleSettings.defaultClosingTime ||
      DEFAULT_CLOSING_TIME;
    const closingOffsetMinutes =
      dailySettings?.closingOffsetMinutes ??
      input.scheduleSettings.defaultClosingOffsetMinutes ??
      DEFAULT_CLOSING_OFFSET_MINUTES;
    end = combineDateAndTime(shift.dateKey, closingTime);
    if (closingOffsetMinutes) {
      end = addMinutes(end, closingOffsetMinutes);
    }
  }

  if (!end) return null;

  if (end <= start) {
    end = addMinutes(end, 24 * 60);
  }

  return {
    start,
    end,
    dateKey: shift.dateKey
  };
};

export const computeCapacity = (
  input: EngineInput
): {
  capacityMap: CapacityMap;
  shiftTimeRanges: Map<string, ShiftTimeRange>;
} => {
  const capacityMap: CapacityMap = {};
  const shiftTimeRanges = new Map<string, ShiftTimeRange>();
  const bucketMinutes = normalizeBucketMinutes(input.ruleset.bucketMinutes);
  const dayIndexMap = new Map(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  const sortedShifts = [...input.shifts].sort((a, b) => {
    const dateCompare = a.dateKey.localeCompare(b.dateKey);
    if (dateCompare !== 0) return dateCompare;
    const startA = a.startTime ?? '';
    const startB = b.startTime ?? '';
    const startCompare = startA.localeCompare(startB);
    if (startCompare !== 0) return startCompare;
    const endA = a.endTime ?? '';
    const endB = b.endTime ?? '';
    const endCompare = endA.localeCompare(endB);
    if (endCompare !== 0) return endCompare;
    return a.id.localeCompare(b.id);
  });

  sortedShifts.forEach(shift => {
    if (shift.isDayOff) return;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return;

    const range = resolveShiftTimeRange(shift, input, dayIndex);
    if (!range) return;
    shiftTimeRanges.set(shift.id, range);

    let cursor = new Date(range.start);
    while (cursor < range.end) {
      const slotKey = getSlotKey(cursor);
      if (!capacityMap[slotKey]) {
        capacityMap[slotKey] = {};
      }
      const positionKey = shift.positionId || UNKNOWN_POSITION_ID;
      const current = capacityMap[slotKey][positionKey];
      const safeCurrent =
        Number.isFinite(current) && (current as number) > 0
          ? Math.floor(current as number)
          : 0;
      capacityMap[slotKey][positionKey] = safeCurrent + 1;
      cursor = addMinutes(cursor, bucketMinutes);
    }
  });

  return { capacityMap, shiftTimeRanges };
};

export const getShiftTimeRange = (
  shift: EngineShift,
  input: EngineInput,
  dayIndex: number
): ShiftTimeRange | null => resolveShiftTimeRange(shift, input, dayIndex);
