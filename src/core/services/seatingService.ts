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

const normalizeSeatLayout = (value: unknown): Table['seatLayout'] | undefined => {
  const data = (value ?? {}) as { kind?: unknown; count?: unknown; sides?: unknown };
  if (data.kind === 'circle') {
    const count =
      typeof data.count === 'number' && Number.isFinite(data.count)
        ? Math.max(0, Math.round(data.count))
        : 0;
    return { kind: 'circle', count };
  }
  if (data.kind === 'rect') {
    const sides = (data.sides ?? {}) as {
      north?: unknown;
      east?: unknown;
      south?: unknown;
      west?: unknown;
    };
    const safeSide = (side: unknown) =>
      typeof side === 'number' && Number.isFinite(side) ? Math.max(0, Math.round(side)) : 0;
    return {
      kind: 'rect',
      sides: {
        north: safeSide(sides.north),
        east: safeSide(sides.east),
        south: safeSide(sides.south),
        west: safeSide(sides.west),
      },
    };
  }
  return undefined;
};

const normalizeTable = (raw: unknown, idFallback?: string): Table => {
  const data = (raw ?? {}) as Record<string, unknown>;
  const canCombine =
    typeof data.canCombine === 'boolean'
      ? data.canCombine
      : typeof data.isCombinable === 'boolean'
      ? data.isCombinable
      : false;
  const capacityMax =
    typeof data.capacityMax === 'number' && Number.isFinite(data.capacityMax)
      ? data.capacityMax
      : 0;
  const minCapacity =
    typeof data.minCapacity === 'number' && Number.isFinite(data.minCapacity)
      ? data.minCapacity
      : 0;
  const capacityTotalCandidate =
    typeof data.capacityTotal === 'number' && Number.isFinite(data.capacityTotal)
      ? Math.max(0, data.capacityTotal)
      : null;
  const capacityTotal =
    capacityTotalCandidate ??
    (capacityMax > 0 ? capacityMax : minCapacity > 0 ? minCapacity : 2);
  const rawSideCapacities = data.sideCapacities as
    | { north?: unknown; east?: unknown; south?: unknown; west?: unknown }
    | undefined;
  const parsedSides = {
    north:
      typeof rawSideCapacities?.north === 'number' &&
      Number.isFinite(rawSideCapacities.north)
        ? Math.max(0, rawSideCapacities.north)
        : undefined,
    east:
      typeof rawSideCapacities?.east === 'number' && Number.isFinite(rawSideCapacities.east)
        ? Math.max(0, rawSideCapacities.east)
        : undefined,
    south:
      typeof rawSideCapacities?.south === 'number' && Number.isFinite(rawSideCapacities.south)
        ? Math.max(0, rawSideCapacities.south)
        : undefined,
    west:
      typeof rawSideCapacities?.west === 'number' && Number.isFinite(rawSideCapacities.west)
        ? Math.max(0, rawSideCapacities.west)
        : undefined,
  };
  const hasAnySide = Object.values(parsedSides).some(value => typeof value === 'number');
  const fallbackNorth = Math.ceil(capacityTotal / 2);
  const fallbackSouth = Math.max(0, capacityTotal - fallbackNorth);
  const sideCapacities = hasAnySide
    ? {
        north: parsedSides.north ?? 0,
        east: parsedSides.east ?? 0,
        south: parsedSides.south ?? 0,
        west: parsedSides.west ?? 0,
      }
    : {
        north: fallbackNorth,
        east: 0,
        south: fallbackSouth,
        west: 0,
      };
  const rawCombinable = Array.isArray(data.combinableWithIds) ? data.combinableWithIds : [];
  const tableId = typeof data.id === 'string' ? data.id : idFallback || '';
  const combinableWithIds = Array.from(
    new Set(
      rawCombinable
        .filter(id => typeof id === 'string')
        .map(id => id.trim())
        .filter(Boolean)
    )
  ).filter(id => id !== tableId);
  const rawBaseCombo = data.baseCombo as
    | { groupId?: unknown; role?: unknown; memberIds?: unknown }
    | undefined;
  const baseComboGroupId =
    typeof rawBaseCombo?.groupId === 'string' ? rawBaseCombo.groupId : '';
  const baseComboRole =
    rawBaseCombo?.role === 'member' || rawBaseCombo?.role === 'aggregate'
      ? rawBaseCombo.role
      : undefined;
  const baseComboMemberIds = Array.isArray(rawBaseCombo?.memberIds)
    ? rawBaseCombo?.memberIds.filter(id => typeof id === 'string')
    : undefined;
  const baseCombo =
    baseComboGroupId && baseComboRole
      ? {
          groupId: baseComboGroupId,
          role: baseComboRole,
          ...(baseComboMemberIds ? { memberIds: baseComboMemberIds } : {}),
        }
      : undefined;
  return {
    id: tableId,
    name: typeof data.name === 'string' ? data.name : '',
    zoneId: typeof data.zoneId === 'string' ? data.zoneId : '',
    capacityMax,
    minCapacity,
    capacityTotal,
    sideCapacities,
    combinableWithIds,
    baseCombo,
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
    seatLayout: normalizeSeatLayout(data.seatLayout),
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
