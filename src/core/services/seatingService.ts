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

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(tag => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
};

const normalizeZone = (raw: unknown, idFallback?: string): Zone => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const priorityValue =
    typeof data.priority === 'number' && !Number.isNaN(data.priority)
      ? data.priority
      : 1000;
  const type =
    data.type === 'bar' || data.type === 'outdoor' || data.type === 'table' || data.type === 'other'
      ? data.type
      : undefined;
  return {
    id: typeof data.id === 'string' ? data.id : idFallback || '',
    name: typeof data.name === 'string' ? data.name : '',
    priority: priorityValue,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    isEmergency: typeof data.isEmergency === 'boolean' ? data.isEmergency : undefined,
    tags: normalizeTags(data.tags),
    type,
    createdAt: data.createdAt as Zone['createdAt'],
    updatedAt: data.updatedAt as Zone['updatedAt'],
  };
};

const normalizeTable = (raw: unknown, idFallback?: string): Table => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const canCombine =
    typeof data.canCombine === 'boolean'
      ? data.canCombine
      : typeof data.isCombinable === 'boolean'
      ? data.isCombinable
      : false;
  return {
    id: typeof data.id === 'string' ? data.id : idFallback || '',
    name: typeof data.name === 'string' ? data.name : '',
    zoneId: typeof data.zoneId === 'string' ? data.zoneId : '',
    capacityMax: typeof data.capacityMax === 'number' ? data.capacityMax : 0,
    minCapacity: typeof data.minCapacity === 'number' ? data.minCapacity : 0,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    tableGroup: typeof data.tableGroup === 'string' ? data.tableGroup : undefined,
    tags: normalizeTags(data.tags),
    floorplanId: typeof data.floorplanId === 'string' ? data.floorplanId : undefined,
    shape: data.shape as Table['shape'],
    w: data.w as Table['w'],
    h: data.h as Table['h'],
    radius: data.radius as Table['radius'],
    snapToGrid: data.snapToGrid as Table['snapToGrid'],
    locked: data.locked as Table['locked'],
    x: data.x as Table['x'],
    y: data.y as Table['y'],
    rot: data.rot as Table['rot'],
    canSeatSolo: data.canSeatSolo as Table['canSeatSolo'],
    canCombine,
    createdAt: data.createdAt as Table['createdAt'],
    updatedAt: data.updatedAt as Table['updatedAt'],
  };
};

export const listZones = async (unitId: string): Promise<Zone[]> => {
  const zonesRef = collection(db, 'units', unitId, 'zones');
  const snapshot = await getDocs(query(zonesRef, where('isActive', '==', true)));
  return snapshot.docs
    .map(docSnap => normalizeZone(docSnap.data(), docSnap.id))
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
  const tables = snapshot.docs.map(docSnap => normalizeTable(docSnap.data(), docSnap.id));
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
