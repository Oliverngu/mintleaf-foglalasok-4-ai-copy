import { DEFAULT_CLOSING_OFFSET_MINUTES, DEFAULT_CLOSING_TIME } from './engine/timeUtils.js';
import type { DailySetting, ScheduleSettings } from '../models/data.js';

const DEFAULT_OPENING_TIME = '08:00';
const MAX_CLOSING_OFFSET_MINUTES = 240;

type RawDailySetting = Omit<DailySetting, 'closingTime' | 'closingTimeInherit' | 'closingOffsetMinutes'> & {
  closingTime?: string | null;
  closingTimeInherit?: boolean | null;
  closingOffsetMinutes?: number | null;
};

type RawScheduleSettings = Omit<ScheduleSettings, 'dailySettings' | 'showOpeningTime' | 'showClosingTime'> & {
  dailySettings?: Record<number, RawDailySetting>;
  showOpeningTime?: boolean;
  showClosingTime?: boolean;
};

const clampClosingOffsetMinutes = (value?: number | null): number => {
  const resolved = Number.isFinite(value) ? Math.floor(value as number) : DEFAULT_CLOSING_OFFSET_MINUTES;
  return Math.min(MAX_CLOSING_OFFSET_MINUTES, Math.max(0, resolved));
};

export const normalizeScheduleSettings = (settings: RawScheduleSettings): ScheduleSettings => {
  const normalizedDailySettings: ScheduleSettings['dailySettings'] = {};
  const sourceDailySettings = settings.dailySettings ?? {};

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const rawSetting = sourceDailySettings[dayIndex];
    const rawClosingTime =
      typeof rawSetting?.closingTime === 'string' && rawSetting.closingTime.trim() !== ''
        ? rawSetting.closingTime
        : null;
    const closingTimeInherit =
      rawClosingTime === null
        ? true
        : typeof rawSetting?.closingTimeInherit === 'boolean'
          ? rawSetting.closingTimeInherit
          : false;

    normalizedDailySettings[dayIndex] = {
      isOpen: rawSetting?.isOpen ?? true,
      openingTime: rawSetting?.openingTime ?? DEFAULT_OPENING_TIME,
      closingTime: rawClosingTime ?? DEFAULT_CLOSING_TIME,
      closingTimeInherit,
      closingOffsetMinutes: clampClosingOffsetMinutes(rawSetting?.closingOffsetMinutes),
      quotas: rawSetting?.quotas ?? {}
    };
  }

  return {
    ...settings,
    showOpeningTime: settings.showOpeningTime ?? false,
    showClosingTime: settings.showClosingTime ?? false,
    dailySettings: normalizedDailySettings
  };
};
