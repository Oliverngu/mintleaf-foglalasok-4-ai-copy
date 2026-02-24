import { FirebaseError } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Floorplan, SeatingSettings, Table, TableCombination, Zone } from '../models/data';

const debugSeating =
  process.env.NODE_ENV !== 'production' ||
  (typeof window !== 'undefined' &&
    window.localStorage.getItem('mintleaf_debug_seating') === '1');

const seatingSettingsDefaults: SeatingSettings = {
  bufferMinutes: 15,
  defaultDurationMinutes: 120,
  allowGuestDurationEdit: true,
  holdTableMinutesOnLate: 15,
  maxCombineCount: 2,
  vipEnabled: true,
  soloAllowedTableIds: [],
  allocationEnabled: false,
  allocationMode: 'capacity',
  allocationStrategy: 'bestFit',
  defaultZoneId: '',
  zonePriority: [],
  overflowZones: [],
  allowCrossZoneCombinations: false,
  emergencyZones: {
    enabled: false,
    zoneIds: [],
    activeRule: 'always',
    weekdays: [],
  },
};

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
    isEmergency: typeof data.isEmergency === 'boolean' ? data.isEmergency : false,
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

const normalizeZoneCreateInput = (zone: Omit<Zone, 'id'>): Omit<Zone, 'id'> => {
  const priorityValue =
    typeof zone.priority === 'number' && !Number.isNaN(zone.priority)
      ? zone.priority
      : 1000;
  const type =
    zone.type === 'bar' || zone.type === 'outdoor' || zone.type === 'table' || zone.type === 'other'
      ? zone.type
      : undefined;
  return {
    ...zone,
    priority: priorityValue,
    tags: normalizeTags(zone.tags),
    ...(type ? { type } : {}),
  };
};

const normalizeZoneUpdatePatch = (zone: Partial<Zone>): Partial<Zone> => {
  const payload: Partial<Zone> = {};
  if ('name' in zone) {
    payload.name = zone.name;
  }
  if ('isActive' in zone) {
    payload.isActive = zone.isActive;
  }
  if ('isEmergency' in zone) {
    payload.isEmergency = zone.isEmergency;
  }
  if ('priority' in zone) {
    payload.priority =
      typeof zone.priority === 'number' && !Number.isNaN(zone.priority)
        ? zone.priority
        : 1000;
  }
  if ('tags' in zone) {
    payload.tags = normalizeTags(zone.tags);
  }
  if ('type' in zone) {
    const type =
      zone.type === 'bar' || zone.type === 'outdoor' || zone.type === 'table' || zone.type === 'other'
        ? zone.type
        : undefined;
    if (type) {
      payload.type = type;
    }
  }
  return payload;
};

const normalizeTableCreateInput = (table: Omit<Table, 'id'>): Omit<Table, 'id'> => {
  const canCombine =
    typeof table.canCombine === 'boolean'
      ? table.canCombine
      : typeof (table as { isCombinable?: boolean }).isCombinable === 'boolean'
      ? (table as { isCombinable?: boolean }).isCombinable
      : false;
  return {
    ...table,
    tags: normalizeTags(table.tags),
    canCombine,
  };
};

const normalizeTableUpdatePatch = (
  table: Partial<Table> & { isCombinable?: boolean }
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  if ('name' in table) {
    payload.name = table.name;
  }
  if ('zoneId' in table) {
    payload.zoneId = table.zoneId;
  }
  if ('capacityMax' in table) {
    payload.capacityMax = table.capacityMax;
  }
  if ('minCapacity' in table) {
    payload.minCapacity = table.minCapacity;
  }
  if ('isActive' in table) {
    payload.isActive = table.isActive;
  }
  if ('tableGroup' in table) {
    payload.tableGroup = table.tableGroup;
  }
  if ('tags' in table) {
    payload.tags = normalizeTags(table.tags);
  }
  if ('floorplanId' in table) {
    payload.floorplanId = table.floorplanId;
  }
  if ('shape' in table) {
    payload.shape = table.shape;
  }
  if ('w' in table) {
    payload.w = table.w;
  }
  if ('h' in table) {
    payload.h = table.h;
  }
  if ('radius' in table) {
    payload.radius = table.radius;
  }
  if ('snapToGrid' in table) {
    payload.snapToGrid = table.snapToGrid;
  }
  if ('locked' in table) {
    payload.locked = table.locked;
  }
  if ('x' in table) {
    payload.x = table.x;
  }
  if ('y' in table) {
    payload.y = table.y;
  }
  if ('rot' in table) {
    payload.rot = table.rot;
  }
  if ('canSeatSolo' in table) {
    payload.canSeatSolo = table.canSeatSolo;
  }
  if ('canCombine' in table) {
    payload.canCombine = table.canCombine;
  } else if ('isCombinable' in table) {
    payload.canCombine =
      typeof table.isCombinable === 'boolean' ? table.isCombinable : false;
  }
  if (typeof table.capacityTotal === 'number' && Number.isFinite(table.capacityTotal)) {
    payload.capacityTotal = table.capacityTotal;
  }
  if (table.sideCapacities) {
    const { north, east, south, west } = table.sideCapacities;
    if (
      [north, east, south, west].every(
        value => typeof value === 'number' && Number.isFinite(value)
      )
    ) {
      payload.sideCapacities = { north, east, south, west };
    }
  }
  if (Array.isArray(table.combinableWithIds)) {
    const selfId = typeof table.id === 'string' ? table.id : undefined;
    const combinableWithIds = Array.from(
      new Set(
        table.combinableWithIds
          .filter(id => typeof id === 'string')
          .map(id => id.trim())
          .filter(Boolean)
      )
    ).filter(id => id !== selfId);
    payload.combinableWithIds = combinableWithIds;
  }
  if (table.baseCombo) {
    const groupId =
      typeof table.baseCombo.groupId === 'string' ? table.baseCombo.groupId.trim() : '';
    const role =
      table.baseCombo.role === 'member' || table.baseCombo.role === 'aggregate'
        ? table.baseCombo.role
        : undefined;
    if (groupId && role) {
      const memberIds = Array.isArray(table.baseCombo.memberIds)
        ? table.baseCombo.memberIds
            .filter(id => typeof id === 'string')
            .map(id => id.trim())
            .filter(Boolean)
        : undefined;
      payload.baseCombo = memberIds ? { groupId, role, memberIds } : { groupId, role };
    }
  }
  if ('seatLayout' in table) {
    payload.seatLayout = table.seatLayout;
  }
  return payload;
};

const sortZones = (zones: Zone[]) =>
  [...zones].sort((a, b) => {
    const aPriority = a.priority ?? Number.POSITIVE_INFINITY;
    const bPriority = b.priority ?? Number.POSITIVE_INFINITY;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

const sortTables = (tables: Table[]) =>
  [...tables].sort((a, b) => {
    const zoneCompare = (a.zoneId ?? '').localeCompare(b.zoneId ?? '');
    if (zoneCompare !== 0) {
      return zoneCompare;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

const sortCombos = (combos: TableCombination[]) =>
  [...combos].sort((a, b) => {
    if (a.tableIds.length !== b.tableIds.length) {
      return a.tableIds.length - b.tableIds.length;
    }
    return a.id.localeCompare(b.id);
  });

const sortFloorplans = (floorplans: Floorplan[]) =>
  [...floorplans].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

const isPermissionDenied = (error: unknown): error is FirebaseError =>
  error instanceof FirebaseError && error.code === 'permission-denied';

const logPermissionDenied = (error: unknown, action: string, path: string) => {
  if (isPermissionDenied(error)) {
    console.error(`[seatingAdminService] permission-denied on ${action} ${path}`, error);
  }
};

export const getSeatingSettings = async (
  unitId: string,
  options: { createIfMissing?: boolean } = {}
): Promise<SeatingSettings> => {
  const settingsPath = `units/${unitId}/seating_settings/default`;
  const settingsRef = doc(db, 'units', unitId, 'seating_settings', 'default');
  let snapshot;
  try {
    snapshot = await getDoc(settingsRef);
  } catch (error) {
    logPermissionDenied(error, 'get', settingsPath);
    throw error;
  }
  if (!snapshot.exists()) {
    if (options.createIfMissing === false) {
      return seatingSettingsDefaults;
    }
    const settings = seatingSettingsDefaults;
    try {
      await setDoc(settingsRef, {
        ...settings,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      logPermissionDenied(error, 'create', settingsPath);
      throw error;
    }
    return settings;
  }
  return {
    ...seatingSettingsDefaults,
    ...(snapshot.data() as SeatingSettings),
  };
};

export const updateSeatingSettings = async (
  unitId: string,
  patch: SeatingSettings
): Promise<void> => {
  const settingsRef = doc(db, 'units', unitId, 'seating_settings', 'default');
  const settingsPath = `units/${unitId}/seating_settings/default`;
  try {
    await setDoc(
      settingsRef,
      {
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    logPermissionDenied(error, 'update', settingsPath);
    throw error;
  }
};

export const listZones = async (unitId: string): Promise<Zone[]> => {
  const zonesPath = `units/${unitId}/zones`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'zones'));
    return sortZones(
      snapshot.docs
        .map(docSnap => normalizeZone(docSnap.data(), docSnap.id))
        .filter(zone => zone.isActive !== false)
    );
  } catch (error) {
    logPermissionDenied(error, 'list', zonesPath);
    throw error;
  }
};

export const createZone = async (unitId: string, zone: Omit<Zone, 'id'>): Promise<void> => {
  const zonesPath = `units/${unitId}/zones`;
  try {
    const payload = normalizeZoneCreateInput(zone);
    await addDoc(collection(db, 'units', unitId, 'zones'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'create', zonesPath);
    throw error;
  }
};

export const updateZone = async (unitId: string, zoneId: string, zone: Partial<Zone>): Promise<void> => {
  const zonePath = `units/${unitId}/zones/${zoneId}`;
  try {
    const payload = normalizeZoneUpdatePatch(zone);
    await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'update', zonePath);
    throw error;
  }
};

export const deleteZone = async (unitId: string, zoneId: string): Promise<void> => {
  const zonePath = `units/${unitId}/zones/${zoneId}`;
  try {
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteZone start', { unitId, zoneId });
    }
    await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteZone done', { unitId, zoneId });
    }
  } catch (error) {
    if (debugSeating) {
      const err = error as { name?: string; code?: string; message?: string } | null;
      console.warn('[seatingAdminService] deleteZone failed', {
        unitId,
        zoneId,
        name: err?.name,
        code: err?.code,
        message: err?.message,
      });
    }
    logPermissionDenied(error, 'delete', zonePath);
    throw error;
  }
};

export const listTables = async (unitId: string): Promise<Table[]> => {
  const tablesPath = `units/${unitId}/tables`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'tables'));
    return sortTables(
      snapshot.docs
        .map(docSnap => normalizeTable(docSnap.data(), docSnap.id))
        .filter(table => table.isActive !== false)
    );
  } catch (error) {
    logPermissionDenied(error, 'list', tablesPath);
    throw error;
  }
};

export const createTable = async (unitId: string, table: Omit<Table, 'id'>): Promise<void> => {
  const tablesPath = `units/${unitId}/tables`;
  try {
    const payload = normalizeTableCreateInput(table);
    await addDoc(collection(db, 'units', unitId, 'tables'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'create', tablesPath);
    throw error;
  }
};

export const updateTable = async (unitId: string, tableId: string, table: Partial<Table>): Promise<void> => {
  const tablePath = `units/${unitId}/tables/${tableId}`;
  try {
    const payload = normalizeTableUpdatePatch(table as Partial<Table> & { isCombinable?: boolean });
    await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'update', tablePath);
    throw error;
  }
};

export const deleteTable = async (unitId: string, tableId: string): Promise<void> => {
  const tablePath = `units/${unitId}/tables/${tableId}`;
  try {
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteTable start', { unitId, tableId });
    }
    await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteTable done', { unitId, tableId });
    }
  } catch (error) {
    if (debugSeating) {
      const err = error as { name?: string; code?: string; message?: string } | null;
      console.warn('[seatingAdminService] deleteTable failed', {
        unitId,
        tableId,
        name: err?.name,
        code: err?.code,
        message: err?.message,
      });
    }
    logPermissionDenied(error, 'delete', tablePath);
    throw error;
  }
};

export const listCombinations = async (unitId: string): Promise<TableCombination[]> => {
  const combosPath = `units/${unitId}/table_combinations`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'table_combinations'));
    return sortCombos(
      snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as TableCombination))
        .filter(combo => combo.isActive !== false)
    );
  } catch (error) {
    logPermissionDenied(error, 'list', combosPath);
    throw error;
  }
};

export const createCombination = async (
  unitId: string,
  combo: Omit<TableCombination, 'id'>
): Promise<void> => {
  const combosPath = `units/${unitId}/table_combinations`;
  try {
    await addDoc(collection(db, 'units', unitId, 'table_combinations'), {
      ...combo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'create', combosPath);
    throw error;
  }
};

export const updateCombination = async (
  unitId: string,
  comboId: string,
  combo: Partial<TableCombination>
): Promise<void> => {
  const comboPath = `units/${unitId}/table_combinations/${comboId}`;
  try {
    await updateDoc(doc(db, 'units', unitId, 'table_combinations', comboId), {
      ...combo,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'update', comboPath);
    throw error;
  }
};

export const deleteCombination = async (unitId: string, comboId: string): Promise<void> => {
  const comboPath = `units/${unitId}/table_combinations/${comboId}`;
  try {
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteCombination start', { unitId, comboId });
    }
    await updateDoc(doc(db, 'units', unitId, 'table_combinations', comboId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteCombination done', { unitId, comboId });
    }
  } catch (error) {
    if (debugSeating) {
      const err = error as { name?: string; code?: string; message?: string } | null;
      console.warn('[seatingAdminService] deleteCombination failed', {
        unitId,
        comboId,
        name: err?.name,
        code: err?.code,
        message: err?.message,
      });
    }
    logPermissionDenied(error, 'delete', comboPath);
    throw error;
  }
};

export const listFloorplans = async (unitId: string): Promise<Floorplan[]> => {
  const floorplansPath = `units/${unitId}/floorplans`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'floorplans'));
    return sortFloorplans(
      snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Floorplan))
        .filter(plan => plan.isActive !== false)
    );
  } catch (error) {
    logPermissionDenied(error, 'list', floorplansPath);
    throw error;
  }
};

export const createFloorplan = async (
  unitId: string,
  floorplan: Omit<Floorplan, 'id'>
): Promise<void> => {
  const floorplansPath = `units/${unitId}/floorplans`;
  try {
    await addDoc(collection(db, 'units', unitId, 'floorplans'), {
      ...floorplan,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'create', floorplansPath);
    throw error;
  }
};

export const updateFloorplan = async (
  unitId: string,
  floorplanId: string,
  floorplan: Partial<Floorplan>
): Promise<void> => {
  const floorplanPath = `units/${unitId}/floorplans/${floorplanId}`;
  try {
    await updateDoc(doc(db, 'units', unitId, 'floorplans', floorplanId), {
      ...floorplan,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'update', floorplanPath);
    throw error;
  }
};

export const deleteFloorplan = async (unitId: string, floorplanId: string): Promise<void> => {
  const floorplanPath = `units/${unitId}/floorplans/${floorplanId}`;
  try {
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteFloorplan start', { unitId, floorplanId });
    }
    await updateDoc(doc(db, 'units', unitId, 'floorplans', floorplanId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
    if (debugSeating) {
      console.debug('[seatingAdminService] deleteFloorplan done', { unitId, floorplanId });
    }
  } catch (error) {
    if (debugSeating) {
      const err = error as { name?: string; code?: string; message?: string } | null;
      console.warn('[seatingAdminService] deleteFloorplan failed', {
        unitId,
        floorplanId,
        name: err?.name,
        code: err?.code,
        message: err?.message,
      });
    }
    logPermissionDenied(error, 'delete', floorplanPath);
    throw error;
  }
};

export const ensureDefaultFloorplan = async (unitId: string): Promise<Floorplan> => {
  const floorplans = await listFloorplans(unitId);
  const active = floorplans.find(plan => plan.isActive);
  if (active) {
    return active;
  }
  const payload = {
    name: 'Alaprajz',
    isActive: true,
    width: 1000,
    height: 600,
    gridSize: 20,
  };
  const floorplansPath = `units/${unitId}/floorplans`;
  let ref;
  try {
    ref = await addDoc(collection(db, 'units', unitId, 'floorplans'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'create', floorplansPath);
    throw error;
  }
  return { id: ref.id, ...payload };
};
