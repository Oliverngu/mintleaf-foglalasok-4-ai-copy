import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { AllocationSnapshot, SeatingSettingsDoc } from './types';

export const ALLOCATION_LOG_ALGO_VERSION = 'alloc-v1';
export const ALLOCATION_LOG_SOURCES = {
  bookingSubmit: 'bookingSubmit',
  bookingModify: 'bookingModify',
  adminCallable: 'adminCallable',
  adminManual: 'adminManual',
  adminBatch: 'adminBatch',
  seatingSuggestionService: 'seatingSuggestionService',
  unknown: 'unknown',
} as const;

const normalizeLogId = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizeLogTableIds = (tableIds: string[]) =>
  Array.from(
    new Set(
      tableIds
        .filter((tableId): tableId is string => typeof tableId === 'string')
        .map(tableId => tableId.trim())
        .filter(Boolean)
    )
  );

const normalizeLogMode = (mode: SeatingSettingsDoc['allocationMode'] | null) =>
  mode === 'capacity' || mode === 'floorplan' || mode === 'hybrid' ? mode : null;

const normalizeLogStrategy = (strategy: SeatingSettingsDoc['allocationStrategy'] | null) =>
  strategy === 'bestFit' || strategy === 'minWaste' || strategy === 'priorityZoneFirst'
    ? strategy
    : null;

const allowedSources = new Set(Object.values(ALLOCATION_LOG_SOURCES));
const normalizeLogSource = (source: string | null | undefined) => {
  if (typeof source !== 'string') return ALLOCATION_LOG_SOURCES.unknown;
  const trimmed = source.trim();
  if (!trimmed) return ALLOCATION_LOG_SOURCES.unknown;
  return allowedSources.has(trimmed) ? trimmed : ALLOCATION_LOG_SOURCES.unknown;
};

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
  const db = getFirestore();
  const docId = bookingId;
  const normalizedReason = reason?.trim() ? reason.trim() : 'UNKNOWN';
  const normalizedZoneId = normalizeLogId(selectedZoneId);
  const normalizedTableIds = normalizeLogTableIds(selectedTableIds);
  const normalizedMode = normalizeLogMode(allocationMode);
  const normalizedStrategy = normalizeLogStrategy(allocationStrategy);
  const normalizedSource = normalizeLogSource(source);
  const normalizedAlgo = typeof algoVersion === 'string' && algoVersion.trim()
    ? algoVersion.trim()
    : ALLOCATION_LOG_ALGO_VERSION;
  const eventIdSource = [
    unitId,
    bookingId,
    startDate.toISOString(),
    endDate.toISOString(),
    String(partySize),
    normalizedMode ?? '',
    normalizedStrategy ?? '',
    normalizedReason,
    normalizedZoneId ?? '',
    normalizedTableIds.join(','),
    normalizedAlgo,
  ].join('|');
  const eventId = createHash("sha256").update(eventIdSource).digest("hex");

  const ref = db.collection('units').doc(unitId).collection('allocation_logs').doc(docId);
  const existing = await ref.get();
  const basePayload = {
    type: 'decision',
    bookingId,
    bookingStartTime: Timestamp.fromDate(startDate),
    bookingEndTime: Timestamp.fromDate(endDate),
    partySize,
    selectedZoneId: normalizedZoneId,
    selectedTableIds: normalizedTableIds,
    reason: normalizedReason,
    allocationMode: normalizedMode,
    allocationStrategy: normalizedStrategy,
    snapshot,
    algoVersion: normalizedAlgo,
    source: normalizedSource,
    eventId,
  };

  if (!existing.exists) {
    await ref.set(
      {
        ...basePayload,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: false }
    );
  } else {
    await ref.set(
      {
        ...basePayload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  logger.info('writeAllocationDecisionLogForBooking ok', { unitId, bookingId, eventId });

  return { docId, eventId };
};
