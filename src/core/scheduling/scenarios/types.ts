import type { Severity } from '../engine/types.js';

export type ScenarioType = 'SICKNESS' | 'EVENT' | 'PEAK' | 'LAST_MINUTE';

export type ScenarioTimeRange = {
  startTime: string;
  endTime: string;
};

export type MinCoverageOverride = {
  positionId: string;
  minCount: number;
};

export type ScenarioPatch = {
  id: string;
  description: string;
};

export type SicknessScenarioPayload = {
  userId: string;
  dateKeys: string[];
  reason?: string;
  severity?: Severity;
};

export type EventScenarioPayload = {
  dateKeys: string[];
  timeRange: ScenarioTimeRange;
  expectedLoadMultiplier?: number;
  minCoverageOverrides?: MinCoverageOverride[];
};

export type PeakScenarioPayload = {
  dateKeys: string[];
  timeRange: ScenarioTimeRange;
  minCoverageOverrides: MinCoverageOverride[];
};

export type LastMinuteScenarioPayload = {
  timestamp: string;
  description: string;
  patches?: ScenarioPatch[];
};

export type ScenarioBase = {
  id: string;
  unitId: string;
  weekStartDate: string;
  type: ScenarioType;
  dateKeys?: string[];
  inheritMode?: 'ADD' | 'OVERRIDE' | 'INHERIT_IF_EMPTY';
  createdAt?: string;
  createdBy?: string;
};

export type Scenario =
  | (ScenarioBase & {
      type: 'SICKNESS';
      payload: SicknessScenarioPayload;
    })
  | (ScenarioBase & {
      type: 'EVENT';
      payload: EventScenarioPayload;
    })
  | (ScenarioBase & {
      type: 'PEAK';
      payload: PeakScenarioPayload;
    })
  | (ScenarioBase & {
      type: 'LAST_MINUTE';
      payload: LastMinuteScenarioPayload;
    });
