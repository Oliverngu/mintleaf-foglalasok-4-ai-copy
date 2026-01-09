import { auth } from '../firebase/config';

export type OverrideDailyCapacityResult = {
  status: 'UPDATED' | 'OVERBOOKED';
  count: number;
  limit: number;
};

export type RecalcReservationCapacityResult = {
  ok: true;
  totalCount: number;
};

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  'https://europe-west3-mintleaf-74d27.cloudfunctions.net';

export const overrideDailyCapacity = async (
  unitId: string,
  dateKey: string,
  newLimit: number
): Promise<OverrideDailyCapacityResult> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/adminOverrideDailyCapacity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      unitId,
      dateKey,
      newLimit,
    }),
  });

  if (!response.ok) {
    const error = new Error('OVERRIDE_FAILED');
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
};

export const recalcReservationCapacityDay = async (
  unitId: string,
  dateKey: string
): Promise<RecalcReservationCapacityResult> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/adminRecalcReservationCapacityDay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      unitId,
      dateKey,
    }),
  });

  if (!response.ok) {
    const error = new Error('RECALC_FAILED');
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
};
