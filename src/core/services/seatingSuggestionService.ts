import { collection, getDocs, query, where } from 'firebase/firestore';
import { Timestamp, db } from '../firebase/config';
import {
  SeatingSettings,
  Table,
  TableCombination,
  Zone,
} from '../models/data';
import {
  getSeatingSettings as fetchSeatingSettings,
  listCombinations,
  listTables,
  listZones,
} from './seatingAdminService';

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
}

const defaultSettings: SeatingSettings = {
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

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA < endB && startB < endA;

const getBufferMillis = (bufferMinutes?: number) => (bufferMinutes ?? 15) * 60 * 1000;

const isEmergencyZoneAllowed = (settings: SeatingSettings, bookingDate: Date) => {
  const emergency = settings.emergencyZones;
  if (!emergency?.enabled) {
    return false;
  }
  if (emergency.activeRule === 'byWeekday') {
    const weekdays = emergency.weekdays ?? [];
    return weekdays.includes(bookingDate.getDay());
  }
  return true;
};

const getCapacityBounds = (table: Table) => ({
  minCapacity: table.minCapacity ?? 1,
  maxCapacity: table.capacityMax ?? 2,
});

const canSeatSolo = (table: Table, settings: SeatingSettings) =>
  table.canSeatSolo === true
  || (settings.soloAllowedTableIds ?? []).includes(table.id);

const compareCandidates = (
  a: { slack: number; zonePriority: number; label: string },
  b: { slack: number; zonePriority: number; label: string }
) => {
  if (a.slack !== b.slack) {
    return a.slack - b.slack;
  }
  if (a.zonePriority !== b.zonePriority) {
    return a.zonePriority - b.zonePriority;
  }
  return a.label.localeCompare(b.label);
};

export const suggestSeating = async (
  input: SuggestSeatingInput
): Promise<SuggestSeatingResult> => {
  const settings = {
    ...defaultSettings,
    ...(await fetchSeatingSettings(input.unitId, { createIfMissing: false })),
  };
  const [zones, tables, combos] = await Promise.all([
    listZones(input.unitId),
    listTables(input.unitId),
    listCombinations(input.unitId),
  ]);

  const activeZones = zones.filter(zone => zone.isActive);
  const activeTables = tables.filter(table => table.isActive);
  const activeCombos = combos.filter(combo => combo.isActive);
  const zoneById = new Map(activeZones.map(zone => [zone.id, zone]));
  const tablesById = new Map(activeTables.map(table => [table.id, table]));

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

  const emergencyAllowedByRule = isEmergencyZoneAllowed(settings, input.startTime);
  const emergencyZoneIds = new Set(settings.emergencyZones?.zoneIds ?? []);
  const normalZones = activeZones.filter(zone => !emergencyZoneIds.has(zone.id));
  const emergencyZones = activeZones.filter(zone => emergencyZoneIds.has(zone.id));

  const usableZones = [...normalZones, ...emergencyZones];
  const soloAllowed = settings.soloAllowedTableIds ?? [];

  const headcount = input.headcount;
  const candidates: Array<{
    zoneId: string;
    tableIds: string[];
    slack: number;
    zonePriority: number;
    label: string;
    isEmergency: boolean;
  }> = [];

  const addCandidate = (zoneId: string, tableIds: string[], totalMax: number, label: string) => {
    const zone = zoneById.get(zoneId);
    if (!zone) return;
    candidates.push({
      zoneId,
      tableIds,
      slack: totalMax - headcount,
      zonePriority: zone.priority ?? Number.POSITIVE_INFINITY,
      label,
      isEmergency: emergencyZoneIds.has(zoneId),
    });
  };

  usableZones.forEach(zone => {
    const zoneTables = activeTables.filter(table => table.zoneId === zone.id);
    zoneTables.forEach(table => {
      if (takenTableIds.has(table.id)) return;
      const { minCapacity, maxCapacity } = getCapacityBounds(table);
      const soloOk =
        headcount === 1 && (table.canSeatSolo || soloAllowed.includes(table.id));
      if (!soloOk && headcount < minCapacity) return;
      if (headcount > maxCapacity) return;
      addCandidate(zone.id, [table.id], maxCapacity, table.name ?? '');
    });
  });

  const maxCombineCount = settings.maxCombineCount ?? 2;
  if (maxCombineCount >= 2) {
    activeCombos
      .filter(combo => combo.tableIds.length <= maxCombineCount)
      .forEach(combo => {
        const comboTables = combo.tableIds
          .map(tableId => tablesById.get(tableId))
          .filter(Boolean) as Table[];
        if (comboTables.length !== combo.tableIds.length) {
          return;
        }
        if (comboTables.some(table => takenTableIds.has(table.id))) {
          return;
        }
        const zoneId = comboTables[0]?.zoneId;
        if (!zoneId || comboTables.some(table => table.zoneId !== zoneId)) {
          return;
        }
        if (!usableZones.some(zone => zone.id === zoneId)) {
          return;
        }
        const totalMax = comboTables.reduce(
          (sum, table) => sum + getCapacityBounds(table).maxCapacity,
          0
        );
        const totalMin = comboTables.reduce(
          (sum, table) => sum + getCapacityBounds(table).minCapacity,
          0
        );
        if (headcount > totalMax || headcount < totalMin) {
          return;
        }
        const label = comboTables.map(table => table.name ?? '').join(',');
        addCandidate(zoneId, combo.tableIds, totalMax, label);
      });
  }

  const normalCandidates = candidates.filter(candidate => !candidate.isEmergency);
  const emergencyCandidates = candidates.filter(candidate => candidate.isEmergency);
  const emergencyFallbackAllowed =
    emergencyAllowedByRule || settings.emergencyZones?.enabled === false;
  const orderedCandidates =
    normalCandidates.length > 0
      ? normalCandidates
      : emergencyFallbackAllowed
      ? emergencyCandidates
      : [];

  if (!orderedCandidates.length) {
    return { zoneId: null, tableIds: [], reason: 'NO_FIT' };
  }

  const best = orderedCandidates.sort((a, b) =>
    compareCandidates(
      { slack: a.slack, zonePriority: a.zonePriority, label: a.label },
      { slack: b.slack, zonePriority: b.zonePriority, label: b.label }
    )
  )[0];

  return { zoneId: best.zoneId, tableIds: best.tableIds };
};
