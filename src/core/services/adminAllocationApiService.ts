import { auth } from '../firebase/config';

export type AllocationOverridePayload = {
  enabled: boolean;
  timeSlot?: string | null;
  zoneId?: string | null;
  tableGroup?: string | null;
  tableIds?: string[] | null;
  note?: string | null;
};

export type AutoAllocateDayMode = 'apply' | 'dryRun';

export type AutoAllocateDayResult = {
  ok: true;
  unitId: string;
  dateKey: string;
  mode: AutoAllocateDayMode;
  totals: {
    scanned: number;
    processed: number;
    updated: number;
    skipped: number;
    skippedLocked: number;
    skippedOverride: number;
    skippedReservationOverrides: number;
    noFit: number;
    conflicts: number;
  };
  items: Array<{
    bookingId: string;
    status:
      | 'updated'
      | 'dryRun'
      | 'skipped_locked'
      | 'skipped_override'
      | 'skipped_reservation_overrides'
      | 'skipped_invalid'
      | 'error';
    reason?: string;
    selectedZoneId?: string | null;
    selectedTableIds?: string[];
    diagnostics?: { conflict?: boolean; noFit?: boolean };
  }>;
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

export const triggerAutoAllocateDay = async ({
  unitId,
  dateKey,
  mode,
  force = false,
}: {
  unitId: string;
  dateKey: string;
  mode: AutoAllocateDayMode;
  force?: boolean;
}): Promise<AutoAllocateDayResult> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHENTICATED');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/adminTriggerAutoAllocateDay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      unitId,
      dateKey,
      mode,
      force,
    }),
  });

  if (!response.ok) {
    const error = new Error('AUTO_ALLOCATE_FAILED');
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
};
