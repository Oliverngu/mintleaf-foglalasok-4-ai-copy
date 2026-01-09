import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Table, Zone } from '../models/data';

interface SeatingUpdatePayload {
  zoneId: string | null;
  assignedTableIds: string[];
}

export const listZones = async (unitId: string): Promise<Zone[]> => {
  const zonesRef = collection(db, 'units', unitId, 'zones');
  const snapshot = await getDocs(query(zonesRef, where('isActive', '==', true)));
  return snapshot.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Zone))
    .sort((a, b) => {
      const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
      const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
};

export const listTables = async (unitId: string, zoneId?: string): Promise<Table[]> => {
  const tablesRef = collection(db, 'units', unitId, 'tables');
  const snapshot = await getDocs(query(tablesRef, where('isActive', '==', true)));
  const tables = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Table));
  return tables
    .filter(table => (zoneId ? table.zoneId === zoneId : true))
    .sort((a, b) => {
      const zoneCompare = (a.zoneId ?? '').localeCompare(b.zoneId ?? '');
      if (zoneCompare !== 0) {
        return zoneCompare;
      }
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
};

export const updateReservationSeating = async (
  unitId: string,
  reservationId: string,
  payload: SeatingUpdatePayload
): Promise<void> => {
  const { zoneId, assignedTableIds } = payload;
  if (!zoneId && assignedTableIds.length) {
    throw new Error('INVALID_TABLE_SELECTION');
  }
  const tableSnapshots = await Promise.all(
    assignedTableIds.map(tableId =>
      getDoc(doc(db, 'units', unitId, 'tables', tableId))
    )
  );

  const invalidTable = tableSnapshots.find(
    tableSnap => !tableSnap.exists() || tableSnap.data()?.isActive !== true
  );
  if (invalidTable) {
    throw new Error('INVALID_TABLE_SELECTION');
  }

  let zoneName = '-';
  if (zoneId) {
    const zoneSnap = await getDoc(doc(db, 'units', unitId, 'zones', zoneId));
    if (!zoneSnap.exists() || zoneSnap.data()?.isActive !== true) {
      throw new Error('INVALID_TABLE_SELECTION');
    }
    const mismatchedTable = tableSnapshots.find(
      tableSnap => tableSnap.data()?.zoneId !== zoneId
    );
    if (mismatchedTable) {
      throw new Error('INVALID_TABLE_SELECTION');
    }
    zoneName = zoneSnap.data()?.name ?? '-';
  }
  const tableNames = tableSnapshots
    .map(tableSnap => tableSnap.data()?.name)
    .filter(Boolean)
    .join(', ');

  await updateDoc(doc(db, 'units', unitId, 'reservations', reservationId), {
    zoneId: zoneId ?? null,
    assignedTableIds,
    seatingSource: 'manual',
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'units', unitId, 'reservation_logs'), {
    unitId,
    bookingId: reservationId,
    type: 'admin_seating_updated',
    message: `Zóna: ${zoneName}, Asztalok: ${tableNames || '-'}`,
    source: 'admin',
    createdAt: serverTimestamp(),
  });
};
