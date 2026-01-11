export type AllocationMode = 'capacity' | 'floorplan' | 'hybrid';
export type AllocationStrategy = 'bestFit' | 'minWaste' | 'priorityZoneFirst';

export interface SeatingSettingsDoc {
  bufferMinutes?: number;
  maxCombineCount?: number;
  soloAllowedTableIds?: string[];
  allowCrossZoneCombinations?: boolean;
  allocationEnabled?: boolean;
  allocationMode?: AllocationMode;
  allocationStrategy?: AllocationStrategy;
  zonePriority?: string[];
  overflowZones?: string[];
  defaultZoneId?: string;
  emergencyZones?: {
    enabled?: boolean;
    zoneIds?: string[];
    activeRule?: 'always' | 'byWeekday';
    weekdays?: number[];
  };
}

export interface FloorplanZone {
  id: string;
  name?: string;
  isActive?: boolean;
  tags?: string[];
  type?: 'bar' | 'outdoor' | 'table' | 'other';
  priority?: number;
}

export interface FloorplanTable {
  id: string;
  zoneId?: string;
  isActive?: boolean;
  tableGroup?: string;
  canCombine?: boolean;
  tags?: string[];
  minCapacity?: number;
  capacityMax?: number;
  canSeatSolo?: boolean;
}

export interface TableCombinationDoc {
  id: string;
  tableIds: string[];
  isActive?: boolean;
}

export interface AllocationSnapshot {
  overflowZonesCount: number;
  zonePriorityCount: number;
  emergencyZonesCount: number;
}

export interface AllocationDecision {
  zoneId: string | null;
  tableIds: string[];
  reason: string;
  allocationMode: AllocationMode | null;
  allocationStrategy: AllocationStrategy | null;
  snapshot: AllocationSnapshot;
}
