import type { AllocationDecision } from './types';

export type AllocationRecord = {
  zoneId: string | null;
  tableIds: string[];
  traceId: string;
  decidedAtMs: number;
  strategy: string | null;
  diagnosticsSummary: string;
};

export const buildAllocationRecord = ({
  decision,
  traceId,
  decidedAtMs,
}: {
  decision: AllocationDecision;
  traceId: string;
  decidedAtMs: number;
}): AllocationRecord | null => {
  if (decision.reason === 'ALLOCATION_DISABLED') {
    return null;
  }

  return {
    zoneId: decision.zoneId ?? null,
    tableIds: decision.tableIds ?? [],
    traceId,
    decidedAtMs,
    strategy: decision.allocationStrategy ?? decision.allocationMode ?? null,
    diagnosticsSummary: decision.reason,
  };
};
