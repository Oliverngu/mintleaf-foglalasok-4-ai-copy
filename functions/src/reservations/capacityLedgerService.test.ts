import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCapacityLedgerTx, countsTowardCapacity, isLedgerReplay, resolveLedgerCurrentKey, shouldSkipCapacityMutation, toDateKeyLocal } from './capacityLedgerService';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

test('countsTowardCapacity for accepted states', () => {
  assert.equal(countsTowardCapacity('confirmed'), true);
  assert.equal(countsTowardCapacity('pending'), true);
});

test('countsTowardCapacity for excluded states', () => {
  assert.equal(countsTowardCapacity('cancelled'), false);
  assert.equal(countsTowardCapacity('declined'), false);
  assert.equal(countsTowardCapacity('no_show'), false);
});

test('toDateKeyLocal formats local date keys', () => {
  const start = new Date('2025-02-03T10:00:00.000Z');
  const expectedKey = toDateKeyLocal(start);
  assert.equal(expectedKey, '2025-02-03');
});

test('resolveLedgerCurrentKey prefers reservation startTime', () => {
  const start = new Date('2025-02-03T10:00:00.000Z');
  const result = resolveLedgerCurrentKey({
    ledgerKey: null,
    reservationStartTime: start,
    nextDateKey: '2025-02-04',
  });
  assert.equal(result, '2025-02-03');
});

test('resolveLedgerCurrentKey falls back when date is invalid', () => {
  const invalidDate = new Date('invalid');
  const result = resolveLedgerCurrentKey({
    ledgerKey: null,
    reservationStartTime: invalidDate,
    nextDateKey: '2025-02-04',
  });
  assert.equal(result, '2025-02-04');
});

test('isLedgerReplay detects matching ledger state', () => {
  const replay = isLedgerReplay({
    ledger: { applied: true, key: '2025-01-01', count: 4, lastMutationTraceId: 'trace' },
    desiredIncluded: true,
    desiredKey: '2025-01-01',
    desiredCount: 4,
    mutationTraceId: 'trace',
  });
  assert.equal(replay, true);
});

test('isLedgerReplay ignores mismatched trace', () => {
  const replay = isLedgerReplay({
    ledger: { applied: true, key: '2025-01-01', count: 4, lastMutationTraceId: 'trace' },
    desiredIncluded: true,
    desiredKey: '2025-01-01',
    desiredCount: 4,
    mutationTraceId: 'other',
  });
  assert.equal(replay, false);
});

test('shouldSkipCapacityMutation matches trace ids', () => {
  assert.equal(
    shouldSkipCapacityMutation({ mutationTraceId: 'trace', capacityTraceId: 'trace' }),
    true
  );
  assert.equal(
    shouldSkipCapacityMutation({ mutationTraceId: 'trace', capacityTraceId: 'other' }),
    false
  );
});

class FakeDocRef {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  get id() {
    return this.path.split('/').pop() ?? '';
  }

  collection(name: string) {
    return new FakeCollectionRef(`${this.path}/${name}`);
  }

  doc(id: string) {
    return new FakeDocRef(`${this.path}/${id}`);
  }
}

class FakeCollectionRef {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  doc(id: string) {
    return new FakeDocRef(`${this.path}/${id}`);
  }
}

class FakeTransaction {
  readonly store: Map<string, Record<string, any>>;
  readonly sets: Array<{ ref: FakeDocRef; data: Record<string, any> }>;
  readonly updates: Array<{ ref: FakeDocRef; data: Record<string, any> }>;

  constructor(store: Map<string, Record<string, any>>) {
    this.store = store;
    this.sets = [];
    this.updates = [];
  }

  async get(ref: FakeDocRef) {
    const data = this.store.get(ref.path);
    return {
      exists: data !== undefined,
      data: () => data,
    };
  }

  set(ref: FakeDocRef, data: Record<string, any>) {
    this.sets.push({ ref, data });
  }

  update(ref: FakeDocRef, data: Record<string, any>) {
    this.updates.push({ ref, data });
  }
}

class FakeFirestore {
  collection(name: string) {
    return new FakeCollectionRef(name);
  }
}

test('applyCapacityLedgerTx exits early on ledger replay', async () => {
  const store = new Map<string, Record<string, any>>();
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-1');
  const reservationData = {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
      lastMutationTraceId: 'trace',
    },
    headcount: 2,
  };

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'confirmed',
    nextDateKey: '2025-01-01',
    nextHeadcount: 2,
    mutationTraceId: 'trace',
  });

  assert.equal(transaction.sets.length, 0);
  assert.equal(transaction.updates.length, 0);
});

test('applyCapacityLedgerTx skips capacity mutation when trace matches', async () => {
  const store = new Map<string, Record<string, any>>();
  store.set('units/unit-1/reservation_capacity/2025-01-01', {
    totalCount: 1,
    count: 1,
    lastMutationTraceId: 'trace',
  });
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-2');
  const reservationData = {
    capacityLedger: {
      applied: false,
      key: null,
      count: null,
    },
    headcount: 2,
  };

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'confirmed',
    nextDateKey: '2025-01-01',
    nextHeadcount: 2,
    mutationTraceId: 'trace',
  });

  assert.equal(transaction.sets.length, 0);
  assert.equal(transaction.updates.length, 1);
});
