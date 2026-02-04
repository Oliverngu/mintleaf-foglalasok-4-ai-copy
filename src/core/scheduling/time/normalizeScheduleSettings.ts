import type { DailySetting, ScheduleSettings } from '../../models/data.js';

const DEFAULT_OPENING_TIME = '08:00';
const DEFAULT_CLOSING_TIME = '22:00';
const DEFAULT_CLOSING_OFFSET_MINUTES = 0;

const buildDefaultDailySetting = (): DailySetting => ({
  isOpen: true,
  openingTime: DEFAULT_OPENING_TIME,
  closingTime: DEFAULT_CLOSING_TIME,
  closingOffsetMinutes: DEFAULT_CLOSING_OFFSET_MINUTES,
  quotas: {}
});

export const normalizeClosingOffsetMinutes = (
  value?: number | null
): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value as number);
  return Math.min(240, Math.max(0, rounded));
};

export const normalizeScheduleSettings = (
  settings: ScheduleSettings
): ScheduleSettings => {
  const dailySettings = settings.dailySettings ?? {};
  const normalizedDailySettings: ScheduleSettings['dailySettings'] = {};

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const setting = dailySettings[dayIndex] ?? buildDefaultDailySetting();
    const closingTime =
      setting.closingTime === undefined
        ? DEFAULT_CLOSING_TIME
        : setting.closingTime;

    normalizedDailySettings[dayIndex] = {
      isOpen: setting.isOpen ?? true,
      openingTime: setting.openingTime ?? DEFAULT_OPENING_TIME,
      closingTime,
      // closingOffsetMinutes is applied when shifts have end === null.
      closingOffsetMinutes: normalizeClosingOffsetMinutes(
        setting.closingOffsetMinutes
      ),
      quotas: setting.quotas ?? {}
    };
  }

  return {
    ...settings,
    showOpeningTime: settings.showOpeningTime ?? false,
    showClosingTime: settings.showClosingTime ?? false,
    dailySettings: normalizedDailySettings
  };
};
