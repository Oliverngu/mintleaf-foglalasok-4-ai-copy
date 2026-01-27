import type { EngineShift, Suggestion } from '../../engine/types.js';

export type ScheduleState = {
  shifts: EngineShift[];
  unitId?: string;
};

export type ApplyEffect =
  | {
      type: 'createShift';
      shiftId: string;
      userId: string;
      dateKey: string;
      startTime: string;
      endTime: string;
      positionId?: string;
    }
  | {
      type: 'moveShift';
      shiftId: string;
      userId: string;
      dateKey: string;
      newStartTime: string;
      newEndTime: string;
      positionId?: string;
    };

export type ApplyError = {
  code: string;
  message: string;
  actionIndex?: number;
  actionType?: string;
  preview?: string;
};

export type ApplySuggestionResult = {
  status: 'applied' | 'noop' | 'failed';
  nextScheduleState: ScheduleState;
  effects: ApplyEffect[];
  errors: ApplyError[];
};

type ApplySuggestionInput = {
  suggestionId: string;
  suggestion: Suggestion;
  scheduleState: ScheduleState;
  appliedSuggestionIds?: Iterable<string>;
};

const isProduction = () => process.env.NODE_ENV === 'production';

const buildActionPreview = (action: unknown) => {
  try {
    return JSON.stringify(action);
  } catch {
    return '[unserializable-action]';
  }
};

const buildGeneratedShiftId = (suggestionId: string, index: number) =>
  `gen:${suggestionId}:${index}`;

const ensureRequiredString = (
  value: unknown,
  field: string,
  missing: string[],
  invalid: string[]
) => {
  if (value === undefined || value === null || value === '') {
    missing.push(field);
    return;
  }
  if (typeof value !== 'string') {
    invalid.push(field);
  }
};

const ensureOptionalString = (value: unknown, field: string, invalid: string[]) => {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    invalid.push(field);
  }
};

const validateCreateShiftAction = (action: Suggestion['actions'][number]) => {
  const missing: string[] = [];
  const invalid: string[] = [];
  if (action.type !== 'createShift') return { missing, invalid };
  ensureRequiredString(action.userId, 'userId', missing, invalid);
  ensureRequiredString(action.dateKey, 'dateKey', missing, invalid);
  ensureRequiredString(action.startTime, 'startTime', missing, invalid);
  ensureRequiredString(action.endTime, 'endTime', missing, invalid);
  ensureOptionalString(action.positionId, 'positionId', invalid);
  return { missing, invalid };
};

const validateMoveShiftAction = (action: Suggestion['actions'][number]) => {
  const missing: string[] = [];
  const invalid: string[] = [];
  if (action.type !== 'moveShift') return { missing, invalid };
  ensureRequiredString(action.shiftId, 'shiftId', missing, invalid);
  ensureRequiredString(action.userId, 'userId', missing, invalid);
  ensureRequiredString(action.dateKey, 'dateKey', missing, invalid);
  ensureRequiredString(action.newStartTime, 'newStartTime', missing, invalid);
  ensureRequiredString(action.newEndTime, 'newEndTime', missing, invalid);
  ensureOptionalString(action.positionId, 'positionId', invalid);
  return { missing, invalid };
};

const failOrThrow = (
  errors: ApplyError[],
  error: ApplyError,
  fallbackError?: Error
) => {
  if (!isProduction()) {
    if (fallbackError) throw fallbackError;
    throw new Error(error.message);
  }
  errors.push(error);
};

const validateTimeRange = (start: string, end: string) => start < end;

export const applySuggestion = ({
  suggestionId,
  suggestion,
  scheduleState,
  appliedSuggestionIds,
}: ApplySuggestionInput): ApplySuggestionResult => {
  const appliedSet = new Set(appliedSuggestionIds ?? []);
  if (appliedSet.has(suggestionId)) {
    return {
      status: 'noop',
      nextScheduleState: scheduleState,
      effects: [],
      errors: [],
    };
  }

  const originalState: ScheduleState = {
    ...scheduleState,
    shifts: [...scheduleState.shifts],
  };
  const workingShifts = scheduleState.shifts.map(shift => ({ ...shift }));
  const effects: ApplyEffect[] = [];
  const errors: ApplyError[] = [];

  const recordFailure = (error: ApplyError, fallbackError?: Error) => {
    failOrThrow(errors, error, fallbackError);
  };

  for (let index = 0; index < suggestion.actions.length; index += 1) {
    const action = suggestion.actions[index];
    const actionType = action.type;
    const preview = buildActionPreview(action);

    try {
      if (action.type === 'createShift') {
        const { missing, invalid } = validateCreateShiftAction(action);
        if (missing.length > 0 || invalid.length > 0) {
          recordFailure(
            {
              code: missing.length > 0 ? 'missing_fields' : 'invalid_fields',
              message: `Invalid createShift action; missing=${missing.join(
                ','
              )} invalid=${invalid.join(',')}`,
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid createShift action.')
          );
          break;
        }

        if (!validateTimeRange(action.startTime, action.endTime)) {
          recordFailure(
            {
              code: 'invalid_time_range',
              message: 'createShift action has an invalid time range.',
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid createShift time range.')
          );
          break;
        }

        const shiftId = buildGeneratedShiftId(suggestionId, index);
        if (workingShifts.some(shift => shift.id === shiftId)) {
          recordFailure(
            {
              code: 'duplicate_shift',
              message: `Shift ${shiftId} already exists.`,
              actionIndex: index,
              actionType,
              preview,
            },
            new Error(`Shift ${shiftId} already exists.`)
          );
          break;
        }

        const newShift: EngineShift = {
          id: shiftId,
          userId: action.userId,
          unitId: scheduleState.unitId,
          dateKey: action.dateKey,
          startTime: action.startTime,
          endTime: action.endTime,
          positionId: action.positionId,
        };
        workingShifts.push(newShift);
        effects.push({
          type: 'createShift',
          shiftId,
          userId: action.userId,
          dateKey: action.dateKey,
          startTime: action.startTime,
          endTime: action.endTime,
          positionId: action.positionId,
        });
        continue;
      }

      if (action.type === 'moveShift') {
        const { missing, invalid } = validateMoveShiftAction(action);
        if (missing.length > 0 || invalid.length > 0) {
          recordFailure(
            {
              code: missing.length > 0 ? 'missing_fields' : 'invalid_fields',
              message: `Invalid moveShift action; missing=${missing.join(
                ','
              )} invalid=${invalid.join(',')}`,
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid moveShift action.')
          );
          break;
        }

        if (!validateTimeRange(action.newStartTime, action.newEndTime)) {
          recordFailure(
            {
              code: 'invalid_time_range',
              message: 'moveShift action has an invalid time range.',
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid moveShift time range.')
          );
          break;
        }

        const targetIndex = workingShifts.findIndex(
          shift => shift.id === action.shiftId
        );
        if (targetIndex === -1) {
          recordFailure(
            {
              code: 'shift_not_found',
              message: `Shift ${action.shiftId} not found.`,
              actionIndex: index,
              actionType,
              preview,
            },
            new Error(`Shift ${action.shiftId} not found.`)
          );
          break;
        }

        const target = workingShifts[targetIndex];
        workingShifts[targetIndex] = {
          ...target,
          dateKey: action.dateKey,
          startTime: action.newStartTime,
          endTime: action.newEndTime,
          positionId: action.positionId ?? target.positionId,
        };
        effects.push({
          type: 'moveShift',
          shiftId: action.shiftId,
          userId: action.userId,
          dateKey: action.dateKey,
          newStartTime: action.newStartTime,
          newEndTime: action.newEndTime,
          positionId: action.positionId,
        });
        continue;
      }

      recordFailure(
        {
          code: 'unsupported_action',
          message: `Unsupported action type: ${actionType}`,
          actionIndex: index,
          actionType,
          preview,
        },
        new Error(`Unsupported action type: ${actionType}`)
      );
      break;
    } catch (error) {
      if (!isProduction()) {
        throw error;
      }
      errors.push({
        code: 'apply_failed',
        message: error instanceof Error ? error.message : 'Unknown apply error.',
        actionIndex: index,
        actionType,
        preview,
      });
      break;
    }
  }

  if (errors.length > 0) {
    return {
      status: 'failed',
      nextScheduleState: originalState,
      effects: [],
      errors,
    };
  }

  return {
    status: 'applied',
    nextScheduleState: {
      ...scheduleState,
      shifts: workingShifts,
    },
    effects,
    errors: [],
  };
};
