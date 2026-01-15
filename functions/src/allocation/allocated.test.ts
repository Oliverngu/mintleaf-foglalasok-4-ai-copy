import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAllocationRecord } from './allocated';
test('buildAllocationRecord returns null when allocation is disabled', () => {
  const decision = {
    zoneId: null,
    tableIds: [],
    reason: 'ALLOCATION_DISABLED',
    allocationMode: 'capacity',
    allocationStrategy: 'bestFit',
  };
  const record = buildAllocationRecord({
    decision,
    traceId: 'trace',
    decidedAtMs: 123,
    enabled: false,
    computedForStartTimeMs: 123000,
    computedForEndTimeMs: 124000,
    computedForHeadcount: 2,
    algoVersion: 'alloc-v1',
  });
  assert.equal(record, null);
});

test('buildAllocationRecord returns allocation details when enabled', () => {
  const decision = {
    zoneId: 'zone-1',
    tableIds: ['table-1', 'table-2'],
    reason: 'BEST_FIT',
    allocationMode: 'floorplan',
    allocationStrategy: 'bestFit',
  };
  const record = buildAllocationRecord({
    decision,
    traceId: 'trace-1',
    decidedAtMs: 456,
    enabled: true,
    computedForStartTimeMs: 456000,
    computedForEndTimeMs: 457000,
    computedForHeadcount: 4,
    algoVersion: 'alloc-v1',
  });
  assert.deepEqual(record, {
    zoneId: 'zone-1',
    tableIds: ['table-1', 'table-2'],
    traceId: 'trace-1',
    decidedAtMs: 456,
    strategy: 'bestFit',
    diagnosticsSummary: 'BEST_FIT',
    computedForStartTimeMs: 456000,
    computedForEndTimeMs: 457000,
    computedForHeadcount: 4,
    algoVersion: 'alloc-v1',
  });
  assert.deepEqual(Object.keys(record || {}), [
    'zoneId',
    'tableIds',
    'traceId',
    'decidedAtMs',
    'strategy',
    'diagnosticsSummary',
    'computedForStartTimeMs',
    'computedForEndTimeMs',
    'computedForHeadcount',
    'algoVersion',
  ]);
});
