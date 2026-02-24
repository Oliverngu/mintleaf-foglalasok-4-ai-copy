import { FirebaseError } from 'firebase/app';
import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../firebase/config';

export interface ReservationOverridePayload {
  forcedZoneId?: string | null;
  forcedTableIds?: string[] | null;
  note?: string | null;
}

export interface ReservationOverride extends ReservationOverridePayload {
  updatedAt?: Timestamp;
  updatedBy?: string;
}

const buildCallablePayload = (payload: ReservationOverridePayload) => {
  const callablePayload: ReservationOverridePayload = {};

  if (payload.forcedZoneId === null) {
    callablePayload.forcedZoneId = null;
  } else if (typeof payload.forcedZoneId === 'string') {
    const trimmed = payload.forcedZoneId.trim();
    if (trimmed) {
      callablePayload.forcedZoneId = trimmed;
    }
  }

  if (payload.note === null) {
    callablePayload.note = null;
  } else if (typeof payload.note === 'string') {
    const trimmed = payload.note.trim();
    if (trimmed) {
      callablePayload.note = trimmed;
    }
  }

  if (payload.forcedTableIds === null) {
    callablePayload.forcedTableIds = null;
  } else if (Array.isArray(payload.forcedTableIds)) {
    const ids = payload.forcedTableIds
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean);
    if (ids.length) {
      callablePayload.forcedTableIds = ids;
    }
  }

  return callablePayload;
};

export const getOverride = async (
  unitId: string,
  reservationId: string
): Promise<ReservationOverride | null> => {
  const ref = doc(db, 'units', unitId, 'reservation_overrides', reservationId);
  try {
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as ReservationOverride;
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.error('[reservationOverridesService] permission-denied on get', error);
    }
    throw error;
  }
};

export const setOverride = async (
  unitId: string,
  reservationId: string,
  payload: ReservationOverridePayload
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  try {
    const callable = httpsCallable(functions, 'adminSetReservationOverride');
    await callable({
      unitId,
      reservationId,
      payload: buildCallablePayload(payload),
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.error('[reservationOverridesService] permission-denied on set', error);
    }
    throw error;
  }
};

export const clearOverride = async (
  unitId: string,
  reservationId: string
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }
  try {
    const callable = httpsCallable(functions, 'adminClearReservationOverride');
    await callable({ unitId, reservationId });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.error('[reservationOverridesService] permission-denied on delete', error);
    }
    throw error;
  }
};
