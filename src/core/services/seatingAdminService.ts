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

const sortZones = (zones: Zone[]) =>
  [...zones].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
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
    return sortZones(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Zone)));
  } catch (error) {
    logPermissionDenied(error, 'list', zonesPath);
    throw error;
  }
};

export const createZone = async (unitId: string, zone: Omit<Zone, 'id'>): Promise<void> => {
  const zonesPath = `units/${unitId}/zones`;
  try {
    await addDoc(collection(db, 'units', unitId, 'zones'), {
      ...zone,
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
    await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
      ...zone,
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
    return sortTables(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Table)));
  } catch (error) {
    logPermissionDenied(error, 'list', tablesPath);
    throw error;
  }
};

export const createTable = async (unitId: string, table: Omit<Table, 'id'>): Promise<void> => {
  const tablesPath = `units/${unitId}/tables`;
  try {
    await addDoc(collection(db, 'units', unitId, 'tables'), {
      ...table,
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
    await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
      ...table,
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
