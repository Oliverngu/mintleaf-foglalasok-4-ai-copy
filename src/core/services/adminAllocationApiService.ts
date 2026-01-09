import { auth } from '../firebase/config';

export type AllocationOverridePayload = {
  enabled: boolean;
  timeSlot?: string | null;
  zoneId?: string | null;
  tableGroup?: string | null;
  tableIds?: string[] | null;
  note?: string | null;
};

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  'https://europe-west3-mintleaf-74d27.cloudfunctions.net';

export const setReservationAllocationOverride = async (
  unitId: string,
  reservationId: string,
  override: AllocationOverridePayload
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(
    `${FUNCTIONS_BASE_URL}/adminSetReservationAllocationOverride`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        unitId,
        reservationId,
        override,
      }),
    }
  );

  if (!response.ok) {
    const error = new Error('OVERRIDE_FAILED');
    (error as any).status = response.status;
    throw error;
  }
};
