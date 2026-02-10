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
  getSlotKey
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
  const bucketMinutes = input.ruleset.bucketMinutes ?? 60;
  const dayIndexMap = new Map(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  input.shifts.forEach(shift => {
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
      capacityMap[slotKey][positionKey] =
        (capacityMap[slotKey][positionKey] || 0) + 1;
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
