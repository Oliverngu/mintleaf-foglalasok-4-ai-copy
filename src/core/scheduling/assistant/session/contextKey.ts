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
        setting?.closingTimeInherit ?? '',
        setting?.closingOffsetMinutes ?? '',
      ].join(':');
    })
    .join('|');

const serializeScenarioPayload = (scenario: NonNullable<EngineInput['scenarios']>[number]) => {
  switch (scenario.type) {
    case 'SICKNESS':
      return [
        scenario.payload.userId,
        (scenario.payload.dateKeys ?? []).slice().sort().join(','),
        scenario.payload.reason ?? '',
        scenario.payload.severity ?? '',
      ].join(':');
    case 'EVENT':
    case 'PEAK':
      return [
        (scenario.payload.dateKeys ?? []).slice().sort().join(','),
        scenario.payload.timeRange?.startTime ?? '',
        scenario.payload.timeRange?.endTime ?? '',
        (scenario.payload.minCoverageOverrides ?? [])
          .slice()
          .sort((a, b) => a.positionId.localeCompare(b.positionId))
          .map(override => `${override.positionId}:${override.minCount}`)
          .join(','),
        scenario.type === 'EVENT'
          ? scenario.payload.expectedLoadMultiplier ?? ''
          : '',
      ].join(':');
    case 'LAST_MINUTE':
      return [
        scenario.payload.timestamp,
        scenario.payload.description,
        (scenario.payload.patches ?? [])
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(patch => `${patch.id}:${patch.description}`)
          .join(','),
      ].join(':');
    default:
      return '';
  }
};

const serializeScenarios = (scenarios?: EngineInput['scenarios']) => {
  if (!scenarios || scenarios.length === 0) return '';
  return [...scenarios]
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(scenario => {
      const dateKeys = (scenario.dateKeys ?? []).slice().sort().join(',');
      return [
        scenario.id,
        scenario.type,
        scenario.unitId,
        scenario.weekStartDate,
        scenario.inheritMode ?? 'ADD',
        dateKeys,
        serializeScenarioPayload(scenario),
      ].join(':');
    })
    .join('|');
};

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
  const scenarios = serializeScenarios(input.scenarios);

  return [
    `unit:${input.unitId}`,
    `weekStart:${input.weekStart}`,
    `weekDays:${weekDays}`,
    `positions:${positions}`,
    `users:${users}`,
    `bucketMinutes:${bucketMinutes}`,
    `scheduleSettings:${scheduleSettings}`,
    `scenarios:${scenarios}`,
  ].join('::');
};
