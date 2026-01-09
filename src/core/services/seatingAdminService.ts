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

const seatingSettingsDefaults: SeatingSettings = {
  bufferMinutes: 15,
  defaultDurationMinutes: 120,
  allowGuestDurationEdit: true,
  holdTableMinutesOnLate: 15,
  maxCombineCount: 2,
  vipEnabled: true,
  soloAllowedTableIds: [],
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

const normalizeZonePatch = (zone: Partial<Zone>): Partial<Zone> => {
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
    type,
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

const normalizeTablePatch = (table: Partial<Table>): Partial<Table> => {
  const canCombine =
    typeof table.canCombine === 'boolean'
      ? table.canCombine
      : typeof (table as { isCombinable?: boolean }).isCombinable === 'boolean'
      ? (table as { isCombinable?: boolean }).isCombinable
      : table.canCombine;
  return {
    ...table,
    tags: normalizeTags(table.tags),
    canCombine,
  };
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
    return sortZones(snapshot.docs.map(docSnap => normalizeZone(docSnap.data(), docSnap.id)));
  } catch (error) {
    logPermissionDenied(error, 'list', zonesPath);
    throw error;
  }
};

export const createZone = async (unitId: string, zone: Omit<Zone, 'id'>): Promise<void> => {
  const zonesPath = `units/${unitId}/zones`;
  try {
    const payload = normalizeZonePatch(zone);
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
    const payload = normalizeZonePatch(zone);
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
    await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'delete', zonePath);
    throw error;
  }
};

export const listTables = async (unitId: string): Promise<Table[]> => {
  const tablesPath = `units/${unitId}/tables`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'tables'));
    return sortTables(snapshot.docs.map(docSnap => normalizeTable(docSnap.data(), docSnap.id)));
  } catch (error) {
    logPermissionDenied(error, 'list', tablesPath);
    throw error;
  }
};

export const createTable = async (unitId: string, table: Omit<Table, 'id'>): Promise<void> => {
  const tablesPath = `units/${unitId}/tables`;
  try {
    const payload = normalizeTablePatch(table);
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
    const payload = normalizeTablePatch(table);
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
    await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'delete', tablePath);
    throw error;
  }
};

export const listCombinations = async (unitId: string): Promise<TableCombination[]> => {
  const combosPath = `units/${unitId}/table_combinations`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'table_combinations'));
    return sortCombos(
      snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as TableCombination))
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
    await updateDoc(doc(db, 'units', unitId, 'table_combinations', comboId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logPermissionDenied(error, 'delete', comboPath);
    throw error;
  }
};

export const listFloorplans = async (unitId: string): Promise<Floorplan[]> => {
  const floorplansPath = `units/${unitId}/floorplans`;
  try {
    const snapshot = await getDocs(collection(db, 'units', unitId, 'floorplans'));
    return sortFloorplans(
      snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Floorplan))
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
    await updateDoc(doc(db, 'units', unitId, 'floorplans', floorplanId), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
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
