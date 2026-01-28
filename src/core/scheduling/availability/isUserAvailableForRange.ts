import { formatDateKey, startOfNextDay } from '../engine/timeUtils.js';
import type {
  AvailabilityException,
  AvailabilityWindow,
  EmployeeAvailability,
  EmployeeProfileV1
} from '../employeeProfiles/types.js';

const DAY_MINUTES = 24 * 60;

const parseTime = (value: string): number => {
  if (value === '24:00') return DAY_MINUTES;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const splitWindow = (window: AvailabilityWindow): { today: [number, number]; nextDay: [number, number] | null } => {
  const start = parseTime(window.startHHmm);
  const end = parseTime(window.endHHmm);
  if (end <= start) {
    return { today: [start, DAY_MINUTES], nextDay: [0, end] };
  }
  return { today: [start, end], nextDay: null };
};

const findExceptionForDate = (
  availability: EmployeeAvailability,
  dateKey: string
): AvailabilityException | undefined =>
  availability.exceptions.find(exception => exception.dateKey === dateKey);

const resolveWindowsForDate = (
  availability: EmployeeAvailability,
  date: Date
): AvailabilityWindow[] => {
  const dateKey = formatDateKey(date);
  const exception = findExceptionForDate(availability, dateKey);
  if (exception) {
    if (!exception.available) return [];
    if (exception.windows && exception.windows.length > 0) {
      return exception.windows;
    }
    return [{ startHHmm: '00:00', endHHmm: '24:00' }];
  }
  const dayKey = String(date.getDay());
  return availability.weekly[dayKey] ?? [];
};

const buildAvailabilityRangesForDate = (
  availability: EmployeeAvailability,
  date: Date
): Array<[number, number]> => {
  const previousDate = new Date(date);
  previousDate.setDate(previousDate.getDate() - 1);

  const ranges: Array<[number, number]> = [];
  resolveWindowsForDate(availability, date).forEach(window => {
    const result = splitWindow(window);
    ranges.push(result.today);
  });
  resolveWindowsForDate(availability, previousDate).forEach(window => {
    const result = splitWindow(window);
    if (result.nextDay) ranges.push(result.nextDay);
  });

  return ranges;
};

const isSegmentCovered = (
  segmentStart: number,
  segmentEnd: number,
  ranges: Array<[number, number]>
): boolean =>
  ranges.some(([rangeStart, rangeEnd]) => segmentStart >= rangeStart && segmentEnd <= rangeEnd);

export const isUserAvailableForRange = (
  profile: EmployeeProfileV1,
  rangeStart: Date,
  rangeEnd: Date,
  _unitTimezone?: string
): boolean => {
  if (rangeEnd <= rangeStart) return false;
  let cursor = new Date(rangeStart);

  while (cursor < rangeEnd) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);
    const nextDayStart = startOfNextDay(cursor);
    const segmentEnd = nextDayStart < rangeEnd ? nextDayStart : rangeEnd;
    const segmentStartMinutes = (cursor.getTime() - dayStart.getTime()) / (60 * 1000);
    const segmentEndMinutes = (segmentEnd.getTime() - dayStart.getTime()) / (60 * 1000);
    const ranges = buildAvailabilityRangesForDate(profile.availability, dayStart);
    if (!isSegmentCovered(segmentStartMinutes, segmentEndMinutes, ranges)) {
      return false;
    }
    cursor = segmentEnd;
  }

  return true;
};
