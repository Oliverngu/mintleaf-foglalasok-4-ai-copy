export const DEFAULT_CLOSING_TIME = '22:00';
export const DEFAULT_CLOSING_OFFSET_MINUTES = 0;

export const normalizeBucketMinutes = (value?: number): number => {
  const minutes = Number.isFinite(value) ? Math.floor(value as number) : 60;
  return minutes > 0 ? minutes : 60;
};

export const padTime = (value: number): string =>
  String(value).padStart(2, '0');

export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = padTime(date.getMonth() + 1);
  const day = padTime(date.getDate());
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (dateKey: string): Date =>
  new Date(`${dateKey}T00:00:00`);

export const combineDateAndTime = (dateKey: string, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = parseDateKey(dateKey);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export const addMinutes = (date: Date, minutes: number): Date => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
};

export const toTimeString = (date: Date): string =>
  `${padTime(date.getHours())}:${padTime(date.getMinutes())}`;

export const getSlotKey = (date: Date): string =>
  `${formatDateKey(date)}T${toTimeString(date)}`;

export const getNextDay = (date: Date): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
};

export const startOfNextDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
};

export const diffHours = (start: Date, end: Date): number =>
  Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
