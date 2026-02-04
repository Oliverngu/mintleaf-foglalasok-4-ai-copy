type ResolveShiftEndParams = {
  start: Date;
  end?: Date | null;
  dateKey: string;
  closingTime?: string | null;
  closingOffsetMinutes?: number | null;
};

type CalculateShiftDurationParams = {
  isDayOff?: boolean;
  start?: Date | null;
  end?: Date | null;
  dateKey: string;
  closingTime?: string | null;
  closingOffsetMinutes?: number | null;
};

export const parseTimeToMinutes = (time: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
};

export const buildDateFromDateKeyTime = (
  dateKey: string,
  time: string
): Date | null => {
  if (parseTimeToMinutes(time) === null) return null;
  const date = new Date(`${dateKey}T${time}:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const resolveShiftEndDate = ({
  start,
  end,
  dateKey,
  closingTime,
  closingOffsetMinutes
}: ResolveShiftEndParams): Date | null => {
  if (end) return end;
  if (!closingTime) return null;

  const resolved = buildDateFromDateKeyTime(dateKey, closingTime);
  if (!resolved) return null;

  const offsetMinutes = closingOffsetMinutes ?? 0;
  if (offsetMinutes) {
    resolved.setMinutes(resolved.getMinutes() + offsetMinutes);
  }

  if (resolved <= start) {
    resolved.setDate(resolved.getDate() + 1);
  }

  return resolved;
};

export const calculateShiftDurationHours = ({
  isDayOff,
  start,
  end,
  dateKey,
  closingTime,
  closingOffsetMinutes
}: CalculateShiftDurationParams): number => {
  if (isDayOff || !start) return 0;

  const resolvedEnd = resolveShiftEndDate({
    start,
    end,
    dateKey,
    closingTime,
    closingOffsetMinutes
  });

  if (!resolvedEnd) return 0;
  const durationMs = resolvedEnd.getTime() - start.getTime();
  return durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
};
