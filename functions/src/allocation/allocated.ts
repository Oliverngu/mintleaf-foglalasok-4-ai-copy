export type AllocationDecisionSummary = {
  zoneId?: string | null;
  tableIds?: string[];
  reason?: string | null;
  reasonCode?: string | null;
  allocationMode?: string | null;
  allocationStrategy?: string | null;
};

export type AllocationRecord = {
  zoneId: string | null;
  tableIds: string[];
  traceId: string;
  decidedAtMs: number;
  strategy: string | null;
  diagnosticsSummary: string;
  computedForStartTimeMs: number;
  computedForEndTimeMs: number;
  computedForHeadcount: number;
  algoVersion: string;
};

export const buildAllocationRecord = ({
  decision,
  traceId,
  decidedAtMs,
  enabled,
  computedForStartTimeMs,
  computedForEndTimeMs,
  computedForHeadcount,
  algoVersion,
}: {
  decision: AllocationDecisionSummary;
  traceId: string;
  decidedAtMs: number;
  enabled: boolean;
  computedForStartTimeMs: number;
  computedForEndTimeMs: number;
  computedForHeadcount: number;
  algoVersion: string;
}): AllocationRecord | null => {
  if (!enabled) {
    return null;
  }

  const zoneId = decision.zoneId ?? null;
  const tableIds = decision.tableIds ?? [];
  const diagnosticsSummary = decision.reason ?? decision.reasonCode ?? 'UNKNOWN';

  if (!zoneId && tableIds.length === 0) {
    return null;
  }

  return {
    zoneId,
    tableIds,
    traceId,
    decidedAtMs,
    strategy: decision.allocationStrategy ?? decision.allocationMode ?? null,
    diagnosticsSummary,
    computedForStartTimeMs,
    computedForEndTimeMs,
    computedForHeadcount,
    algoVersion,
  };
};
