import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationLogDocId } from './allocationLogService';

test('allocationLogDocId stable for same inputs', () => {
  const input = { unitId: 'unit-1', dateKey: '2025-01-01', traceId: 'abc123' };
  const first = allocationLogDocId(input);
  const second = allocationLogDocId(input);
  assert.equal(first, second);
});

test('allocationLogDocId includes unitId, dateKey, and traceId', () => {
  const docId = allocationLogDocId({
    unitId: 'unit-9',
    dateKey: '2025-02-03',
    traceId: 'trace-xyz',
  });
  assert.ok(docId.includes('unit-9'));
  assert.ok(docId.includes('2025-02-03'));
  assert.ok(docId.includes('trace-xyz'));
});
