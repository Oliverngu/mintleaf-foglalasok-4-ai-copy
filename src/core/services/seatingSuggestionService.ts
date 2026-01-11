import { collection, getDocs, query, where } from 'firebase/firestore';
import { Timestamp, db } from '../firebase/config';
import { SeatingSettings } from '../models/data';
import {
  getSeatingSettings as fetchSeatingSettings,
  listCombinations,
  listTables,
  listZones,
} from './seatingAdminService';
import { suggestAllocation } from './allocation/tableAllocation';

export interface SuggestSeatingInput {
  unitId: string;
  startTime: Date;
  endTime: Date;
  headcount: number;
  bookingId?: string;
}

export interface SuggestSeatingResult {
  zoneId: string | null;
  tableIds: string[];
  reason?: string;
  allocationMode?: SeatingSettings['allocationMode'];
  allocationStrategy?: SeatingSettings['allocationStrategy'];
  snapshot?: {
    overflowZonesCount: number;
    zonePriorityCount: number;
    emergencyZonesCount: number;
  };
}

const defaultSettings: SeatingSettings = {
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

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA < endB && startB < endA;

const getBufferMillis = (bufferMinutes?: number) => (bufferMinutes ?? 15) * 60 * 1000;
const isDev = process.env.NODE_ENV !== 'production';
const debugSeating =
  isDev ||
  (typeof window !== 'undefined' &&
    window.localStorage.getItem('mintleaf_debug_seating') === '1');

export const suggestSeating = async (
  input: SuggestSeatingInput
): Promise<SuggestSeatingResult> => {
  const settings = {
    ...defaultSettings,
    ...(await fetchSeatingSettings(input.unitId, { createIfMissing: false })),
  };
  const snapshot = {
    overflowZonesCount: settings.overflowZones?.length ?? 0,
    zonePriorityCount: settings.zonePriority?.length ?? 0,
    emergencyZonesCount: settings.emergencyZones?.zoneIds?.length ?? 0,
  };
  if (!settings.allocationEnabled) {
    return {
      zoneId: null,
      tableIds: [],
      reason: 'ALLOCATION_DISABLED',
      allocationMode: settings.allocationMode,
      allocationStrategy: settings.allocationStrategy,
      snapshot,
    };
  }
  const [zones, tables, combos] = await Promise.all([
    listZones(input.unitId),
    listTables(input.unitId),
    listCombinations(input.unitId),
  ]);

  const activeTables = tables.filter(table => table.isActive);
  const activeCombos = combos.filter(combo => combo.isActive);

  const bufferMillis = getBufferMillis(settings.bufferMinutes);
  const startWithBuffer = new Date(input.startTime.getTime() - bufferMillis);
  const endWithBuffer = new Date(input.endTime.getTime() + bufferMillis);

  const monthStart = new Date(input.startTime.getFullYear(), input.startTime.getMonth(), 1);
  const nextMonthStart = new Date(input.startTime.getFullYear(), input.startTime.getMonth() + 1, 1);

  const reservationSnapshot = await getDocs(
    query(
      collection(db, 'units', input.unitId, 'reservations'),
      where('startTime', '>=', Timestamp.fromDate(monthStart)),
      where('startTime', '<', Timestamp.fromDate(nextMonthStart))
    )
  );

  const takenTableIds = new Set<string>();
  reservationSnapshot.docs.forEach(docSnap => {
    if (input.bookingId && docSnap.id === input.bookingId) {
      return;
    }
    const data = docSnap.data();
    if (data.status === 'cancelled') {
      return;
    }
    const start = data.startTime?.toDate?.();
    const end = data.endTime?.toDate?.();
    if (!start || !end) {
      return;
    }
    if (overlaps(startWithBuffer, endWithBuffer, start, end)) {
      const assigned = data.assignedTableIds ?? [];
      assigned.forEach((tableId: string) => takenTableIds.add(tableId));
    }
  });

  const availableTables = activeTables.filter(table => !takenTableIds.has(table.id));
  const availableTableIds = new Set(availableTables.map(table => table.id));
  const availableCombos = activeCombos.filter(combo =>
    combo.tableIds.every(tableId => availableTableIds.has(tableId))
  );

  const suggestion = suggestAllocation({
    partySize: input.headcount,
    bookingDate: input.startTime,
    seatingSettings: settings,
    zones,
    tables: availableTables,
    tableCombinations: availableCombos,
  });

  if (debugSeating && suggestion.reason === 'EMERGENCY_ZONE') {
    console.info('[seatingSuggestion] Emergency zone selected', {
      unitId: input.unitId,
      zoneId: suggestion.zoneId,
      tableIds: suggestion.tableIds,
      bookingDate: input.startTime,
    });
  }
  if (!suggestion.tableIds.length) {
    return {
      zoneId: null,
      tableIds: [],
      reason: suggestion.reason ?? 'NO_FIT',
      allocationMode: settings.allocationMode,
      allocationStrategy: settings.allocationStrategy,
      snapshot,
    };
  }

  return {
    zoneId: suggestion.zoneId ?? null,
    tableIds: suggestion.tableIds,
    reason: suggestion.reason,
    allocationMode: settings.allocationMode,
    allocationStrategy: settings.allocationStrategy,
    snapshot,
  };
};
