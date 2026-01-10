import { SeatingSettings, Table, TableCombination, Zone } from '../../models/data';

export type AllocationMode = 'capacity' | 'floorplan' | 'hybrid';
export type AllocationStrategy = 'bestFit' | 'minWaste' | 'priorityZoneFirst';

export interface SuggestAllocationInput {
  partySize: number;
  seatingSettings: SeatingSettings;
  zones: Zone[];
  tables: Table[];
  tableCombinations?: TableCombination[];
}

export interface SuggestAllocationResult {
  zoneId?: string;
  tableIds: string[];
  reason: string;
  confidence: number;
}

type Candidate = {
  zoneId: string;
  tableIds: string[];
  totalMax: number;
  totalMin: number;
  label: string;
};

const getCapacityBounds = (table: Table) => ({
  minCapacity: table.minCapacity ?? 1,
  maxCapacity: table.capacityMax ?? 2,
});

const canSeatSolo = (table: Table, settings: SeatingSettings) =>
  table.canSeatSolo === true || (settings.soloAllowedTableIds ?? []).includes(table.id);

const compareCandidates = (
  strategy: AllocationStrategy,
  zonePriority: Map<string, number>,
  partySize: number
) => (a: Candidate, b: Candidate) => {
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

const buildCandidates = (
  input: SuggestAllocationInput
): Candidate[] => {
  const { partySize, seatingSettings, zones, tables, tableCombinations } = input;
  const activeZones = zones.filter(zone => zone.isActive);
  const activeTables = tables.filter(table => table.isActive);
  const activeCombos = (tableCombinations ?? []).filter(combo => combo.isActive);
  const zonesById = new Map(activeZones.map(zone => [zone.id, zone]));
  const tablesById = new Map(activeTables.map(table => [table.id, table]));
  const maxCombineCount = seatingSettings.maxCombineCount ?? 2;

  const candidates: Candidate[] = [];

  activeTables.forEach(table => {
    const { minCapacity, maxCapacity } = getCapacityBounds(table);
    const soloOk = partySize === 1 && canSeatSolo(table, seatingSettings);
    if (!soloOk && partySize < minCapacity) {
      return;
    }
    if (partySize > maxCapacity) {
      return;
    }
    if (!zonesById.has(table.zoneId)) {
      return;
    }
    candidates.push({
      zoneId: table.zoneId,
      tableIds: [table.id],
      totalMax: maxCapacity,
      totalMin: minCapacity,
      label: table.name ?? table.id,
    });
  });

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
        const zoneId = comboTables[0]?.zoneId;
        if (!zoneId || comboTables.some(table => table.zoneId !== zoneId)) {
          return;
        }
        if (!zonesById.has(zoneId)) {
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
          zoneId,
          tableIds: combo.tableIds,
          totalMax,
          totalMin,
          label: combo.tableIds.join(','),
        });
      });
  }

  return candidates;
};

const calculateConfidence = (partySize: number, candidate: Candidate) => {
  const slack = candidate.totalMax - partySize;
  if (candidate.totalMax <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, 1 - slack / candidate.totalMax));
};

export const suggestAllocation = (
  input: SuggestAllocationInput
): SuggestAllocationResult => {
  const { partySize, seatingSettings, zones } = input;
  if (partySize <= 0) {
    return { tableIds: [], reason: 'INVALID_PARTY_SIZE', confidence: 0 };
  }

  const allocationMode: AllocationMode =
    seatingSettings.allocationMode ?? 'capacity';
  const allocationStrategy: AllocationStrategy =
    seatingSettings.allocationStrategy ?? 'bestFit';
  const defaultZoneId = seatingSettings.defaultZoneId ?? '';
  const candidates = buildCandidates(input);

  if (!candidates.length) {
    return { tableIds: [], reason: 'NO_FIT', confidence: 0 };
  }

  const zonePriority = new Map(
    zones.map(zone => [zone.id, zone.priority ?? Number.POSITIVE_INFINITY])
  );

  const pickBest = (items: Candidate[]) =>
    [...items].sort(compareCandidates(allocationStrategy, zonePriority, partySize))[0];

  if (allocationMode === 'floorplan' || allocationMode === 'hybrid') {
    const zoneOrder = [...zones]
      .filter(zone => zone.isActive)
      .sort((a, b) => {
        if (a.id === defaultZoneId) return -1;
        if (b.id === defaultZoneId) return 1;
        return (a.priority ?? 0) - (b.priority ?? 0);
      });

    for (const zone of zoneOrder) {
      const zoneCandidates = candidates.filter(candidate => candidate.zoneId === zone.id);
      if (zoneCandidates.length) {
        const best = pickBest(zoneCandidates);
        return {
          zoneId: best.zoneId,
          tableIds: best.tableIds,
          reason: 'ZONE_FIRST',
          confidence: calculateConfidence(partySize, best),
        };
      }
    }

    if (allocationMode === 'floorplan') {
      return { tableIds: [], reason: 'NO_FIT', confidence: 0 };
    }
  }

  const best = pickBest(candidates);
  return {
    zoneId: best.zoneId,
    tableIds: best.tableIds,
    reason: allocationMode === 'hybrid' ? 'FLOORPLAN_FALLBACK' : 'BEST_FIT',
    confidence: calculateConfidence(partySize, best),
  };
};
