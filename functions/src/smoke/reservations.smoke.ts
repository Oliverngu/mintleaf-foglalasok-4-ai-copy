/* eslint-disable no-console */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import * as admin from 'firebase-admin';

const fail = (message: string, details?: Record<string, unknown>): never => {
  console.error(`\nSMOKE FAIL: ${message}`);
  if (details) {
    console.error('Details:', details);
  }
  process.exit(1);
};

const requireEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    fail(`Missing required env var: ${key}`);
  }
  return value;
};

const PROJECT_ID =
  process.env.PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  'demo-mintleaf';
const REGION = 'europe-west3';
const FUNCTIONS_EMULATOR_HOST = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';

const FIRESTORE_EMULATOR_HOST = requireEnv('FIRESTORE_EMULATOR_HOST');

if (!globalThis.fetch) {
  fail('Global fetch is required (Node 18+).');
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`HTTP ${response.status} for ${url}`, { response: text });
  }
  return JSON.parse(text) as T;
};

const assertTruthy = (condition: unknown, message: string) => {
  if (!condition) {
    fail(message);
  }
};

const dateKeyFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const nextFutureSlot = (from: Date, offsetHours = 2) => {
  const base = new Date(from);
  base.setMinutes(0, 0, 0);
  base.setHours(base.getHours() + offsetHours);
  return base;
};

const clampToWindow = (date: Date, from: string, to: string) => {
  const [fromHour, fromMinute] = from.split(':').map(Number);
  const [toHour, toMinute] = to.split(':').map(Number);
  const clamped = new Date(date);
  const minutes = clamped.getHours() * 60 + clamped.getMinutes();
  const windowStart = fromHour * 60 + fromMinute;
  const windowEnd = toHour * 60 + toMinute;
  if (minutes < windowStart) {
    clamped.setHours(fromHour, fromMinute, 0, 0);
    return clamped;
  }
  if (minutes >= windowEnd) {
    clamped.setDate(clamped.getDate() + 1);
    clamped.setHours(fromHour, fromMinute, 0, 0);
  }
  return clamped;
};

const run = async () => {
  console.log('Starting reservation smoke test...');
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Firestore emulator: ${FIRESTORE_EMULATOR_HOST}`);
  console.log(`Functions emulator: ${FUNCTIONS_EMULATOR_HOST}`);

  const unitId = `smoke-unit-${Date.now()}`;
  const settingsRef = db.doc(`reservation_settings/${unitId}`);
  await settingsRef.set({
    reservationMode: 'auto',
    dailyCapacity: 10,
    bookableWindow: { from: '10:00', to: '22:00' },
    notificationEmails: [],
  });

  const createUrl = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/${REGION}/guestCreateReservation`;
  const modifyUrl = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/${REGION}/guestModifyReservation`;
  const cancelUrl = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/${REGION}/guestUpdateReservation`;

  const rawStart = nextFutureSlot(new Date(), 2);
  const startTime = clampToWindow(rawStart, '10:00', '22:00');
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  const createResponse = await postJson<{ bookingId: string; manageToken: string }>(createUrl, {
    unitId,
    reservation: {
      name: 'Smoke Guest',
      headcount: 2,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      preferredTimeSlot: 'afternoon',
      seatingPreference: 'any',
      contact: { email: 'smoke@example.com' },
    },
  });

  assertTruthy(createResponse.bookingId, 'Expected bookingId from guestCreateReservation');
  if (!createResponse.manageToken) {
    fail('manageToken missing from guestCreateReservation response', {
      responseKeys: Object.keys(createResponse),
    });
  }

  const reservationRef = db
    .collection('units')
    .doc(unitId)
    .collection('reservations')
    .doc(createResponse.bookingId);

  await delay(200);
  const reservationSnap = await reservationRef.get();
  assertTruthy(reservationSnap.exists, 'Reservation document missing after create');
  const reservation = reservationSnap.data() || {};
  assertTruthy(reservation.capacityLedger, 'capacityLedger missing on reservation');
  assertTruthy(reservation.capacityLedger.applied === true, 'capacityLedger.applied should be true');
  assertTruthy(reservation.capacityLedger.key, 'capacityLedger.key missing');

  const dateKey = dateKeyFromDate(startTime);
  const capacityRef = db
    .collection('units')
    .doc(unitId)
    .collection('reservation_capacity')
    .doc(dateKey);
  const capacitySnap = await capacityRef.get();
  assertTruthy(capacitySnap.exists, `capacity doc missing after create: ${capacityRef.path}`);
  const capacity = capacitySnap.data() || {};
  const baseCount = capacity.count ?? capacity.totalCount ?? 0;
  assert.equal(baseCount, 2);
  if (capacity.byTimeSlot) {
    const slotValue = capacity.byTimeSlot.afternoon ?? capacity.byTimeSlot.evening;
    if (typeof slotValue === 'number') {
      assertTruthy(slotValue >= 2, 'byTimeSlot should include headcount when present');
    }
  } else {
    console.log('Breakdown optional: byTimeSlot not present');
  }

  const modifyStart = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
  const modifyEnd = new Date(modifyStart.getTime() + 60 * 60 * 1000);

  await postJson(modifyUrl, {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 3,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  });

  await delay(200);
  const updatedReservationSnap = await reservationRef.get();
  const updatedReservation = updatedReservationSnap.data() || {};
  assert.equal(updatedReservation.headcount, 3);
  assertTruthy(updatedReservation.capacityLedger, 'capacityLedger missing after modify');

  const oldCapacitySnap = await capacityRef.get();
  const newDateKey = dateKeyFromDate(modifyStart);
  const newCapacitySnap = await db
    .collection('units')
    .doc(unitId)
    .collection('reservation_capacity')
    .doc(newDateKey)
    .get();

  const oldCapacity = oldCapacitySnap.data() || {};
  const newCapacity = newCapacitySnap.data() || {};
  const oldBase = oldCapacity.count ?? oldCapacity.totalCount ?? 0;
  const newBase = newCapacity.count ?? newCapacity.totalCount ?? 0;
  assert.equal(oldBase, 0);
  assert.equal(newBase, 3);

  const allocationTraceId =
    updatedReservation.allocationTraceId || updatedReservation.allocation?.traceId;
  assertTruthy(allocationTraceId, 'allocation trace id missing');

  const allocationLogId = `${unitId}_${newDateKey}_${allocationTraceId}`;
  const allocationLogSnap = await db.collection('allocation_logs').doc(allocationLogId).get();
  if (!allocationLogSnap.exists) {
    const fallbackSnap = await db
      .collection('allocation_logs')
      .where('unitId', '==', unitId)
      .where('traceId', '==', allocationTraceId)
      .get();
    if (fallbackSnap.empty) {
      console.warn('WARN: allocation log not found by deterministic id or fallback query');
    } else {
      console.log('Allocation log found via query:', fallbackSnap.docs[0].id);
    }
  } else {
    console.log('Allocation log found:', allocationLogId);
  }

  await postJson(cancelUrl, {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    action: 'cancel',
  });

  await delay(200);
  const cancelledSnap = await reservationRef.get();
  const cancelledReservation = cancelledSnap.data() || {};
  assert.equal(cancelledReservation.status, 'cancelled');
  assertTruthy(cancelledReservation.capacityLedger, 'capacityLedger missing after cancel');
  assert.equal(cancelledReservation.capacityLedger.applied, false);

  const capacityAfterCancelSnap = await db
    .collection('units')
    .doc(unitId)
    .collection('reservation_capacity')
    .doc(newDateKey)
    .get();
  const capacityAfterCancel = capacityAfterCancelSnap.data() || {};
  assert.equal(capacityAfterCancel.count ?? capacityAfterCancel.totalCount, 0);

  console.log('\nSMOKE PASS: reservation flow verified.');
};

run().catch(err => {
  console.error(err);
  fail('Unhandled error in smoke test');
});
