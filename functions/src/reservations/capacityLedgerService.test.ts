import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCapacityLedgerTx,
  computeReservationBucketKeys,
  countsTowardCapacity,
  isLedgerReplay,
  resolveLedgerCurrentKey,
  shouldSkipCapacityMutation,
  toDateKeyLocal,
} from './capacityLedgerService';
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

test('computeReservationBucketKeys applies buffer after end time', () => {
  const keys = computeReservationBucketKeys({
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T10:30:00'),
    bufferMinutes: 15,
    bucketMinutes: 15,
  });
  assert.deepEqual(keys, ['10:00', '10:15', '10:30']);
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
    if (!this.store.has(ref.path)) {
      throw new Error('update called on missing doc');
    }
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
  store.set('reservations/res-1', {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
      lastMutationTraceId: 'trace',
    },
    headcount: 2,
  });
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
  store.set('reservations/res-2', {
    capacityLedger: {
      applied: false,
      key: null,
      count: null,
    },
    headcount: 2,
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

test('applyCapacityLedgerTx applies bucket-only mutations when total delta is zero', async () => {
  const store = new Map<string, Record<string, any>>();
  store.set('units/unit-1/reservation_capacity/2025-01-01', {
    totalCount: 2,
    count: 2,
    byTimeBucket: { '10:00': 2 },
  });
  store.set('reservations/res-3', {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
    },
    headcount: 2,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T12:00:00'),
  });
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-3');
  const reservationData = {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
    },
    headcount: 2,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T12:00:00'),
  };
  const oldBucketKeys = computeReservationBucketKeys({
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T12:00:00'),
    bufferMinutes: 0,
    bucketMinutes: 15,
  });
  const newBucketKeys = computeReservationBucketKeys({
    startTime: new Date('2025-01-01T11:00:00'),
    endTime: new Date('2025-01-01T13:00:00'),
    bufferMinutes: 0,
    bucketMinutes: 15,
  });

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'confirmed',
    nextDateKey: '2025-01-01',
    nextHeadcount: 2,
    nextStartTime: new Date('2025-01-01T11:00:00'),
    nextEndTime: new Date('2025-01-01T13:00:00'),
    capacitySettings: {
      capacityMode: 'timeWindow',
      timeWindowCapacity: 6,
      bucketMinutes: 15,
      bufferMinutes: 0,
    },
    mutationTraceId: 'trace-buckets',
  });

  assert.equal(transaction.sets.length, 1);
  const written = transaction.sets[0].data as Record<string, any>;
  const buckets = written.byTimeBucket as Record<string, number> | undefined;
  assert.ok(buckets && typeof buckets === 'object');
  assert.equal(written.totalCount, 2);
  assert.equal(written.count, 2);
  const oldOnlyKey = oldBucketKeys.find(key => !newBucketKeys.includes(key));
  const newOnlyKey = newBucketKeys.find(key => !oldBucketKeys.includes(key));
  assert.ok(oldOnlyKey, 'expected old-only bucket key');
  assert.ok(newOnlyKey, 'expected new-only bucket key');
  assert.ok(typeof buckets[oldOnlyKey] === 'undefined' || buckets[oldOnlyKey] === 0);
  assert.equal(buckets[newOnlyKey], 2);
});

test('applyCapacityLedgerTx sets buckets on create-like mutation', async () => {
  const store = new Map<string, Record<string, any>>();
  store.set('reservations/res-6', {
    headcount: 3,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T11:00:00'),
    capacityLedger: { applied: false },
  });
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-6');
  const reservationData = {
    headcount: 3,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T11:00:00'),
    capacityLedger: { applied: false },
  };
  const expectedBuckets = computeReservationBucketKeys({
    startTime: reservationData.startTime,
    endTime: reservationData.endTime,
    bufferMinutes: 0,
    bucketMinutes: 30,
  });

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'confirmed',
    nextDateKey: '2025-01-01',
    nextHeadcount: 3,
    nextStartTime: reservationData.startTime,
    nextEndTime: reservationData.endTime,
    capacitySettings: {
      capacityMode: 'timeWindow',
      timeWindowCapacity: 8,
      bucketMinutes: 30,
      bufferMinutes: 0,
    },
    mutationTraceId: 'trace-create',
  });

  assert.equal(transaction.sets.length, 1);
  const written = transaction.sets[0].data as Record<string, any>;
  const buckets = written.byTimeBucket as Record<string, number> | undefined;
  assert.ok(buckets && typeof buckets === 'object');
  expectedBuckets.forEach(key => {
    assert.equal(buckets[key], 3);
  });
  assert.equal(written.totalCount, 3);
  assert.equal(written.count, 3);
});

test('applyCapacityLedgerTx shifts buckets when only time window changes', async () => {
  const store = new Map<string, Record<string, any>>();
  store.set('units/unit-1/reservation_capacity/2025-01-01', {
    totalCount: 4,
    count: 4,
    byTimeBucket: { '10:00': 4 },
  });
  store.set('reservations/res-5', {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 4,
    },
    headcount: 4,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T11:00:00'),
  });
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-5');
  const reservationData = {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 4,
    },
    headcount: 4,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T11:00:00'),
  };

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'confirmed',
    nextDateKey: '2025-01-01',
    nextHeadcount: 4,
    nextStartTime: new Date('2025-01-01T12:00:00'),
    nextEndTime: new Date('2025-01-01T13:00:00'),
    capacitySettings: {
      capacityMode: 'timeWindow',
      timeWindowCapacity: 8,
      bucketMinutes: 60,
      bufferMinutes: 0,
    },
    mutationTraceId: 'trace-shift',
  });

  assert.equal(transaction.sets.length, 1);
  const written = transaction.sets[0].data as Record<string, any>;
  const buckets = written.byTimeBucket as Record<string, number> | undefined;
  assert.ok(buckets && typeof buckets === 'object');
  assert.equal(written.totalCount, 4);
  assert.equal(written.count, 4);
  assert.ok(typeof buckets['10:00'] === 'undefined' || buckets['10:00'] === 0);
  assert.equal(buckets['12:00'], 4);
});

test('applyCapacityLedgerTx deletes buckets on cancel', async () => {
  const store = new Map<string, Record<string, any>>();
  store.set('units/unit-1/reservation_capacity/2025-01-01', {
    totalCount: 2,
    count: 2,
    byTimeBucket: { '10:00': 2 },
  });
  store.set('reservations/res-4', {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
    },
    headcount: 2,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T12:00:00'),
  });
  const transaction = new FakeTransaction(store);
  const db = new FakeFirestore();
  const reservationRef = new FakeDocRef('reservations/res-4');
  const reservationData = {
    capacityLedger: {
      applied: true,
      key: '2025-01-01',
      count: 2,
    },
    headcount: 2,
    startTime: new Date('2025-01-01T10:00:00'),
    endTime: new Date('2025-01-01T12:00:00'),
  };

  await applyCapacityLedgerTx({
    transaction: transaction as unknown as Transaction,
    db: db as unknown as Firestore,
    unitId: 'unit-1',
    reservationRef: reservationRef as unknown as FirebaseFirestore.DocumentReference,
    reservationData,
    nextStatus: 'cancelled',
    nextDateKey: '2025-01-01',
    nextHeadcount: 2,
    nextStartTime: reservationData.startTime,
    nextEndTime: reservationData.endTime,
    capacitySettings: {
      capacityMode: 'timeWindow',
      timeWindowCapacity: 6,
      bucketMinutes: 15,
      bufferMinutes: 0,
    },
    mutationTraceId: 'trace-cancel',
  });

  assert.equal(transaction.sets.length, 1);
  const written = transaction.sets[0].data as Record<string, any>;
  assert.equal(written.totalCount, 0);
  assert.equal(written.count, 0);
  const buckets = written.byTimeBucket as Record<string, number> | undefined;
  if (buckets && typeof buckets === 'object') {
    assert.equal(Object.keys(buckets).length, 0);
    assert.ok(!('10:00' in buckets));
  }
});
