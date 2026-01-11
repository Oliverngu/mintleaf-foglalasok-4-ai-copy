import * as admin from 'firebase-admin';
import { FloorplanTable, FloorplanZone, SeatingSettingsDoc, TableCombinationDoc } from './types';
import { normalizeTable, normalizeZone } from './normalize';

const getBufferMillis = (bufferMinutes?: number) => (bufferMinutes ?? 15) * 60 * 1000;

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA < endB && startB < endA;

export const fetchSeatingSettings = async (unitId: string, defaults: SeatingSettingsDoc) => {
  const db = admin.firestore();
  const settingsSnap = await db
    .collection('units')
    .doc(unitId)
    .collection('seating_settings')
    .doc('default')
    .get();
  return {
    ...defaults,
    ...(settingsSnap.exists ? (settingsSnap.data() as SeatingSettingsDoc) : {}),
  };
};

export const fetchSeatingEntities = async (unitId: string) => {
  const db = admin.firestore();
  const [zonesSnap, tablesSnap, combosSnap] = await Promise.all([
    db.collection('units').doc(unitId).collection('zones').get(),
    db.collection('units').doc(unitId).collection('tables').get(),
    db.collection('units').doc(unitId).collection('table_combinations').get(),
  ]);

  const zones = zonesSnap.docs
    .map(docSnap => normalizeZone(docSnap.data(), docSnap.id))
    .filter(zone => zone.isActive !== false);
  const tables = tablesSnap.docs
    .map(docSnap => normalizeTable(docSnap.data(), docSnap.id))
    .filter(table => table.isActive !== false);
  const combos = combosSnap.docs
    .map(
      docSnap =>
        ({
          id: docSnap.id,
          ...(docSnap.data() as Record<string, unknown>),
        }) as TableCombinationDoc
    )
    .filter(combo => combo.isActive !== false && Array.isArray(combo.tableIds));

  return { zones, tables, combos };
};

export const fetchTakenTableIds = async ({
  unitId,
  bookingId,
  startDate,
  endDate,
  bufferMinutes,
}: {
  unitId: string;
  bookingId: string;
  startDate: Date;
  endDate: Date;
  bufferMinutes?: number;
}) => {
  const db = admin.firestore();
  const bufferMillis = getBufferMillis(bufferMinutes);
  const startWithBuffer = new Date(startDate.getTime() - bufferMillis);
  const endWithBuffer = new Date(endDate.getTime() + bufferMillis);
  const windowStart = new Date(startWithBuffer.getTime() - 48 * 60 * 60 * 1000);

  // Firestore cannot query on endTime without composite indexes; constrain by startTime window
  // and compute overlaps in-memory (assumes reservations rarely exceed this lookback).
  const reservationSnapshot = await db
    .collection('units')
    .doc(unitId)
    .collection('reservations')
    .where('startTime', '>=', admin.firestore.Timestamp.fromDate(windowStart))
    .where('startTime', '<=', admin.firestore.Timestamp.fromDate(endWithBuffer))
    .get();

  const takenTableIds = new Set<string>();
  reservationSnapshot.docs.forEach(docSnap => {
    if (docSnap.id === bookingId) {
      return;
    }
    const data = docSnap.data() || {};
    if (data.status === 'cancelled') {
      return;
    }
    const start = data.startTime?.toDate?.();
    const end = data.endTime?.toDate?.();
    if (!start || !end) {
      return;
    }
    if (overlaps(startWithBuffer, endWithBuffer, start, end)) {
      const assigned = Array.isArray(data.assignedTableIds) ? data.assignedTableIds : [];
      assigned.forEach((tableId: string) => takenTableIds.add(tableId));
    }
  });

  return takenTableIds;
};
