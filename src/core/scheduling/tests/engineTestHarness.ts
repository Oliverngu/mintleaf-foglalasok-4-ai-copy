import type {
  EngineInput,
  EngineScheduleSettings,
  Ruleset,
} from '../engine/types.js';

type ScheduleSettingsOverrides = {
  dailySettings?: EngineScheduleSettings['dailySettings'];
  mergeDailySettings?: boolean;
  defaultClosingTime?: string;
  defaultClosingOffsetMinutes?: number;
};

const baseDailySettings: EngineScheduleSettings['dailySettings'] = {
  0: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  1: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  2: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  3: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  4: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  5: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
  6: { openingTime: '08:00', closingTime: '22:00', closingOffsetMinutes: 0 },
};

const baseRuleset: Ruleset = { bucketMinutes: 60 };

export const buildWeekDays = () => [
  '2025-01-06',
  '2025-01-07',
  '2025-01-08',
  '2025-01-09',
  '2025-01-10',
  '2025-01-11',
  '2025-01-12',
];

export const buildScheduleSettings = (
  overrides: ScheduleSettingsOverrides = {}
): EngineScheduleSettings => {
  const {
    dailySettings,
    mergeDailySettings = true,
    defaultClosingTime = '21:00',
    defaultClosingOffsetMinutes = 60,
  } = overrides;

  return {
    dailySettings: mergeDailySettings
      ? { ...baseDailySettings, ...(dailySettings ?? {}) }
      : dailySettings ?? baseDailySettings,
    defaultClosingTime,
    defaultClosingOffsetMinutes,
  };
};

export const makeEngineInput = (overrides: Partial<EngineInput> = {}): EngineInput => {
  const weekDays = overrides.weekDays ?? buildWeekDays();
  const scheduleSettings = overrides.scheduleSettings ?? buildScheduleSettings();
  const ruleset = { ...baseRuleset, ...(overrides.ruleset ?? {}) };

  return {
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    users: [
      { id: 'u1', displayName: 'User 1', isActive: true },
      { id: 'u2', displayName: 'User 2', isActive: true },
    ],
    positions: [{ id: 'p1', name: 'Pult' }],
    shifts: [],
    scheduleSettings,
    ruleset,
    ...overrides,
  };
};

export const baseEngineInput = () => makeEngineInput();
