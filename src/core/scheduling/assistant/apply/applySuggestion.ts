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
  code:
    | 'missing_fields'
    | 'invalid_fields'
    | 'invalid_time_format'
    | 'invalid_time_range'
    | 'duplicate_shift'
    | 'shift_not_found'
    | 'unsupported_action'
    | 'apply_failed'
    | 'user_mismatch';
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

const PREVIEW_LIMIT = 200;

const sanitizePreview = (value: string) =>
  value.replace(/[|;\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

const stableSortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => stableSortKeys(item));
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableSortKeys(record[key]);
      return acc;
    }, {});
};

const buildActionPreview = (action: unknown) => {
  try {
    const serialized = JSON.stringify(stableSortKeys(action));
    const sanitized = sanitizePreview(serialized);
    return sanitized.length > PREVIEW_LIMIT
      ? `${sanitized.slice(0, PREVIEW_LIMIT)}…`
      : sanitized;
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

const parseTimeToMinutes = (time: string): number | null => {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const validateTimeRange = (start: string, end: string) => {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) {
    return { ok: false, reason: 'invalid_time_format' as const };
  }
  if (startMinutes === endMinutes) {
    return { ok: false, reason: 'invalid_time_range' as const };
  }
  return { ok: true };
};

const shouldDedupeCreateShift = (
  shifts: EngineShift[],
  action: Extract<Suggestion['actions'][number], { type: 'createShift' }>,
  unitId?: string
) => {
  return shifts.some(shift => {
    if (shift.userId !== action.userId) return false;
    if (shift.dateKey !== action.dateKey) return false;
    if ((shift.startTime ?? '') !== action.startTime) return false;
    if ((shift.endTime ?? '') !== action.endTime) return false;
    if ((shift.positionId ?? '') !== (action.positionId ?? '')) return false;
    if (unitId && shift.unitId && shift.unitId !== unitId) return false;
    return true;
  });
};

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

        const timeValidation = validateTimeRange(action.startTime, action.endTime);
        if (!timeValidation.ok) {
          recordFailure(
            {
              code: timeValidation.reason,
              message:
                timeValidation.reason === 'invalid_time_format'
                  ? 'createShift action has an invalid time format.'
                  : 'createShift action has an invalid time range.',
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid createShift time.')
          );
          break;
        }

        if (shouldDedupeCreateShift(workingShifts, action, scheduleState.unitId)) {
          continue;
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

        const timeValidation = validateTimeRange(
          action.newStartTime,
          action.newEndTime
        );
        if (!timeValidation.ok) {
          recordFailure(
            {
              code: timeValidation.reason,
              message:
                timeValidation.reason === 'invalid_time_format'
                  ? 'moveShift action has an invalid time format.'
                  : 'moveShift action has an invalid time range.',
              actionIndex: index,
              actionType,
              preview,
            },
            new Error('Invalid moveShift time.')
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
        if (target.userId !== action.userId) {
          recordFailure(
            {
              code: 'user_mismatch',
              message: `Shift ${action.shiftId} belongs to a different user.`,
              actionIndex: index,
              actionType,
              preview,
            },
            new Error(`Shift ${action.shiftId} belongs to a different user.`)
          );
          break;
        }
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

  if (effects.length === 0) {
    return {
      status: 'noop',
      nextScheduleState: scheduleState,
      effects: [],
      errors: [],
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
