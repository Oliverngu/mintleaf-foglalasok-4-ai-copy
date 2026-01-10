import { FirebaseError } from 'firebase/app';
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

export interface ReservationOverridePayload {
  forcedZoneId?: string;
  forcedTableIds?: string[];
  note?: string;
}

export interface ReservationOverride extends ReservationOverridePayload {
  updatedAt?: Timestamp;
  updatedBy?: string;
}

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
  const ref = doc(db, 'units', unitId, 'reservation_overrides', reservationId);
  try {
    await setDoc(
      ref,
      {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true }
    );
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
  const ref = doc(db, 'units', unitId, 'reservation_overrides', reservationId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      console.error('[reservationOverridesService] permission-denied on delete', error);
    }
    throw error;
  }
};
