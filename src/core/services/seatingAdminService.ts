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
import { SeatingSettings, Table, TableCombination, Zone } from '../models/data';

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

export const getSeatingSettings = async (unitId: string): Promise<SeatingSettings> => {
  const settingsRef = doc(db, 'units', unitId, 'seating_settings', 'default');
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) {
    const settings = seatingSettingsDefaults;
    await setDoc(settingsRef, {
      ...settings,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
  await setDoc(
    settingsRef,
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

export const listZones = async (unitId: string): Promise<Zone[]> => {
  const snapshot = await getDocs(collection(db, 'units', unitId, 'zones'));
  return sortZones(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Zone)));
};

export const createZone = async (unitId: string, zone: Omit<Zone, 'id'>): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'zones'), {
    ...zone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateZone = async (unitId: string, zoneId: string, zone: Partial<Zone>): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
    ...zone,
    updatedAt: serverTimestamp(),
  });
};

export const deleteZone = async (unitId: string, zoneId: string): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'zones', zoneId), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
};

export const listTables = async (unitId: string): Promise<Table[]> => {
  const snapshot = await getDocs(collection(db, 'units', unitId, 'tables'));
  return sortTables(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Table)));
};

export const createTable = async (unitId: string, table: Omit<Table, 'id'>): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'tables'), {
    ...table,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateTable = async (unitId: string, tableId: string, table: Partial<Table>): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
    ...table,
    updatedAt: serverTimestamp(),
  });
};

export const deleteTable = async (unitId: string, tableId: string): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'tables', tableId), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
};

export const listCombinations = async (unitId: string): Promise<TableCombination[]> => {
  const snapshot = await getDocs(collection(db, 'units', unitId, 'table_combinations'));
  return sortCombos(
    snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as TableCombination))
  );
};

export const createCombination = async (
  unitId: string,
  combo: Omit<TableCombination, 'id'>
): Promise<void> => {
  await addDoc(collection(db, 'units', unitId, 'table_combinations'), {
    ...combo,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateCombination = async (
  unitId: string,
  comboId: string,
  combo: Partial<TableCombination>
): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'table_combinations', comboId), {
    ...combo,
    updatedAt: serverTimestamp(),
  });
};

export const deleteCombination = async (unitId: string, comboId: string): Promise<void> => {
  await updateDoc(doc(db, 'units', unitId, 'table_combinations', comboId), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
};
