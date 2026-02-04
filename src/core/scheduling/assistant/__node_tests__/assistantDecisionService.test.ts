import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import type { Suggestion } from '../../engine/types.js';
import {
  acceptSuggestion,
  rejectSuggestion,
  type AssistantDecisionStore,
} from '../services/assistantDecisionService.js';

type StoredShift = Awaited<ReturnType<AssistantDecisionStore['listShifts']>>[number];

const buildInMemoryStore = () => {
  const shifts: StoredShift[] = [];
  const ledgers = new Map<string, unknown>();
  const decisions = new Map<string, unknown>();
  const failures: unknown[] = [];
  const users = new Map<string, { id: string; fullName?: string }>([
    ['u1', { id: 'u1', fullName: 'User One' }],
  ]);
  const positions = new Map<string, { id: string; name?: string }>([
    ['p1', { id: 'p1', name: 'Pult' }],
  ]);

  const store: AssistantDecisionStore = {
    listShifts: async unitId => shifts.filter(shift => shift.unitId === unitId),
    listPositions: async () => Array.from(positions.values()),
    getUser: async userId => users.get(userId) ?? null,
    getAppliedLedger: async (_unitId, suggestionId) =>
      (ledgers.get(suggestionId) as any) ?? null,
    runTransaction: async fn => {
      const tx = {
        getAppliedLedger: async (_unitId: string, suggestionId: string) =>
          (ledgers.get(suggestionId) as any) ?? null,
        setAppliedLedger: async (
          _unitId: string,
          suggestionId: string,
          record: unknown
        ) => {
          ledgers.set(suggestionId, record);
        },
        setDecision: async (
          _unitId: string,
          suggestionId: string,
          record: unknown
        ) => {
          decisions.set(suggestionId, record);
        },
        setShift: async (shiftId: string, payload: unknown) => {
          shifts.push({ id: shiftId, ...(payload as StoredShift) });
        },
        updateShift: async (shiftId: string, payload: Partial<StoredShift>) => {
          const index = shifts.findIndex(shift => shift.id === shiftId);
          if (index === -1) {
            throw new Error('Shift not found');
          }
          shifts[index] = { ...shifts[index], ...payload };
        },
      };
      return fn(tx);
    },
    logApplyFailure: async record => {
      failures.push(record);
    },
  };

  return { store, shifts, ledgers, decisions, failures };
};

describe('assistantDecisionService', () => {
  it('applies once and returns noop when ledger exists', async () => {
    const { store, shifts, ledgers } = buildInMemoryStore();
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add a shift.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: '2025-01-06',
          startTime: '09:00',
          endTime: '13:00',
          positionId: 'p1',
        },
      ],
    };

    const first = await acceptSuggestion(
      { unitId: 'unit-a', suggestionId: 'sugg-1', suggestion },
      store
    );
    assert.equal(first.status, 'applied');
    assert.equal(shifts.length, 1);
    assert.ok(ledgers.get('sugg-1'));

    const second = await acceptSuggestion(
      { unitId: 'unit-a', suggestionId: 'sugg-1', suggestion },
      store
    );
    assert.equal(second.status, 'noop');
    assert.equal(second.alreadyApplied, true);
    assert.equal(shifts.length, 1);
  });

  it('logs failures without writing shifts', async () => {
    const { store, shifts, failures, decisions } = buildInMemoryStore();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const suggestion: Suggestion = {
      type: 'SHIFT_MOVE_SUGGESTION',
      expectedImpact: 'Move shift',
      explanation: 'Move missing shift.',
      actions: [
        {
          type: 'moveShift',
          shiftId: 'missing',
          userId: 'u1',
          dateKey: '2025-01-06',
          newStartTime: '10:00',
          newEndTime: '14:00',
        },
      ],
    };

    try {
      const result = await acceptSuggestion(
        { unitId: 'unit-a', suggestionId: 'sugg-2', suggestion },
        store
      );
      assert.equal(result.status, 'failed');
      assert.equal(shifts.length, 0);
      assert.equal(failures.length, 1);
      assert.equal(decisions.size, 0);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('records decisions when dedupe results in noop', async () => {
    const { store, shifts, decisions } = buildInMemoryStore();
    shifts.push({
      id: 's1',
      userId: 'u1',
      unitId: 'unit-a',
      position: 'p1',
      dayKey: '2025-01-06',
      start: Timestamp.fromDate(new Date('2025-01-06T09:00:00')),
      end: Timestamp.fromDate(new Date('2025-01-06T13:00:00')),
    });
    const suggestion: Suggestion = {
      type: 'ADD_SHIFT_SUGGESTION',
      expectedImpact: 'Add coverage',
      explanation: 'Add duplicate shift.',
      actions: [
        {
          type: 'createShift',
          userId: 'u1',
          dateKey: '2025-01-06',
          startTime: '09:00',
          endTime: '13:00',
          positionId: 'p1',
        },
      ],
    };

    const result = await acceptSuggestion(
      { unitId: 'unit-a', suggestionId: 'sugg-3', suggestion },
      store
    );
    assert.equal(result.status, 'noop');
    assert.ok(decisions.get('sugg-3'));
  });

  it('records rejected decisions without applying shifts', async () => {
    const { store, shifts, decisions } = buildInMemoryStore();
    await rejectSuggestion(
      { unitId: 'unit-a', suggestionId: 'sugg-4', actorId: 'u1' },
      store
    );
    assert.equal(shifts.length, 0);
    assert.ok(decisions.get('sugg-4'));
  });
});
