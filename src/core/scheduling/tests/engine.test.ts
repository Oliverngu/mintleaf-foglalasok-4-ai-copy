import { runEngine } from '../engine/runEngine';
import { EngineInput } from '../engine/types';

const buildScheduleSettings = () => ({
  dailySettings: {
    0: { openingTime: '08:00', closingTime: '22:00' },
    1: { openingTime: '08:00', closingTime: '22:00' },
    2: { openingTime: '08:00', closingTime: '22:00' },
    3: { openingTime: '08:00', closingTime: '22:00' },
    4: { openingTime: '08:00', closingTime: '22:00' },
    5: { openingTime: '08:00', closingTime: '22:00' },
    6: { openingTime: '08:00', closingTime: '22:00' }
  }
});

const buildWeekDays = () => [
  '2025-01-06',
  '2025-01-07',
  '2025-01-08',
  '2025-01-09',
  '2025-01-10',
  '2025-01-11',
  '2025-01-12'
];

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const baseInput: Omit<EngineInput, 'unitId' | 'weekStart' | 'weekDays' | 'shifts'> = {
  users: [{ id: 'u1', displayName: 'User 1', isActive: true }],
  positions: [{ id: 'p1', name: 'Pult' }],
  scheduleSettings: buildScheduleSettings(),
  ruleset: { bucketMinutes: 60 }
};

const testOvernightShift = () => {
  const weekDays = buildWeekDays();
  const input: EngineInput = {
    ...baseInput,
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    shifts: [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '15:00',
        endTime: '03:00',
        positionId: 'p1'
      }
    ]
  };

  const result = runEngine(input);
  assert(
    result.capacityMap['2025-01-06T15:00']?.p1 === 1,
    'Overnight shift should cover start day slots.'
  );
  assert(
    result.capacityMap['2025-01-07T02:00']?.p1 === 1,
    'Overnight shift should cover next day slots.'
  );
};

const testDayOffExclusion = () => {
  const weekDays = buildWeekDays();
  const input: EngineInput = {
    ...baseInput,
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    shifts: [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '00:00',
        endTime: null,
        positionId: 'p1',
        isDayOff: true
      }
    ],
    ruleset: {
      bucketMinutes: 60,
      minCoverageByPosition: [
        {
          positionId: 'p1',
          dateKeys: [weekDays[0]],
          startTime: '08:00',
          endTime: '09:00',
          minCount: 1
        }
      ]
    }
  };

  const result = runEngine(input);
  assert(
    Object.keys(result.capacityMap).length === 0,
    'Day off shifts should not add capacity.'
  );
  assert(
    result.suggestions.length === 0,
    'Day off user should not be suggested for missing coverage.'
  );
};

const testMultiUnitIsolation = () => {
  const weekDays = buildWeekDays();
  const inputA: EngineInput = {
    ...baseInput,
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    shifts: [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '09:00',
        endTime: '10:00',
        positionId: 'p1'
      }
    ]
  };

  const inputB: EngineInput = {
    ...baseInput,
    unitId: 'unit-b',
    weekStart: weekDays[0],
    weekDays,
    shifts: [
      {
        id: 's2',
        userId: 'u1',
        unitId: 'unit-b',
        dateKey: weekDays[0],
        startTime: '12:00',
        endTime: '13:00',
        positionId: 'p1'
      }
    ]
  };

  const resultA = runEngine(inputA);
  const resultB = runEngine(inputB);

  assert(
    !!resultA.capacityMap['2025-01-06T09:00'],
    'Unit A should contain its own capacity.'
  );
  assert(
    !resultA.capacityMap['2025-01-06T12:00'],
    'Unit A should not include Unit B capacity.'
  );
  assert(
    !!resultB.capacityMap['2025-01-06T12:00'],
    'Unit B should contain its own capacity.'
  );
};

const testRestViolation = () => {
  const weekDays = buildWeekDays();
  const input: EngineInput = {
    ...baseInput,
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    shifts: [
      {
        id: 's1',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[0],
        startTime: '22:00',
        endTime: '02:00',
        positionId: 'p1'
      },
      {
        id: 's2',
        userId: 'u1',
        unitId: 'unit-a',
        dateKey: weekDays[1],
        startTime: '10:00',
        endTime: '18:00',
        positionId: 'p1'
      }
    ],
    ruleset: {
      bucketMinutes: 60,
      minRestHoursBetweenShifts: { minRestHours: 11 }
    }
  };

  const result = runEngine(input);
  assert(
    result.violations.some(v => v.constraintId === 'MIN_REST_HOURS_BETWEEN_SHIFTS'),
    'Rest violation should be detected.'
  );
};

const testSuggestionDeduplication = () => {
  const weekDays = buildWeekDays();
  const input: EngineInput = {
    ...baseInput,
    unitId: 'unit-a',
    weekStart: weekDays[0],
    weekDays,
    shifts: [],
    ruleset: {
      bucketMinutes: 60,
      minCoverageByPosition: [
        {
          positionId: 'p1',
          dateKeys: [weekDays[0]],
          startTime: '08:00',
          endTime: '09:00',
          minCount: 1
        },
        {
          positionId: 'p1',
          dateKeys: [weekDays[0]],
          startTime: '08:00',
          endTime: '09:00',
          minCount: 1
        }
      ]
    }
  };

  const result = runEngine(input);
  assert(
    result.suggestions.length === 1,
    'Duplicate coverage rules should yield a single suggestion.'
  );
};

const runTests = () => {
  testOvernightShift();
  testDayOffExclusion();
  testMultiUnitIsolation();
  testRestViolation();
  testSuggestionDeduplication();
};

runTests();
