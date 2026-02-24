import { AllocationDecision, SeatingSettingsDoc } from './types';
import { suggestAllocationDecision } from './decision';
import {
  fetchSeatingEntities,
  fetchSeatingSettings,
  fetchTakenTableIds,
} from './queryReservations';

const seatingSettingsDefaults: SeatingSettingsDoc = {
  bufferMinutes: 15,
  maxCombineCount: 2,
  soloAllowedTableIds: [],
  allowCrossZoneCombinations: false,
  allocationEnabled: false,
  allocationMode: 'capacity',
  allocationStrategy: 'bestFit',
  zonePriority: [],
  overflowZones: [],
  defaultZoneId: '',
  emergencyZones: {
    enabled: false,
    zoneIds: [],
    activeRule: 'always',
    weekdays: [],
  },
};

export const computeAllocationDecisionForBooking = async ({
  unitId,
  bookingId,
  startDate,
  endDate,
  partySize,
}: {
  unitId: string;
  bookingId: string;
  startDate: Date;
  endDate: Date;
  partySize: number;
}): Promise<AllocationDecision> => {
  const seatingSettings = await fetchSeatingSettings(unitId, seatingSettingsDefaults);
  const snapshot = {
    overflowZonesCount: seatingSettings.overflowZones?.length ?? 0,
    zonePriorityCount: seatingSettings.zonePriority?.length ?? 0,
    emergencyZonesCount: seatingSettings.emergencyZones?.zoneIds?.length ?? 0,
  };

  if (!seatingSettings.allocationEnabled) {
    return {
      zoneId: null,
      tableIds: [],
      reason: 'ALLOCATION_DISABLED',
      allocationMode: seatingSettings.allocationMode ?? null,
      allocationStrategy: seatingSettings.allocationStrategy ?? null,
      snapshot,
    };
  }

  const { zones, tables, combos } = await fetchSeatingEntities(unitId);
  const takenTableIds = await fetchTakenTableIds({
    unitId,
    bookingId,
    startDate,
    endDate,
    bufferMinutes: seatingSettings.bufferMinutes,
  });

  const availableTables = tables.filter(table => !takenTableIds.has(table.id));
  const availableTableIds = new Set(availableTables.map(table => table.id));
  const availableCombos = combos.filter(combo =>
    combo.tableIds.every(tableId => availableTableIds.has(tableId))
  );

  const suggestion = suggestAllocationDecision({
    partySize,
    bookingDate: startDate,
    seatingSettings,
    zones,
    tables: availableTables,
    tableCombinations: availableCombos,
  });

  return {
    zoneId: suggestion.zoneId ?? null,
    tableIds: suggestion.tableIds ?? [],
    reason: suggestion.reason ?? 'NO_FIT',
    allocationMode: seatingSettings.allocationMode ?? null,
    allocationStrategy: seatingSettings.allocationStrategy ?? null,
    snapshot,
  };
};

export { writeAllocationDecisionLogForBooking } from './logWriter';
export type { AllocationDecision } from './types';
