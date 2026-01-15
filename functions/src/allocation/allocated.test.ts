import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAllocationRecord } from './allocated';
import type { AllocationDecision } from './types';

test('buildAllocationRecord returns null when allocation is disabled', () => {
  const decision: AllocationDecision = {
    zoneId: null,
    tableIds: [],
    reason: 'ALLOCATION_DISABLED',
    allocationMode: 'capacity',
    allocationStrategy: 'bestFit',
    snapshot: { overflowZonesCount: 0, zonePriorityCount: 0, emergencyZonesCount: 0 },
  };
  const record = buildAllocationRecord({
    decision,
    traceId: 'trace',
    decidedAtMs: 123,
  });
  assert.equal(record, null);
});

test('buildAllocationRecord returns allocation details when enabled', () => {
  const decision: AllocationDecision = {
    zoneId: 'zone-1',
    tableIds: ['table-1', 'table-2'],
    reason: 'BEST_FIT',
    allocationMode: 'floorplan',
    allocationStrategy: 'bestFit',
    snapshot: { overflowZonesCount: 0, zonePriorityCount: 0, emergencyZonesCount: 0 },
  };
  const record = buildAllocationRecord({
    decision,
    traceId: 'trace-1',
    decidedAtMs: 456,
  });
  assert.deepEqual(record, {
    zoneId: 'zone-1',
    tableIds: ['table-1', 'table-2'],
    traceId: 'trace-1',
    decidedAtMs: 456,
    strategy: 'bestFit',
    diagnosticsSummary: 'BEST_FIT',
  });
  assert.deepEqual(Object.keys(record || {}), [
    'zoneId',
    'tableIds',
    'traceId',
    'decidedAtMs',
    'strategy',
    'diagnosticsSummary',
  ]);
});
