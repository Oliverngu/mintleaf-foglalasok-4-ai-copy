import {
  AllocationStrategy,
  FloorplanTable,
  FloorplanZone,
  SeatingSettingsDoc,
  TableCombinationDoc,
} from './types';

const getCapacityBounds = (table: FloorplanTable) => ({
  minCapacity: typeof table.minCapacity === 'number' ? table.minCapacity : 1,
  maxCapacity: typeof table.capacityMax === 'number' ? table.capacityMax : 2,
});

const canSeatSolo = (table: FloorplanTable, settings: SeatingSettingsDoc) =>
  table.canSeatSolo === true || (settings.soloAllowedTableIds ?? []).includes(table.id);

const isEmergencyZoneAllowed = (settings: SeatingSettingsDoc, bookingDate?: Date) => {
  const emergency = settings.emergencyZones;
  if (!emergency?.enabled) {
    return false;
  }
  if (emergency.activeRule === 'byWeekday') {
    if (!bookingDate) {
      return false;
    }
    const weekdays = emergency.weekdays ?? [];
    return weekdays.includes(bookingDate.getDay());
  }
  return true;
};

type AllocationCandidate = {
  zoneId: string;
  tableIds: string[];
  totalMax: number;
  totalMin: number;
  label: string;
};

const compareCandidates = (
  strategy: AllocationStrategy,
  zonePriority: Map<string, number>,
  partySize: number
) => (a: AllocationCandidate, b: AllocationCandidate) => {
  const slackA = a.totalMax - partySize;
  const slackB = b.totalMax - partySize;
  const zonePriorityA = zonePriority.get(a.zoneId) ?? Number.POSITIVE_INFINITY;
  const zonePriorityB = zonePriority.get(b.zoneId) ?? Number.POSITIVE_INFINITY;

  if (strategy === 'priorityZoneFirst') {
    if (zonePriorityA !== zonePriorityB) {
      return zonePriorityA - zonePriorityB;
    }
    if (slackA !== slackB) {
      return slackA - slackB;
    }
  } else {
    if (slackA !== slackB) {
      return slackA - slackB;
    }
    if (a.totalMax !== b.totalMax) {
      return a.totalMax - b.totalMax;
    }
  }

  return a.label.localeCompare(b.label);
};

const buildCandidates = ({
  partySize,
  seatingSettings,
  zones,
  tables,
  tableCombinations,
}: {
  partySize: number;
  seatingSettings: SeatingSettingsDoc;
  zones: FloorplanZone[];
  tables: FloorplanTable[];
  tableCombinations: TableCombinationDoc[];
}): AllocationCandidate[] => {
  const activeZones = zones.filter(zone => zone.isActive);
  const activeTables = tables.filter(table => table.isActive);
  const activeCombos = tableCombinations.filter(combo => combo.isActive);
  const zonesById = new Map(activeZones.map(zone => [zone.id, zone]));
  const tablesById = new Map(activeTables.map(table => [table.id, table]));
  const allowCrossZoneCombinations = seatingSettings.allowCrossZoneCombinations ?? false;
  const maxCombineCount = seatingSettings.maxCombineCount ?? 2;

  const candidates: AllocationCandidate[] = [];

  activeTables.forEach(table => {
    const { minCapacity, maxCapacity } = getCapacityBounds(table);
    const soloOk = partySize === 1 && canSeatSolo(table, seatingSettings);
    if (!soloOk && partySize < minCapacity) {
      return;
    }
    if (partySize > maxCapacity) {
      return;
    }
    if (!table.zoneId || !zonesById.has(table.zoneId)) {
      return;
    }
    candidates.push({
      zoneId: table.zoneId,
      tableIds: [table.id],
      totalMax: maxCapacity,
      totalMin: minCapacity,
      label: table.id,
    });
  });

  if (maxCombineCount >= 2) {
    activeCombos
      .filter(combo => combo.tableIds.length <= maxCombineCount)
      .forEach(combo => {
        const comboTables = combo.tableIds
          .map(tableId => tablesById.get(tableId))
          .filter(Boolean) as FloorplanTable[];
        if (comboTables.length !== combo.tableIds.length) {
          return;
        }
        const zoneIds = new Set(
          comboTables
            .map(table => (typeof table.zoneId === 'string' ? table.zoneId.trim() : ''))
            .filter(Boolean)
        );
        if (!zoneIds.size) {
          return;
        }
        if (zoneIds.size !== 1 && !allowCrossZoneCombinations) {
          return;
        }
        if (allowCrossZoneCombinations) {
          for (const zoneId of zoneIds) {
            if (!zonesById.has(zoneId)) {
              return;
            }
          }
        }
        const firstTable = tablesById.get(combo.tableIds[0]);
        if (!firstTable || typeof firstTable.zoneId !== 'string' || !firstTable.zoneId.trim()) {
          return;
        }
        const anchorZoneId = firstTable.zoneId.trim();
        if (!zonesById.has(anchorZoneId)) {
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
        if (partySize < totalMin || partySize > totalMax) {
          return;
        }
        candidates.push({
          zoneId: anchorZoneId,
          tableIds: combo.tableIds,
          totalMax,
          totalMin,
          label: combo.tableIds.join(','),
        });
      });
  }

  return candidates;
};

export const suggestAllocationDecision = ({
  partySize,
  bookingDate,
  seatingSettings,
  zones,
  tables,
  tableCombinations,
}: {
  partySize: number;
  bookingDate: Date;
  seatingSettings: SeatingSettingsDoc;
  zones: FloorplanZone[];
  tables: FloorplanTable[];
  tableCombinations: TableCombinationDoc[];
}) => {
  if (partySize <= 0) {
    return { zoneId: null, tableIds: [], reason: 'INVALID_PARTY_SIZE' };
  }

  const allocationMode = seatingSettings.allocationMode ?? 'capacity';
  const allocationStrategy = seatingSettings.allocationStrategy ?? 'bestFit';
  const defaultZoneId = seatingSettings.defaultZoneId ?? '';

  const candidates = buildCandidates({
    partySize,
    seatingSettings,
    zones,
    tables,
    tableCombinations,
  });

  if (!candidates.length) {
    return { zoneId: null, tableIds: [], reason: 'NO_FIT' };
  }

  const zonePriority = new Map(
    zones.map(zone => [zone.id, zone.priority ?? Number.POSITIVE_INFINITY])
  );

  const priorityOrder = (seatingSettings.zonePriority ?? []).filter(Boolean);
  if (priorityOrder.length) {
    priorityOrder.forEach((zoneId, index) => {
      zonePriority.set(zoneId, index);
    });
  }

  const activeZoneIds = zones.filter(zone => zone.isActive).map(zone => zone.id);
  const overflowZoneIds = new Set(seatingSettings.overflowZones ?? []);
  const emergencyAllowed = isEmergencyZoneAllowed(seatingSettings, bookingDate);
  const emergencyZoneIdSet = new Set(
    (seatingSettings.emergencyZones?.zoneIds ?? [])
      .filter(Boolean)
      .filter(zoneId => activeZoneIds.includes(zoneId))
  );
  const orderedZoneIds = priorityOrder.length
    ? [
        ...priorityOrder.filter(zoneId => activeZoneIds.includes(zoneId)),
        ...activeZoneIds.filter(zoneId => !priorityOrder.includes(zoneId)),
      ]
    : [...activeZoneIds].sort((a, b) => {
        if (a === defaultZoneId) return -1;
        if (b === defaultZoneId) return 1;
        const priorityA = zonePriority.get(a) ?? Number.POSITIVE_INFINITY;
        const priorityB = zonePriority.get(b) ?? Number.POSITIVE_INFINITY;
        return priorityA - priorityB;
      });

  const normalOrderedZoneIds = orderedZoneIds.filter(zoneId => !emergencyZoneIdSet.has(zoneId));
  const primaryZoneIds = normalOrderedZoneIds.filter(zoneId => !overflowZoneIds.has(zoneId));
  const fallbackZoneIds = normalOrderedZoneIds.filter(zoneId => overflowZoneIds.has(zoneId));
  const emergencyZoneIdsOrdered = emergencyAllowed
    ? orderedZoneIds.filter(zoneId => emergencyZoneIdSet.has(zoneId))
    : [];

  const pickBest = (items: AllocationCandidate[]) =>
    [...items].sort(compareCandidates(allocationStrategy, zonePriority, partySize))[0];

  if (allocationMode === 'floorplan' || allocationMode === 'hybrid') {
    const evaluateZones = (zoneIds: string[], reason: string) => {
      for (const zoneId of zoneIds) {
        const zoneCandidates = candidates.filter(candidate => candidate.zoneId === zoneId);
        if (zoneCandidates.length) {
          const best = pickBest(zoneCandidates);
          return {
            zoneId: best.zoneId,
            tableIds: best.tableIds,
            reason,
          };
        }
      }
      return null;
    };

    const primaryResult = evaluateZones(primaryZoneIds, 'ZONE_FIRST');
    if (primaryResult) {
      return primaryResult;
    }

    const fallbackResult = evaluateZones(fallbackZoneIds, 'ZONE_OVERFLOW');
    if (fallbackResult) {
      return fallbackResult;
    }

    if (emergencyZoneIdsOrdered.length) {
      const emergencyResult = evaluateZones(emergencyZoneIdsOrdered, 'EMERGENCY_ZONE');
      if (emergencyResult) {
        return emergencyResult;
      }
    }

    if (allocationMode === 'floorplan') {
      return { zoneId: null, tableIds: [], reason: 'NO_FIT' };
    }
  }

  const normalCandidates = candidates.filter(
    candidate => !emergencyZoneIdSet.has(candidate.zoneId)
  );
  const emergencyCandidates = emergencyAllowed
    ? candidates.filter(candidate => emergencyZoneIdSet.has(candidate.zoneId))
    : [];
  const usedEmergencyFallback =
    emergencyAllowed && emergencyCandidates.length > 0 && normalCandidates.length === 0;
  const selectedCandidates = normalCandidates.length
    ? normalCandidates
    : emergencyCandidates.length
    ? emergencyCandidates
    : candidates;
  const best = pickBest(selectedCandidates);
  return {
    zoneId: best.zoneId,
    tableIds: best.tableIds,
    reason: usedEmergencyFallback
      ? 'EMERGENCY_ZONE'
      : allocationMode === 'hybrid'
      ? 'FLOORPLAN_FALLBACK'
      : 'BEST_FIT',
  };
};
