/* eslint-disable no-console */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import * as admin from 'firebase-admin';

const fail = (message: string): never => {
  console.error(`\nSMOKE FAIL: ${message}`);
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
    fail(`HTTP ${response.status} for ${url}: ${text}`);
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

  const startTime = new Date();
  startTime.setMinutes(0, 0, 0);
  startTime.setHours(12);
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
  assertTruthy(createResponse.manageToken, 'Expected manageToken from guestCreateReservation');

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
  assertTruthy(capacitySnap.exists, 'capacity doc missing after create');
  const capacity = capacitySnap.data() || {};
  assert.equal(capacity.count ?? capacity.totalCount, 2);
  assertTruthy(capacity.byTimeSlot, 'byTimeSlot should exist when preferredTimeSlot provided');

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
  assert.equal(oldCapacity.count ?? oldCapacity.totalCount, 0);
  assert.equal(newCapacity.count ?? newCapacity.totalCount, 3);

  const allocationTraceId =
    updatedReservation.allocationTraceId || updatedReservation.allocation?.traceId;
  assertTruthy(allocationTraceId, 'allocation trace id missing');

  const allocationLogId = `${unitId}_${newDateKey}_${allocationTraceId}`;
  const allocationLogSnap = await db.collection('allocation_logs').doc(allocationLogId).get();
  if (!allocationLogSnap.exists) {
    console.warn('WARN: allocation log not found by deterministic id');
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
