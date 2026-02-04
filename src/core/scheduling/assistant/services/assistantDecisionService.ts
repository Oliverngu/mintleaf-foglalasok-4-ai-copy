import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { EngineShift, Suggestion } from '../../engine/types.js';
import { formatDateKey, toTimeString } from '../../engine/timeUtils.js';
import type { AssistantSuggestion } from '../response/types.js';
import { applySuggestion } from '../apply/applySuggestion.js';
import type { ApplyEffect, ApplyError, ScheduleState } from '../apply/applySuggestion.js';
import { db } from '../../../firebase/config.js';
import { sanitizeFirestoreData } from '../../../../lib/sanitizeFirestoreData.js';

type SignatureMeta = Pick<
  NonNullable<AssistantSuggestion['meta']>,
  | 'signatureVersion'
  | 'signatureHash'
  | 'signatureHashFormat'
  | 'signaturePreview'
  | 'signatureDegraded'
  | 'signatureDegradeReason'
  | 'signatureDegradeActionType'
  | 'v1SuggestionId'
>;

export type AcceptSuggestionRequest = {
  unitId: string;
  suggestionId: string;
  suggestion: Suggestion;
  actorId?: string;
  reason?: string;
  signatureMeta?: SignatureMeta;
};

export type RejectSuggestionRequest = {
  unitId: string;
  suggestionId: string;
  actorId?: string;
  reason?: string;
  signatureMeta?: SignatureMeta;
};

export type AcceptSuggestionResponse = {
  status: 'applied' | 'noop' | 'failed';
  effects: ApplyEffect[];
  errors: ApplyError[];
  alreadyApplied: boolean;
};

export type RejectSuggestionResponse = {
  status: 'rejected';
};

type StoredShift = {
  id: string;
  userId: string;
  userName?: string;
  unitId?: string;
  position?: string;
  start?: Timestamp | null;
  end?: Timestamp | null;
  status?: 'draft' | 'published';
  isDayOff?: boolean;
  isHighlighted?: boolean;
  dayKey?: string;
  note?: string;
};

type PositionRecord = { id: string; name?: string };
type UserRecord = { id: string; fullName?: string };

type AppliedLedgerRecord = {
  suggestionId: string;
  appliedAt: unknown;
  unitId: string;
  effects: {
    createShift: number;
    moveShift: number;
  };
  signatureMeta?: SignatureMeta;
};

type DecisionRecord = {
  suggestionId: string;
  decision: 'accepted' | 'rejected';
  source: 'user';
  actorId?: string;
  reason?: string;
  createdAt: unknown;
  signatureMeta?: SignatureMeta;
};

type ApplyFailureRecord = {
  suggestionId: string;
  unitId: string;
  createdAt: unknown;
  errors: ApplyError[];
  signatureMeta?: SignatureMeta;
};

export type AssistantDecisionStore = {
  listShifts: (unitId: string) => Promise<StoredShift[]>;
  listPositions?: () => Promise<PositionRecord[]>;
  getUser?: (userId: string) => Promise<UserRecord | null>;
  getAppliedLedger: (unitId: string, suggestionId: string) => Promise<AppliedLedgerRecord | null>;
  runTransaction: <T>(
    fn: (tx: AssistantDecisionTransaction) => Promise<T>
  ) => Promise<T>;
  logApplyFailure: (record: ApplyFailureRecord) => Promise<void>;
};

export type AssistantDecisionTransaction = {
  getAppliedLedger: (
    unitId: string,
    suggestionId: string
  ) => Promise<AppliedLedgerRecord | null>;
  setAppliedLedger: (
    unitId: string,
    suggestionId: string,
    record: AppliedLedgerRecord
  ) => Promise<void>;
  setDecision: (
    unitId: string,
    suggestionId: string,
    record: DecisionRecord
  ) => Promise<void>;
  setShift: (shiftId: string, payload: StoredShift) => Promise<void>;
  updateShift: (shiftId: string, payload: Partial<StoredShift>) => Promise<void>;
};

const buildShiftDateRange = (
  dateKey: string,
  startTime: string,
  endTime: string
): { start: Date; end: Date } => {
  const start = new Date(`${dateKey}T${startTime}:00`);
  const end = new Date(`${dateKey}T${endTime}:00`);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
};

const shiftToEngine = (shift: StoredShift): EngineShift | null => {
  const start = shift.start ? shift.start.toDate() : null;
  const end = shift.end ? shift.end.toDate() : null;
  const dateKey =
    start ? formatDateKey(start) : shift.dayKey || undefined;
  if (!dateKey) return null;
  return {
    id: shift.id,
    userId: shift.userId,
    unitId: shift.unitId,
    dateKey,
    startTime: start ? toTimeString(start) : null,
    endTime: end ? toTimeString(end) : null,
    positionId: shift.position,
    isDayOff: shift.isDayOff,
  };
};

const resolvePositionName = (
  positionId: string | undefined,
  positions: Map<string, string>
) => {
  if (!positionId) return undefined;
  return positions.get(positionId) || positionId;
};

const summarizeEffects = (effects: ApplyEffect[]) => ({
  createShift: effects.filter(effect => effect.type === 'createShift').length,
  moveShift: effects.filter(effect => effect.type === 'moveShift').length,
});

const buildDecisionRecord = (
  suggestionId: string,
  decision: 'accepted' | 'rejected',
  actorId: string | undefined,
  reason: string | undefined,
  signatureMeta?: SignatureMeta
): DecisionRecord => ({
  suggestionId,
  decision,
  source: 'user',
  actorId,
  reason,
  createdAt: serverTimestamp(),
  signatureMeta,
});

const buildLedgerRecord = (
  unitId: string,
  suggestionId: string,
  effects: ApplyEffect[],
  signatureMeta?: SignatureMeta
): AppliedLedgerRecord => ({
  suggestionId,
  unitId,
  appliedAt: serverTimestamp(),
  effects: summarizeEffects(effects),
  signatureMeta,
});

const buildFailureRecord = (
  unitId: string,
  suggestionId: string,
  errors: ApplyError[],
  signatureMeta?: SignatureMeta
): ApplyFailureRecord => ({
  suggestionId,
  unitId,
  createdAt: serverTimestamp(),
  errors,
  signatureMeta,
});

const buildFirestoreStore = (): AssistantDecisionStore => ({
  listShifts: async (unitId: string) => {
    const shiftsQuery = query(
      collection(db, 'shifts'),
      where('unitId', '==', unitId)
    );
    const snapshot = await getDocs(shiftsQuery);
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<StoredShift, 'id'>),
    }));
  },
  listPositions: async () => {
    const snapshot = await getDocs(collection(db, 'positions'));
    return snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<PositionRecord, 'id'>),
    }));
  },
  getUser: async (userId: string) => {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return null;
    return { id: userSnap.id, ...(userSnap.data() as Omit<UserRecord, 'id'>) };
  },
  getAppliedLedger: async (unitId: string, suggestionId: string) => {
    const ledgerSnap = await getDoc(
      doc(db, 'units', unitId, 'assistantApplied', suggestionId)
    );
    if (!ledgerSnap.exists()) return null;
    return ledgerSnap.data() as AppliedLedgerRecord;
  },
  runTransaction: async fn =>
    runTransaction(db, async tx => {
      const transaction: AssistantDecisionTransaction = {
        getAppliedLedger: async (unitId, suggestionId) => {
          const ledgerSnap = await tx.get(
            doc(db, 'units', unitId, 'assistantApplied', suggestionId)
          );
          return ledgerSnap.exists()
            ? (ledgerSnap.data() as AppliedLedgerRecord)
            : null;
        },
        setAppliedLedger: async (unitId, suggestionId, record) => {
          tx.set(
            doc(db, 'units', unitId, 'assistantApplied', suggestionId),
            sanitizeFirestoreData(record)
          );
        },
        setDecision: async (unitId, suggestionId, record) => {
          tx.set(
            doc(db, 'units', unitId, 'assistantDecisions', suggestionId),
            sanitizeFirestoreData(record),
            { merge: true }
          );
        },
        setShift: async (shiftId, payload) => {
          tx.set(doc(db, 'shifts', shiftId), sanitizeFirestoreData(payload));
        },
        updateShift: async (shiftId, payload) => {
          tx.update(doc(db, 'shifts', shiftId), sanitizeFirestoreData(payload));
        },
      };
      return fn(transaction);
    }),
  logApplyFailure: async record => {
    await addDoc(
      collection(db, 'units', record.unitId, 'assistantApplyFailures'),
      sanitizeFirestoreData(record)
    );
  },
});

const buildPositionMap = async (
  store: AssistantDecisionStore
): Promise<Map<string, string>> => {
  if (!store.listPositions) return new Map();
  const positions = await store.listPositions();
  return new Map(
    positions.map(position => [position.id, position.name || position.id])
  );
};

const buildUserNameLookup = async (
  store: AssistantDecisionStore,
  effects: ApplyEffect[]
): Promise<Map<string, string>> => {
  if (!store.getUser) return new Map();
  const userIds = Array.from(
    new Set(
      effects
        .filter(effect => effect.type === 'createShift')
        .map(effect => effect.userId)
    )
  );
  const entries = await Promise.all(
    userIds.map(async userId => {
      const user = await store.getUser?.(userId);
      return [userId, user?.fullName || userId] as const;
    })
  );
  return new Map(entries);
};

const applyEffectsToFirestore = async (
  tx: AssistantDecisionTransaction,
  unitId: string,
  effects: ApplyEffect[],
  positions: Map<string, string>,
  usersById: Map<string, string>
) => {
  for (const effect of effects) {
    if (effect.type === 'moveShift') {
      const { start, end } = buildShiftDateRange(
        effect.dateKey,
        effect.newStartTime,
        effect.newEndTime
      );
      const payload: Partial<StoredShift> = {
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        dayKey: effect.dateKey,
        unitId,
      };
      if (effect.positionId) {
        payload.position = resolvePositionName(effect.positionId, positions);
      }
      await tx.updateShift(effect.shiftId, payload);
      continue;
    }

    const { start, end } = buildShiftDateRange(
      effect.dateKey,
      effect.startTime,
      effect.endTime
    );
    const positionName = resolvePositionName(effect.positionId, positions);
    const userName = usersById.get(effect.userId) || effect.userId;
    const payload: StoredShift = {
      id: effect.shiftId,
      userId: effect.userId,
      userName,
      unitId,
      position: positionName || 'N/A',
      start: Timestamp.fromDate(start),
      end: Timestamp.fromDate(end),
      status: 'draft',
      isDayOff: false,
      isHighlighted: false,
      dayKey: effect.dateKey,
      note: '',
    };
    await tx.setShift(effect.shiftId, payload);
  }
};

export const acceptSuggestion = async (
  request: AcceptSuggestionRequest,
  store: AssistantDecisionStore = buildFirestoreStore()
): Promise<AcceptSuggestionResponse> => {
  const { unitId, suggestionId, suggestion, actorId, reason, signatureMeta } =
    request;

  const existingLedger = await store.getAppliedLedger(unitId, suggestionId);
  if (existingLedger) {
    await store.runTransaction(async tx => {
      await tx.setDecision(
        unitId,
        suggestionId,
        buildDecisionRecord(
          suggestionId,
          'accepted',
          actorId,
          reason,
          signatureMeta
        )
      );
    });
    return {
      status: 'noop',
      effects: [],
      errors: [],
      alreadyApplied: true,
    };
  }

  const shifts = await store.listShifts(unitId);
  const engineShifts = shifts
    .map(shiftToEngine)
    .filter((shift): shift is EngineShift => shift !== null);

  const scheduleState: ScheduleState = {
    unitId,
    shifts: engineShifts,
  };

  const applyResult = applySuggestion({
    suggestionId,
    suggestion,
    scheduleState,
  });

  if (applyResult.status === 'failed') {
    await store.logApplyFailure(
      buildFailureRecord(unitId, suggestionId, applyResult.errors, signatureMeta)
    );
    return {
      status: 'failed',
      effects: [],
      errors: applyResult.errors,
      alreadyApplied: false,
    };
  }

  const positions = await buildPositionMap(store);
  const usersById = await buildUserNameLookup(store, applyResult.effects);

  const alreadyApplied = await store.runTransaction(async tx => {
    const ledger = await tx.getAppliedLedger(unitId, suggestionId);
    const decisionRecord = buildDecisionRecord(
      suggestionId,
      'accepted',
      actorId,
      reason,
      signatureMeta
    );

    if (ledger) {
      await tx.setDecision(unitId, suggestionId, decisionRecord);
      return true;
    }

    await applyEffectsToFirestore(
      tx,
      unitId,
      applyResult.effects,
      positions,
      usersById
    );

    await tx.setAppliedLedger(
      unitId,
      suggestionId,
      buildLedgerRecord(unitId, suggestionId, applyResult.effects, signatureMeta)
    );
    await tx.setDecision(unitId, suggestionId, decisionRecord);
    return false;
  });

  if (alreadyApplied) {
    return {
      status: 'noop',
      effects: [],
      errors: [],
      alreadyApplied: true,
    };
  }

  return {
    status: applyResult.effects.length === 0 ? 'noop' : 'applied',
    effects: applyResult.effects,
    errors: [],
    alreadyApplied: false,
  };
};

export const rejectSuggestion = async (
  request: RejectSuggestionRequest,
  store: AssistantDecisionStore = buildFirestoreStore()
): Promise<RejectSuggestionResponse> => {
  const { unitId, suggestionId, actorId, reason, signatureMeta } = request;
  await store.runTransaction(async tx => {
    await tx.setDecision(
      unitId,
      suggestionId,
      buildDecisionRecord(
        suggestionId,
        'rejected',
        actorId,
        reason,
        signatureMeta
      )
    );
  });

  return { status: 'rejected' };
};
