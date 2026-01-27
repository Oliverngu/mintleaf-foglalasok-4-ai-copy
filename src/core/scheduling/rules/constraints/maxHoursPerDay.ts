import {
  ConstraintViolation,
  EngineInput,
  EngineShift,
  MaxHoursPerDayRule
} from '../../engine/types.js';
import {
  DEFAULT_CLOSING_OFFSET_MINUTES,
  DEFAULT_CLOSING_TIME,
  addMinutes,
  combineDateAndTime,
  diffHours,
  formatDateKey,
  startOfNextDay
} from '../../engine/timeUtils.js';

export const MAX_HOURS_PER_DAY_ID = 'MAX_HOURS_PER_DAY';

type DayHoursMap = Map<string, number>;

const resolveShiftRange = (
  shift: EngineShift,
  input: EngineInput,
  dayIndex: number
): { start: Date; end: Date } | null => {
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

  return { start, end };
};

const accumulateShiftHoursByDay = (
  shift: EngineShift,
  input: EngineInput,
  dayIndex: number,
  dayHours: DayHoursMap
) => {
  const range = resolveShiftRange(shift, input, dayIndex);
  if (!range) return;

  let cursor = new Date(range.start);
  while (cursor < range.end) {
    const nextDayStart = startOfNextDay(cursor);
    const segmentEnd = nextDayStart < range.end ? nextDayStart : range.end;
    const dateKey = formatDateKey(cursor);
    const hours = diffHours(cursor, segmentEnd);
    dayHours.set(dateKey, (dayHours.get(dateKey) || 0) + hours);
    cursor = segmentEnd;
  }
};

export const evaluateMaxHoursPerDay = (
  input: EngineInput,
  shifts: EngineShift[],
  rule: MaxHoursPerDayRule | undefined
): ConstraintViolation[] => {
  if (!rule) return [];

  const violations: ConstraintViolation[] = [];
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  const hoursByUser = new Map<string, DayHoursMap>();

  const sortedShifts = [...shifts].sort((a, b) => {
    const userCompare = a.userId.localeCompare(b.userId);
    if (userCompare !== 0) return userCompare;
    const dateCompare = a.dateKey.localeCompare(b.dateKey);
    if (dateCompare !== 0) return dateCompare;
    const startCompare = (a.startTime ?? '').localeCompare(b.startTime ?? '');
    if (startCompare !== 0) return startCompare;
    return a.id.localeCompare(b.id);
  });

  sortedShifts.forEach(shift => {
    if (shift.isDayOff) return;
    const dayIndex = dayIndexMap.get(shift.dateKey);
    if (dayIndex === undefined) return;

    if (!hoursByUser.has(shift.userId)) {
      hoursByUser.set(shift.userId, new Map());
    }
    accumulateShiftHoursByDay(
      shift,
      input,
      dayIndex,
      hoursByUser.get(shift.userId)!
    );
  });

  hoursByUser.forEach((dayHours, userId) => {
    dayHours.forEach((hours, dateKey) => {
      if (hours > rule.maxHoursPerDay) {
        violations.push({
          constraintId: MAX_HOURS_PER_DAY_ID,
          severity: rule.severity || 'medium',
          message: `A napi munkaidő túllépte a ${rule.maxHoursPerDay} órát.`,
          affected: {
            userIds: [userId],
            shiftIds: [],
            slots: [],
            dateKeys: [dateKey]
          }
        });
      }
    });
  });

  return violations;
};
