import {
  ConstraintViolation,
  EngineInput,
  EngineShift,
  MinRestHoursBetweenShiftsRule
} from '../../engine/types.js';
import {
  DEFAULT_CLOSING_OFFSET_MINUTES,
  DEFAULT_CLOSING_TIME,
  addMinutes,
  combineDateAndTime,
  diffHours,
  formatDateKey
} from '../../engine/timeUtils.js';

export const MIN_REST_HOURS_BETWEEN_SHIFTS_ID = 'MIN_REST_HOURS_BETWEEN_SHIFTS';

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

export const evaluateMinRestHoursBetweenShifts = (
  input: EngineInput,
  shifts: EngineShift[],
  rule: MinRestHoursBetweenShiftsRule | undefined
): ConstraintViolation[] => {
  if (!rule) return [];

  const violations: ConstraintViolation[] = [];
  const dayIndexMap = new Map<string, number>(
    input.weekDays.map((dayKey, index) => [dayKey, index])
  );

  const shiftsByUser = new Map<string, EngineShift[]>();
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
    if (!shiftsByUser.has(shift.userId)) {
      shiftsByUser.set(shift.userId, []);
    }
    shiftsByUser.get(shift.userId)!.push(shift);
  });

  shiftsByUser.forEach((userShifts, userId) => {
    const ranges = userShifts
      .map(shift => {
        const dayIndex = dayIndexMap.get(shift.dateKey);
        if (dayIndex === undefined) return null;
        const range = resolveShiftRange(shift, input, dayIndex);
        return range
          ? { shiftId: shift.id, start: range.start, end: range.end }
          : null;
      })
      .filter(
        (range): range is { shiftId: string; start: Date; end: Date } =>
          range !== null
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    for (let i = 0; i < ranges.length - 1; i += 1) {
      const current = ranges[i];
      const next = ranges[i + 1];
      const restHours = diffHours(current.end, next.start);
      if (restHours < rule.minRestHours) {
        violations.push({
          constraintId: MIN_REST_HOURS_BETWEEN_SHIFTS_ID,
          severity: rule.severity || 'high',
          message: `A pihenőidő ${rule.minRestHours} óránál kevesebb.`,
          affected: {
            userIds: [userId],
            shiftIds: [current.shiftId, next.shiftId],
            slots: [],
            dateKeys: [formatDateKey(current.start), formatDateKey(next.start)]
          }
        });
      }
    }
  });

  return violations;
};
