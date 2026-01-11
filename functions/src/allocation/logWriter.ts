import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { logger } from 'firebase-functions/v2';
import { AllocationSnapshot, SeatingSettingsDoc } from './types';

export const writeAllocationDecisionLogForBooking = async ({
  unitId,
  bookingId,
  startDate,
  endDate,
  partySize,
  selectedZoneId,
  selectedTableIds,
  reason,
  allocationMode,
  allocationStrategy,
  snapshot,
  algoVersion,
  source,
}: {
  unitId: string;
  bookingId: string;
  startDate: Date;
  endDate: Date;
  partySize: number;
  selectedZoneId: string | null;
  selectedTableIds: string[];
  reason: string;
  allocationMode: SeatingSettingsDoc['allocationMode'] | null;
  allocationStrategy: SeatingSettingsDoc['allocationStrategy'] | null;
  snapshot: AllocationSnapshot | null;
  algoVersion: string;
  source: string;
}) => {
  const db = admin.firestore();
  const docId = bookingId;
  const eventIdSource = [
    unitId,
    bookingId,
    startDate.toISOString(),
    endDate.toISOString(),
    String(partySize),
    allocationMode ?? '',
    allocationStrategy ?? '',
    reason ?? '',
    selectedZoneId ?? '',
    selectedTableIds.join(','),
    algoVersion,
  ].join('|');
  const eventId = createHash("sha256").update(eventIdSource).digest("hex");

  const ref = db.collection('units').doc(unitId).collection('allocation_logs').doc(docId);
  const existing = await ref.get();
  const basePayload = {
    type: 'decision',
    bookingId,
    bookingStartTime: admin.firestore.Timestamp.fromDate(startDate),
    bookingEndTime: admin.firestore.Timestamp.fromDate(endDate),
    partySize,
    selectedZoneId,
    selectedTableIds,
    reason,
    allocationMode,
    allocationStrategy,
    snapshot,
    algoVersion,
    source,
    eventId,
  };

  if (!existing.exists) {
    await ref.set(
      {
        ...basePayload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: false }
    );
  } else {
    await ref.set(
      {
        ...basePayload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  logger.info('writeAllocationDecisionLogForBooking ok', { unitId, bookingId, eventId });

  return { docId, eventId };
};
