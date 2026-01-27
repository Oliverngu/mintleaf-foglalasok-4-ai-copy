export type Severity = 'low' | 'medium' | 'high';

export type EngineUser = {
  id: string;
  displayName: string;
  positionIds?: string[];
  unitIds?: string[];
  isActive?: boolean;
};

export type EnginePosition = {
  id: string;
  name: string;
};

export type EngineShift = {
  id: string;
  userId: string;
  unitId?: string;
  dateKey: string;
  startTime?: string | null;
  endTime?: string | null;
  positionId?: string;
  isDayOff?: boolean;
};

export type EngineScheduleSettings = {
  dailySettings: Record<
    number,
    {
      isOpen?: boolean;
      openingTime: string;
      closingTime: string;
      closingTimeInherit?: boolean;
      closingOffsetMinutes?: number;
    }
  >;
  defaultClosingTime?: string;
  defaultClosingOffsetMinutes?: number;
};

export type MinCoverageRule = {
  positionId: string;
  dateKeys?: string[];
  startTime: string;
  endTime: string;
  minCount: number;
  severity?: Severity;
};

export type MaxHoursPerDayRule = {
  maxHoursPerDay: number;
  severity?: Severity;
};

export type MinRestHoursBetweenShiftsRule = {
  minRestHours: number;
  severity?: Severity;
};

export type Ruleset = {
  bucketMinutes?: number;
  minCoverageByPosition?: MinCoverageRule[];
  maxHoursPerDay?: MaxHoursPerDayRule;
  minRestHoursBetweenShifts?: MinRestHoursBetweenShiftsRule;
};

export type EngineInput = {
  unitId: string;
  weekStart: string;
  weekDays: string[];
  users: EngineUser[];
  positions: EnginePosition[];
  shifts: EngineShift[];
  scheduleSettings: EngineScheduleSettings;
  ruleset: Ruleset;
  scenarios?: import('../scenarios/types.js').Scenario[];
  employeeProfilesByUserId?: Record<
    string,
    import('../employeeProfiles/types.js').EmployeeProfileV1
  >;
};

export type CapacityMap = Record<string, Record<string, number>>;

export type ConstraintViolation = {
  constraintId: string;
  severity: Severity;
  message: string;
  affected: {
    userIds?: string[];
    shiftIds?: string[];
    slots?: string[];
    positionId?: string;
    dateKeys?: string[];
  };
};

export type SuggestionAction =
  | {
      type: 'moveShift';
      shiftId: string;
      userId: string;
      dateKey: string;
      newStartTime: string;
      newEndTime: string;
      positionId?: string;
    }
  | {
      type: 'createShift';
      userId: string;
      dateKey: string;
      startTime: string;
      endTime: string;
      positionId?: string;
    };

export type Suggestion = {
  type: 'SHIFT_MOVE_SUGGESTION' | 'ADD_SHIFT_SUGGESTION';
  actions: SuggestionAction[];
  candidateEvaluation?: {
    chosenUserId: string;
    excludedUserIdsByReason: {
      unavailable: string[];
    };
  };
  expectedImpact: string;
  explanation: string;
};

export type EngineResult = {
  capacityMap: CapacityMap;
  violations: ConstraintViolation[];
  suggestions: Suggestion[];
  scenarioEffects?: {
    removedShiftsCount: number;
    addedRulesCount: number;
    overriddenRulesCount: number;
    ruleDiff?: {
      before: MinCoverageRule[];
      after: MinCoverageRule[];
    };
    uiSummary?: {
      hasRuleOverrides: boolean;
      hasRuleAdds: boolean;
      hasShiftRemovals: boolean;
    };
  };
  explanation: {
    trace: string[];
    inputsHash?: string;
  };
};

export type ShiftTimeRange = {
  start: Date;
  end: Date;
  dateKey: string;
};
