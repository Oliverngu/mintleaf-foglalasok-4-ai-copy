import type { EngineInput } from '../../engine/types.js';

const serializeDailySettings = (dailySettings: EngineInput['scheduleSettings']['dailySettings']) =>
  Object.keys(dailySettings)
    .map(key => Number(key))
    .sort((a, b) => a - b)
    .map(dayIndex => {
      const setting = dailySettings[dayIndex];
      return [
        dayIndex,
        setting?.isOpen ?? '',
        setting?.openingTime ?? '',
        setting?.closingTime ?? '',
        setting?.closingOffsetMinutes ?? '',
      ].join(':');
    })
    .join('|');

export const computeAssistantContextKey = (input: EngineInput): string => {
  const positions = [...input.positions]
    .map(position => position.id)
    .sort()
    .join(',');
  const users = [...input.users]
    .map(user => [user.id, user.isActive ?? true ? '1' : '0'].join(':'))
    .sort()
    .join(',');
  const weekDays = input.weekDays.join(',');
  const bucketMinutes = input.ruleset.bucketMinutes ?? '';
  const scheduleSettings = [
    serializeDailySettings(input.scheduleSettings.dailySettings),
    input.scheduleSettings.defaultClosingTime ?? '',
    input.scheduleSettings.defaultClosingOffsetMinutes ?? '',
  ].join('|');

  return [
    `unit:${input.unitId}`,
    `weekStart:${input.weekStart}`,
    `weekDays:${weekDays}`,
    `positions:${positions}`,
    `users:${users}`,
    `bucketMinutes:${bucketMinutes}`,
    `scheduleSettings:${scheduleSettings}`,
  ].join('::');
};
