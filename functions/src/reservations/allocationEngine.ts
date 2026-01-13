import { createHash } from 'crypto';

export type AllocationDecisionStatus = 'accepted' | 'rejected' | 'needs_override';

export type AllocationReasonCode =
  | 'INVALID_INPUT'
  | 'OUTSIDE_BOOKABLE_WINDOW'
  | 'CAPACITY_FULL'
  | 'CAPACITY_AVAILABLE'
  | 'OVERRIDE_ACCEPT'
  | 'OVERRIDE_REJECT';

export interface AllocationOverrideDecision {
  decision: 'accept' | 'reject';
  reasonCode?: AllocationReasonCode | null;
  source?: string | null;
}

export interface AllocationCapacitySnapshot {
  currentCount: number;
  limit?: number | null;
}

export interface AllocationEngineInput {
  unitId: string;
  dateKey?: string | null;
  startTime: Date;
  endTime: Date;
  partySize: number;
  capacitySnapshot: AllocationCapacitySnapshot;
  settings?: {
    bookableWindow?: { from: string; to: string } | null;
  } | null;
  overrides?: AllocationOverrideDecision | null;
  traceId?: string | null;
}

export interface AllocationDecision {
  status: AllocationDecisionStatus;
  reasonCode: AllocationReasonCode;
  capacityKey: string;
  assignedZoneId?: string | null;
  assignedTableGroupId?: string | null;
}

export interface AllocationAuditLog {
  unitId: string;
  dateKey: string;
  traceId: string;
  reservationId?: string | null;
  inputSummary: {
    startTimeISO: string;
    endTimeISO: string;
    partySize: number;
  };
  ruleApplied: 'validation' | 'hours' | 'override' | 'auto' | 'fallback';
  outcome: {
    status: AllocationDecisionStatus;
    reasonCode: AllocationReasonCode;
  };
  capacityBefore: {
    currentCount: number;
    limit: number | null;
  };
  capacityAfter?: {
    totalCount: number;
  };
  overrideUsed: boolean;
  overrideSource?: string | null;
}

export interface AllocationCapacityEffects {
  incrementTotal: number;
  nextTotal: number;
}

export interface AllocationDecisionResult {
  decision: AllocationDecision;
  auditLog: AllocationAuditLog;
  capacityEffects: AllocationCapacityEffects;
}

const makeDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const asTimeMinutes = (value: string) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const isWithinBookableWindow = (
  startTime: Date,
  window?: { from: string; to: string } | null
) => {
  if (!window?.from || !window.to) {
    return true;
  }
  const fromMinutes = asTimeMinutes(window.from);
  const toMinutes = asTimeMinutes(window.to);
  if (fromMinutes === null || toMinutes === null) {
    return true;
  }
  const timeMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  if (fromMinutes === toMinutes) {
    return false;
  }
  if (fromMinutes < toMinutes) {
    return timeMinutes >= fromMinutes && timeMinutes < toMinutes;
  }
  return timeMinutes >= fromMinutes || timeMinutes < toMinutes;
};

const buildStableTraceId = (input: {
  unitId: string;
  dateKey: string;
  startTimeISO: string;
  endTimeISO: string;
  partySize: number;
}) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);

export const decideAllocation = (input: AllocationEngineInput): AllocationDecisionResult => {
  const dateKey = input.dateKey || makeDateKey(input.startTime);
  const capacityLimit =
    typeof input.capacitySnapshot.limit === 'number'
      ? input.capacitySnapshot.limit
      : null;
  const capacityBefore = {
    currentCount: input.capacitySnapshot.currentCount,
    limit: capacityLimit,
  };
  const startTimeMs = input.startTime?.getTime?.() ?? Number.NaN;
  const endTimeMs = input.endTime?.getTime?.() ?? Number.NaN;
  const inputSummary = {
    startTimeISO: Number.isNaN(startTimeMs) ? '' : input.startTime.toISOString(),
    endTimeISO: Number.isNaN(endTimeMs) ? '' : input.endTime.toISOString(),
    partySize: input.partySize,
  };
  const traceId = input.traceId || buildStableTraceId({
    unitId: input.unitId,
    dateKey,
    ...inputSummary,
  });

  const buildResult = (
    status: AllocationDecisionStatus,
    reasonCode: AllocationReasonCode,
    ruleApplied: AllocationAuditLog['ruleApplied'],
    overrideUsed: boolean,
    overrideSource?: string | null
  ): AllocationDecisionResult => {
    const decision: AllocationDecision = {
      status,
      reasonCode,
      capacityKey: dateKey,
      assignedZoneId: null,
      assignedTableGroupId: null,
    };

    const nextTotal =
      status === 'accepted'
        ? capacityBefore.currentCount + input.partySize
        : capacityBefore.currentCount;

    const auditLog: AllocationAuditLog = {
      unitId: input.unitId,
      dateKey,
      traceId,
      reservationId: null,
      inputSummary,
      ruleApplied,
      outcome: { status, reasonCode },
      capacityBefore,
      ...(status === 'accepted' ? { capacityAfter: { totalCount: nextTotal } } : {}),
      overrideUsed,
      overrideSource: overrideSource ?? null,
    };

    return {
      decision,
      auditLog,
      capacityEffects: {
        incrementTotal: status === 'accepted' ? input.partySize : 0,
        nextTotal,
      },
    };
  };

  if (!input.unitId || !dateKey || !Number.isFinite(input.partySize)) {
    return buildResult('rejected', 'INVALID_INPUT', 'validation', false);
  }
  if (
    !input.startTime ||
    Number.isNaN(startTimeMs) ||
    !input.endTime ||
    Number.isNaN(endTimeMs) ||
    endTimeMs <= startTimeMs
  ) {
    return buildResult('rejected', 'INVALID_INPUT', 'validation', false);
  }
  if (input.partySize <= 0) {
    return buildResult('rejected', 'INVALID_INPUT', 'validation', false);
  }
  if (!isWithinBookableWindow(input.startTime, input.settings?.bookableWindow)) {
    return buildResult('rejected', 'OUTSIDE_BOOKABLE_WINDOW', 'hours', false);
  }

  if (input.overrides?.decision === 'accept') {
    return buildResult(
      'accepted',
      input.overrides.reasonCode ?? 'OVERRIDE_ACCEPT',
      'override',
      true,
      input.overrides.source ?? null
    );
  }
  if (input.overrides?.decision === 'reject') {
    return buildResult(
      'rejected',
      input.overrides.reasonCode ?? 'OVERRIDE_REJECT',
      'override',
      true,
      input.overrides.source ?? null
    );
  }

  const nextTotal = capacityBefore.currentCount + input.partySize;
  if (typeof capacityLimit === 'number' && nextTotal > capacityLimit) {
    return buildResult('rejected', 'CAPACITY_FULL', 'auto', false);
  }

  return buildResult('accepted', 'CAPACITY_AVAILABLE', 'auto', false);
};
