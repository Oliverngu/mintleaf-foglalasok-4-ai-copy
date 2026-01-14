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
const AUTH_EMULATOR_HOST =
  process.env.AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || '';

const buildFunctionUrls = (host: string, projectId: string, region: string) => ({
  createUrl: `http://${host}/${projectId}/${region}/guestCreateReservation`,
  modifyUrl: `http://${host}/${projectId}/${region}/guestModifyReservation`,
  cancelUrl: `http://${host}/${projectId}/${region}/guestUpdateReservation`,
  adminUrl: `http://${host}/${projectId}/${region}/adminHandleReservationAction`,
});

const logEnvAndUrls = (urls: ReturnType<typeof buildFunctionUrls>) => {
  console.log('Resolved environment:');
  console.log(`  PROJECT_ID: ${PROJECT_ID}`);
  console.log(`  REGION: ${REGION}`);
  console.log(`  FUNCTIONS_EMULATOR_HOST: ${FUNCTIONS_EMULATOR_HOST}`);
  console.log(`  FIRESTORE_EMULATOR_HOST: ${FIRESTORE_EMULATOR_HOST}`);
  console.log(`  AUTH_EMULATOR_HOST: ${AUTH_EMULATOR_HOST || '(not set)'}`);
  console.log('Resolved function URLs:');
  console.log(`  createUrl: ${urls.createUrl}`);
  console.log(`  modifyUrl: ${urls.modifyUrl}`);
  console.log(`  cancelUrl: ${urls.cancelUrl}`);
  console.log(`  adminUrl: ${urls.adminUrl}`);
};

const detectEmulatorProjectId = async (): Promise<string | null> => {
  try {
    const response = await fetch(`http://${FUNCTIONS_EMULATOR_HOST}/`);
    const text = await response.text();
    const match =
      text.match(/project(?:\s*id)?\s*[:=]\s*["']?([a-z0-9-]+)/i) ||
      text.match(/Project\s*ID\s*[:=]\s*["']?([a-z0-9-]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const preflightFunctionsEmulator = async (urls: ReturnType<typeof buildFunctionUrls>) => {
  const emulatorProjectId = await detectEmulatorProjectId();
  const hint = emulatorProjectId
    ? `export PROJECT_ID=${emulatorProjectId} (or use the projectId printed by emulator start).`
    : 'Use the projectId printed by emulator start (or export PROJECT_ID accordingly).';
  try {
    const optionsResponse = await fetch(urls.createUrl, { method: 'OPTIONS' });
    const postResponse = await fetch(urls.createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const statuses = [optionsResponse.status, postResponse.status];
    console.log(`[SMOKE][PREFLIGHT] createUrl statuses: ${statuses.join(', ')}`);
    const hasNon404 = statuses.some(status => status !== 404);
    if (!hasNon404) {
      fail('Functions emulator project/region mismatch (404)', {
        projectId: PROJECT_ID,
        region: REGION,
        functionsEmulatorHost: FUNCTIONS_EMULATOR_HOST,
        firestoreEmulatorHost: FIRESTORE_EMULATOR_HOST,
        authEmulatorHost: AUTH_EMULATOR_HOST || '(not set)',
        emulatorProjectId: emulatorProjectId ?? '(not detected)',
        expectedUrls: urls,
        expectedCreateUrl: urls.createUrl,
        hint,
      });
    }
  } catch (error) {
    fail('Functions emulator preflight failed', {
      projectId: PROJECT_ID,
      region: REGION,
      functionsEmulatorHost: FUNCTIONS_EMULATOR_HOST,
      firestoreEmulatorHost: FIRESTORE_EMULATOR_HOST,
      authEmulatorHost: AUTH_EMULATOR_HOST || '(not set)',
      emulatorProjectId: emulatorProjectId ?? '(not detected)',
      expectedUrls: urls,
      error,
    });
  }
};

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    fail('HTTP error', {
      url,
      status: response.status,
      responseText: text,
      request: body,
    });
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    fail('Invalid JSON response', {
      url,
      status: response.status,
      responseText: text,
      request: body,
    });
  }
};

const postJsonSafe = async (
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; text: string; json?: any }> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { ok: response.ok, status: response.status, text, json };
};

const postJsonSafeWithAuth = async (
  url: string,
  body: unknown,
  idToken?: string
): Promise<{ ok: boolean; status: number; text: string; json?: any }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { ok: response.ok, status: response.status, text, json };
};

const postJsonRaw = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { ok: response.ok, status: response.status, text, json };
};

const getAdminIdToken = async (): Promise<string | null> => {
  if (!AUTH_EMULATOR_HOST) {
    return null;
  }
  const emulatorUrl = AUTH_EMULATOR_HOST.startsWith('http')
    ? AUTH_EMULATOR_HOST
    : `http://${AUTH_EMULATOR_HOST}`;
  const authBase = `${emulatorUrl}/identitytoolkit.googleapis.com/v1`;

  const email = 'smoke-admin@example.com';
  const password = 'smoke-admin-password';

  const signUpResponse = await postJsonRaw(
    `${authBase}/accounts:signUp?key=fake-key`,
    { email, password, returnSecureToken: true }
  );
  if (!signUpResponse.ok) {
    const errorMessage =
      typeof signUpResponse.json?.error?.message === 'string'
        ? signUpResponse.json.error.message
        : '';
    if (errorMessage !== 'EMAIL_EXISTS') {
      fail('Auth emulator token acquisition failed', {
        step: 'signUp',
        httpStatus: signUpResponse.status,
        responseText: signUpResponse.text,
        responseJson: signUpResponse.json,
      });
    }
  }

  const signInResponse = await postJsonRaw(
    `${authBase}/accounts:signInWithPassword?key=fake-key`,
    { email, password, returnSecureToken: true }
  );
  if (!signInResponse.ok || typeof signInResponse.json?.idToken !== 'string') {
    fail('Auth emulator token acquisition failed', {
      step: 'signIn',
      httpStatus: signInResponse.status,
      responseText: signInResponse.text,
      responseJson: signInResponse.json,
    });
  }
  return signInResponse.json.idToken as string;
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

const getCapacityBase = async (unitId: string, dateKey: string) => {
  const ref = db
    .collection('units')
    .doc(unitId)
    .collection('reservation_capacity')
    .doc(dateKey);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  const base = (data.count ?? data.totalCount ?? 0) as number;
  return { ref, data, base };
};

const readReservationData = async (
  reservationRef: FirebaseFirestore.DocumentReference
): Promise<Record<string, any>> => {
  const snap = await reservationRef.get();
  const data = (snap.data() || {}) as Record<string, any>;
  const startTime = data.startTime?.toDate?.()
    ? data.startTime.toDate()
    : data.startTime instanceof Date
    ? data.startTime
    : data.startTime;
  return { ...data, startTime };
};

const snapshotState = async (
  label: string,
  reservationRef: FirebaseFirestore.DocumentReference,
  unitId: string,
  dateKey: string
) => {
  const reservation = await readReservationData(reservationRef);
  const capacity = await getCapacityBase(unitId, dateKey);
  return {
    label,
    reservationStatus: reservation.status,
    headcount: reservation.headcount,
    ledgerApplied: reservation.capacityLedger?.applied,
    ledgerKey: reservation.capacityLedger?.key,
    ledgerTraceId: reservation.capacityLedger?.lastMutationTraceId,
    capacityBase: capacity.base,
    rawReservation: reservation,
    rawCapacity: capacity.data,
  };
};

const assertNoCapacityDoc = async (unitId: string, dateKey: string) => {
  const { data, base } = await getCapacityBase(unitId, dateKey);
  const count = typeof data?.count === 'number' ? data.count : 0;
  const totalCount = typeof data?.totalCount === 'number' ? data.totalCount : 0;
  const byTimeSlot = data?.byTimeSlot ?? {};
  const byTimeSlotKeys = Object.keys(byTimeSlot);
  const byTimeSlotAllZero = byTimeSlotKeys.every(
    slot => typeof byTimeSlot[slot] === 'number' && byTimeSlot[slot] === 0
  );
  const ok = base === 0 && count === 0 && totalCount === 0 && byTimeSlotAllZero;
  if (!ok) {
    fail('Unexpected capacity doc mutation', {
      unitId,
      dateKey,
      base,
      data,
    });
  }
  return { unitId, dateKey, base, data };
};

const assertReservationDocMissing = async (unitId: string, reservationId: string) => {
  const ref = db.collection('units').doc(unitId).collection('reservations').doc(reservationId);
  const snap = await ref.get();
  if (snap.exists) {
    fail('Unexpected reservation doc created', {
      unitId,
      reservationId,
      data: snap.data(),
    });
  }
  return { unitId, reservationId, exists: snap.exists };
};

const assertStateUnchanged = (
  before: Awaited<ReturnType<typeof snapshotState>>,
  after: Awaited<ReturnType<typeof snapshotState>>,
  context: string,
  extra?: Record<string, unknown>,
  options?: { includeHeadcount?: boolean }
) => {
  const includeHeadcount = options?.includeHeadcount ?? false;
  const mismatched =
    before.reservationStatus !== after.reservationStatus ||
    before.ledgerApplied !== after.ledgerApplied ||
    before.ledgerKey !== after.ledgerKey ||
    before.capacityBase !== after.capacityBase ||
    (includeHeadcount && before.headcount !== after.headcount);

  if (mismatched) {
    fail(context, {
      before,
      after,
      ...extra,
    });
  }
};

const runAdminNegativeCase = async (
  label: string,
  adminUrl: string,
  reservationRef: FirebaseFirestore.DocumentReference,
  unitId: string,
  dateKey: string,
  payload: Record<string, unknown>,
  adminIdToken: string,
  sideEffectChecks: Array<() => Promise<Record<string, unknown>>> = []
) => {
  const before = await snapshotState(`${label}-before`, reservationRef, unitId, dateKey);
  const beforeSideEffects = await Promise.all(sideEffectChecks.map(check => check()));
  const response = await postJsonSafeWithAuth(adminUrl, payload, adminIdToken);
  const afterSideEffects = await Promise.all(sideEffectChecks.map(check => check()));
  const after = await snapshotState(`${label}-after`, reservationRef, unitId, dateKey);
  if (response.ok) {
    fail(`${label} unexpectedly succeeded`, {
      response,
      payload,
      before,
      after,
      beforeSideEffects,
      afterSideEffects,
    });
  }
  assertStateUnchanged(
    before,
    after,
    `${label} mutated state`,
    { response, payload, beforeSideEffects, afterSideEffects },
    { includeHeadcount: true }
  );
};

const runGuestModifyNegativeCase = async (
  label: string,
  modifyUrl: string,
  reservationRef: FirebaseFirestore.DocumentReference,
  unitId: string,
  dateKey: string,
  payload: Record<string, unknown>,
  expectedHttpStatuses: number[] = []
) => {
  const before = await snapshotState(`${label}-before`, reservationRef, unitId, dateKey);
  const response = await postJsonSafe(modifyUrl, payload);
  const after = await snapshotState(`${label}-after`, reservationRef, unitId, dateKey);
  if (response.ok) {
    fail(`${label} unexpectedly succeeded`, {
      response,
      payload,
      expectedHttpStatuses,
      before,
      after,
    });
  }
  if (expectedHttpStatuses.length > 0 && !expectedHttpStatuses.includes(response.status)) {
    fail(`${label} unexpected status`, {
      response,
      payload,
      expectedHttpStatuses,
      before,
      after,
    });
  }
  assertStateUnchanged(
    before,
    after,
    `${label} mutated state`,
    { response, payload, expectedHttpStatuses },
    { includeHeadcount: true }
  );
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

const runScenarioAutoConfirm = async (urls: ReturnType<typeof buildFunctionUrls>) => {
  console.log('[SMOKE][SCENARIO] AUTO-CONFIRM');
  const unitId = `smoke-auto-unit-${Date.now()}`;
  const settingsRef = db.doc(`reservation_settings/${unitId}`);
  await settingsRef.set({
    reservationMode: 'auto',
    dailyCapacity: 10,
    bookableWindow: { from: '10:00', to: '22:00' },
    notificationEmails: [],
  });

  const { createUrl, modifyUrl, cancelUrl } = urls;

  const rawStart = nextFutureSlot(new Date(), 2);
  const startTime = clampToWindow(rawStart, '10:00', '22:00');
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const dateKey = dateKeyFromDate(startTime);
  const { base: baselineStart } = await getCapacityBase(unitId, dateKey);

  console.log('[SMOKE][PHASE] CREATE (AUTO)');
  const createResponse = await postJson<{ bookingId: string; manageToken: string }>(createUrl, {
    unitId,
    reservation: {
      name: 'Smoke Auto Confirm',
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
  const reservation = await readReservationData(reservationRef);
  assertTruthy(reservation.capacityLedger, 'capacityLedger missing on reservation');
  assertTruthy(reservation.capacityLedger.applied === true, 'capacityLedger.applied should be true');
  assertTruthy(reservation.capacityLedger.key, 'capacityLedger.key missing');
  console.log(`[SMOKE] post-create status (auto): ${reservation.status ?? 'unknown'}`);
  if (reservation.status !== 'confirmed') {
    fail('Auto-confirm scenario did not create confirmed reservation', {
      status: reservation.status,
      reservation,
    });
  }

  const capacityAfterCreate = await getCapacityBase(unitId, dateKey);
  assert.equal(capacityAfterCreate.base, baselineStart + 2);

  const modifyStart = new Date(startTime.getTime());
  const modifyEnd = new Date(endTime.getTime());
  const newDateKey = dateKeyFromDate(modifyStart);

  const modifyPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 3,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  };

  console.log('[SMOKE][PHASE] MODIFY NEGATIVE (AUTO)');
  await runGuestModifyNegativeCase(
    'modify-after-auto-confirm-old-date',
    modifyUrl,
    reservationRef,
    unitId,
    dateKey,
    modifyPayload,
    [400, 403]
  );
  await runGuestModifyNegativeCase(
    'modify-after-auto-confirm-new-date',
    modifyUrl,
    reservationRef,
    unitId,
    newDateKey,
    modifyPayload,
    [400, 403]
  );

  console.log('[SMOKE][PHASE] CANCEL (AUTO)');
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

  const capacityAfterCancel = await getCapacityBase(unitId, dateKey);
  assert.equal(capacityAfterCancel.base, baselineStart);

  console.log('[SMOKE][PHASE] CANCEL IDEMPOTENCY (AUTO)');
  const cancelBaseline = await snapshotState('cancel-idempotency-auto-before', reservationRef, unitId, dateKey);
  const cancelPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    action: 'cancel',
  };
  const secondCancel = await postJsonSafe(cancelUrl, cancelPayload);
  if (!secondCancel.ok) {
    const latestData = await readReservationData(reservationRef);
    fail('Second cancel HTTP failed', {
      httpStatus: secondCancel.status,
      responseText: secondCancel.text,
      request: cancelPayload,
      reservationStatus: latestData.status,
      reservationStartTime: latestData.startTime,
    });
  }
  const cancelAfter = await snapshotState('cancel-idempotency-auto-after', reservationRef, unitId, dateKey);
  assertStateUnchanged(
    cancelBaseline,
    cancelAfter,
    'Cancel idempotency failed',
    {
      secondCancel,
      cancelPayload,
      beforeBase: cancelBaseline.capacityBase,
      afterBase: cancelAfter.capacityBase,
    }
  );

  console.log('[SMOKE][PHASE] MODIFY AFTER CANCEL (AUTO)');
  const cancelledBaseline = await snapshotState('modify-after-cancel-auto-before', reservationRef, unitId, dateKey);
  const forbiddenAfterCancelPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 5,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  };
  const forbiddenAfterCancelResp = await postJsonSafe(modifyUrl, forbiddenAfterCancelPayload);
  if (forbiddenAfterCancelResp.ok) {
    const afterSnap = await readReservationData(reservationRef);
    fail('Modify after cancel unexpectedly succeeded', {
      httpStatus: forbiddenAfterCancelResp.status,
      responseText: forbiddenAfterCancelResp.text,
      request: forbiddenAfterCancelPayload,
      beforeReservation: cancelledBaseline.rawReservation,
      afterReservation: afterSnap,
    });
  }

  const cancelledAfter = await snapshotState('modify-after-cancel-auto-after', reservationRef, unitId, dateKey);
  assertStateUnchanged(
    cancelledBaseline,
    cancelledAfter,
    'Modify after cancel mutated state',
    {
      httpStatus: forbiddenAfterCancelResp.status,
      responseText: forbiddenAfterCancelResp.text,
      request: forbiddenAfterCancelPayload,
      beforeBase: cancelledBaseline.capacityBase,
      afterBase: cancelledAfter.capacityBase,
    }
  );
};

const runScenarioRequestPending = async (urls: ReturnType<typeof buildFunctionUrls>) => {
  console.log('[SMOKE][SCENARIO] REQUEST/PENDING');
  const unitId = `smoke-request-unit-${Date.now()}`;
  const settingsRef = db.doc(`reservation_settings/${unitId}`);
  await settingsRef.set({
    reservationMode: 'request',
    dailyCapacity: 10,
    bookableWindow: { from: '10:00', to: '22:00' },
    notificationEmails: [],
  });

  const { createUrl, modifyUrl, cancelUrl } = urls;

  const rawStart = nextFutureSlot(new Date(), 2);
  const startTime = clampToWindow(rawStart, '10:00', '22:00');
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  const dateKey = dateKeyFromDate(startTime);
  const { base: baselineStart } = await getCapacityBase(unitId, dateKey);

  console.log('[SMOKE][PHASE] CREATE (REQUEST)');
  const createResponse = await postJson<{ bookingId: string; manageToken: string }>(createUrl, {
    unitId,
    reservation: {
      name: 'Smoke Request Pending',
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
  const reservation = await readReservationData(reservationRef);
  assertTruthy(reservation.capacityLedger, 'capacityLedger missing on reservation');
  assertTruthy(reservation.capacityLedger.key, 'capacityLedger.key missing');
  console.log(
    `[SMOKE] post-create status (request): ${reservation.status ?? 'unknown'}; ` +
      `ledger.applied=${reservation.capacityLedger?.applied ?? 'unknown'}`
  );
  const validRequestStatuses = new Set(['pending', 'requested']);
  if (!reservation.status || !validRequestStatuses.has(reservation.status)) {
    fail('Request scenario did not create pending/requested reservation', {
      status: reservation.status,
      reservation,
    });
  }

  const capacityAfterCreate = await getCapacityBase(unitId, dateKey);
  if (reservation.capacityLedger?.applied === true) {
    assert.equal(capacityAfterCreate.base, baselineStart + 2);
  } else {
    assert.equal(capacityAfterCreate.base, baselineStart);
  }
  if (capacityAfterCreate.data.byTimeSlot) {
    const slotValue = capacityAfterCreate.data.byTimeSlot.afternoon;
    if (typeof slotValue === 'number') {
      assertTruthy(slotValue >= 2, 'byTimeSlot.afternoon should include headcount when present');
    }
  } else {
    console.log('Breakdown optional: byTimeSlot not present');
  }

  const modifyStart = new Date(startTime.getTime());
  const modifyEnd = new Date(endTime.getTime());
  const newDateKey = dateKeyFromDate(modifyStart);

  const modifyPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 3,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  };

  console.log('[SMOKE][PHASE] MODIFY');
  const modifyResponse = await postJsonSafe(modifyUrl, modifyPayload);
  if (!modifyResponse.ok) {
    const latestData = await readReservationData(reservationRef);
    fail('guestModifyReservation failed', {
      httpStatus: modifyResponse.status,
      responseText: modifyResponse.text,
      request: modifyPayload,
      reservationStatus: latestData.status,
      reservationStartTime: latestData.startTime,
    });
  }

  await delay(200);
  const updatedReservation = await readReservationData(reservationRef);
  if (updatedReservation.status && !validRequestStatuses.has(updatedReservation.status)) {
    fail('Reservation became non-modifiable after modify', {
      status: updatedReservation.status,
      reservation: updatedReservation,
    });
  }
  assert.equal(updatedReservation.headcount, 3);
  assertTruthy(updatedReservation.capacityLedger, 'capacityLedger missing after modify');

  const oldCapacity = await getCapacityBase(unitId, dateKey);
  const newCapacity = await getCapacityBase(unitId, newDateKey);
  if (updatedReservation.capacityLedger?.applied === true) {
    assert.equal(oldCapacity.base, baselineStart + 3);
    assert.equal(newCapacity.base, baselineStart + 3);
  } else {
    assert.equal(oldCapacity.base, baselineStart);
    assert.equal(newCapacity.base, baselineStart);
  }

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

  console.log('[SMOKE][PHASE] MODIFY IDEMPOTENCY');
  if (updatedReservation.status && validRequestStatuses.has(updatedReservation.status)) {
    const modifyBaselineOld = await snapshotState(
      'modify-idempotency-old-before',
      reservationRef,
      unitId,
      dateKey
    );
    const modifyBaselineNew = await snapshotState(
      'modify-idempotency-new-before',
      reservationRef,
      unitId,
      newDateKey
    );
    const secondModify = await postJsonSafe(modifyUrl, modifyPayload);
    if (!secondModify.ok) {
      const latestData = await readReservationData(reservationRef);
      fail('Second modify HTTP failed', {
        httpStatus: secondModify.status,
        responseText: secondModify.text,
        request: modifyPayload,
        reservationStatus: latestData.status,
        reservationStartTime: latestData.startTime,
      });
    }

    await delay(200);
    const modifyAfterOld = await snapshotState(
      'modify-idempotency-old-after',
      reservationRef,
      unitId,
      dateKey
    );
    const modifyAfterNew = await snapshotState(
      'modify-idempotency-new-after',
      reservationRef,
      unitId,
      newDateKey
    );
    assertStateUnchanged(
      modifyBaselineOld,
      modifyAfterOld,
      'Modify idempotency mutated old day',
      {
        secondModify,
        request: modifyPayload,
        beforeBase: modifyBaselineOld.capacityBase,
        afterBase: modifyAfterOld.capacityBase,
      },
      { includeHeadcount: true }
    );
    assertStateUnchanged(
      modifyBaselineNew,
      modifyAfterNew,
      'Modify idempotency mutated new day',
      {
        secondModify,
        request: modifyPayload,
        beforeBase: modifyBaselineNew.capacityBase,
        afterBase: modifyAfterNew.capacityBase,
      },
      { includeHeadcount: true }
    );
  } else {
    console.log('[SMOKE][PHASE] MODIFY IDEMPOTENCY SKIPPED (request no longer modifiable)');
  }

  console.log('[SMOKE][PHASE] FORBIDDEN MODIFY');
  await reservationRef.update({
    status: 'confirmed',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const forbiddenBaseline = await snapshotState('forbidden-modify-before', reservationRef, unitId, dateKey);

  const forbiddenPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 4,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  };
  const forbiddenResponse = await postJsonSafe(modifyUrl, forbiddenPayload);
  if (forbiddenResponse.ok) {
    const afterSnap = await readReservationData(reservationRef);
    fail('Forbidden modify unexpectedly succeeded', {
      httpStatus: forbiddenResponse.status,
      responseText: forbiddenResponse.text,
      request: forbiddenPayload,
      before: forbiddenBaseline.rawReservation,
      after: afterSnap,
    });
  }

  const forbiddenAfter = await snapshotState('forbidden-modify-after', reservationRef, unitId, dateKey);
  assertStateUnchanged(forbiddenBaseline, forbiddenAfter, 'Forbidden modify mutated state', {
    responseText: forbiddenResponse.text,
    httpStatus: forbiddenResponse.status,
    request: forbiddenPayload,
  });

  console.log('[SMOKE][PHASE] CANCEL');
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

  const capacityAfterCancel = await getCapacityBase(unitId, newDateKey);
  assert.equal(capacityAfterCancel.base, baselineStart);

  console.log('[SMOKE][PHASE] CANCEL IDEMPOTENCY');
  const cancelBaseline = await snapshotState('cancel-idempotency-before', reservationRef, unitId, newDateKey);
  const cancelPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    action: 'cancel',
  };
  const secondCancel = await postJsonSafe(cancelUrl, cancelPayload);
  if (!secondCancel.ok) {
    const latestData = await readReservationData(reservationRef);
    fail('Second cancel HTTP failed', {
      httpStatus: secondCancel.status,
      responseText: secondCancel.text,
      request: cancelPayload,
      reservationStatus: latestData.status,
      reservationStartTime: latestData.startTime,
    });
  }
  const cancelAfter = await snapshotState('cancel-idempotency-after', reservationRef, unitId, newDateKey);
  assertStateUnchanged(
    cancelBaseline,
    cancelAfter,
    'Cancel idempotency failed',
    {
      secondCancel,
      cancelPayload,
      beforeBase: cancelBaseline.capacityBase,
      afterBase: cancelAfter.capacityBase,
    }
  );

  console.log('[SMOKE][PHASE] MODIFY AFTER CANCEL');
  const cancelledBaseline = await snapshotState('modify-after-cancel-before', reservationRef, unitId, newDateKey);
  const forbiddenAfterCancelPayload = {
    unitId,
    reservationId: createResponse.bookingId,
    manageToken: createResponse.manageToken,
    headcount: 5,
    startTimeMs: modifyStart.getTime(),
    endTimeMs: modifyEnd.getTime(),
  };
  const forbiddenAfterCancelResp = await postJsonSafe(modifyUrl, forbiddenAfterCancelPayload);
  if (forbiddenAfterCancelResp.ok) {
    const afterSnap = await readReservationData(reservationRef);
    fail('Modify after cancel unexpectedly succeeded', {
      httpStatus: forbiddenAfterCancelResp.status,
      responseText: forbiddenAfterCancelResp.text,
      request: forbiddenAfterCancelPayload,
      beforeReservation: cancelledBaseline.rawReservation,
      afterReservation: afterSnap,
    });
  }

  const cancelledAfter = await snapshotState('modify-after-cancel-after', reservationRef, unitId, newDateKey);
  assertStateUnchanged(
    cancelledBaseline,
    cancelledAfter,
    'Modify after cancel mutated state',
    {
      httpStatus: forbiddenAfterCancelResp.status,
      responseText: forbiddenAfterCancelResp.text,
      request: forbiddenAfterCancelPayload,
      beforeBase: cancelledBaseline.capacityBase,
      afterBase: cancelledAfter.capacityBase,
    }
  );
};

const run = async () => {
  console.log('Starting reservation smoke test...');
  const urls = buildFunctionUrls(FUNCTIONS_EMULATOR_HOST, PROJECT_ID, REGION);
  logEnvAndUrls(urls);
  await preflightFunctionsEmulator(urls);

  await runScenarioAutoConfirm(urls);
  await runScenarioRequestPending(urls);

  const { createUrl, adminUrl } = urls;

  const adminIdToken = await getAdminIdToken();
  if (!adminIdToken) {
    console.warn('WARN: Auth emulator not detected, skipping admin approval smoke');
  } else {
    console.log('[SMOKE][PHASE] ADMIN');
    console.log('Auth emulator detected, running admin approval smoke');
    const adminUnitId = `smoke-admin-unit-${Date.now()}`;
    const adminSettingsRef = db.doc(`reservation_settings/${adminUnitId}`);
    await adminSettingsRef.set({
      reservationMode: 'request',
      dailyCapacity: 10,
      bookableWindow: { from: '10:00', to: '22:00' },
      notificationEmails: [],
    });

    const adminStart = clampToWindow(nextFutureSlot(new Date(), 3), '10:00', '22:00');
    const adminEnd = new Date(adminStart.getTime() + 60 * 60 * 1000);
    const adminDateKey = dateKeyFromDate(adminStart);
    const { base: adminBaselineBase } = await getCapacityBase(adminUnitId, adminDateKey);
    const adminHeadcount = 2;

    const adminCreateResponse = await postJson<{
      bookingId: string;
      manageToken: string;
      adminActionToken?: string;
    }>(createUrl, {
      unitId: adminUnitId,
      reservation: {
        name: 'Smoke Admin Approve',
        headcount: adminHeadcount,
        startTime: adminStart.toISOString(),
        endTime: adminEnd.toISOString(),
        preferredTimeSlot: 'afternoon',
        seatingPreference: 'any',
        contact: { email: 'smoke-admin@example.com' },
      },
    });

    if (!adminCreateResponse.adminActionToken) {
      fail('adminActionToken missing from guestCreateReservation response', {
        responseKeys: Object.keys(adminCreateResponse),
      });
    }

    const adminReservationRef = db
      .collection('units')
      .doc(adminUnitId)
      .collection('reservations')
      .doc(adminCreateResponse.bookingId);

    await delay(200);
    const adminReservationSnap = await adminReservationRef.get();
    const adminReservation = adminReservationSnap.data() || {};
    assert.equal(adminReservation.status, 'pending');

    const adminApprovePayload = {
      unitId: adminUnitId,
      reservationId: adminCreateResponse.bookingId,
      adminToken: adminCreateResponse.adminActionToken,
      action: 'approve',
    };
    const adminApproveResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminApprovePayload,
      adminIdToken
    );
    if (!adminApproveResponse.ok) {
      const latestSnap = await adminReservationRef.get();
      fail('Admin approve failed', {
        httpStatus: adminApproveResponse.status,
        responseText: adminApproveResponse.text,
        request: adminApprovePayload,
        reservation: latestSnap.data(),
      });
    }

    await delay(200);
    const adminApprovedSnap = await adminReservationRef.get();
    const adminApprovedReservation = adminApprovedSnap.data() || {};
    const adminApprovedCapacity = await getCapacityBase(adminUnitId, adminDateKey);
    assert.equal(adminApprovedReservation.status, 'confirmed');
    assert.equal(adminApprovedReservation.capacityLedger?.applied, true);
    assert.equal(adminApprovedCapacity.base, adminBaselineBase + adminHeadcount);

    const adminApproveIdempotencyBefore = await snapshotState(
      'admin-approve-idempotency-before',
      adminReservationRef,
      adminUnitId,
      adminDateKey
    );
    const adminApproveAgainResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminApprovePayload,
      adminIdToken
    );
    if (!adminApproveAgainResponse.ok) {
      const latestSnap = await adminReservationRef.get();
      fail('Admin approve idempotency HTTP failed', {
        httpStatus: adminApproveAgainResponse.status,
        responseText: adminApproveAgainResponse.text,
        request: adminApprovePayload,
        reservation: latestSnap.data(),
      });
    }
    const adminApproveIdempotencyAfter = await snapshotState(
      'admin-approve-idempotency-after',
      adminReservationRef,
      adminUnitId,
      adminDateKey
    );
    assertStateUnchanged(
      adminApproveIdempotencyBefore,
      adminApproveIdempotencyAfter,
      'Admin approve idempotency failed',
      {
        response: adminApproveAgainResponse,
        payload: adminApprovePayload,
      },
      { includeHeadcount: true }
    );

    const adminReuseAfterApproveBefore = await snapshotState(
      'admin-approve-token-reuse-before',
      adminReservationRef,
      adminUnitId,
      adminDateKey
    );
    const adminReusePayload = {
      unitId: adminUnitId,
      reservationId: adminCreateResponse.bookingId,
      adminToken: adminCreateResponse.adminActionToken,
      action: 'reject',
    };
    const adminReuseResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminReusePayload,
      adminIdToken
    );
    const adminReuseAfterApproveAfter = await snapshotState(
      'admin-approve-token-reuse-after',
      adminReservationRef,
      adminUnitId,
      adminDateKey
    );
    if (adminReuseResponse.ok) {
      fail('Admin token reuse unexpectedly succeeded', {
        response: adminReuseResponse,
        payload: adminReusePayload,
        before: adminReuseAfterApproveBefore,
        after: adminReuseAfterApproveAfter,
      });
    }
    assertStateUnchanged(
      adminReuseAfterApproveBefore,
      adminReuseAfterApproveAfter,
      'Admin token reuse mutated state',
      {
        response: adminReuseResponse,
        payload: adminReusePayload,
      },
      { includeHeadcount: true }
    );

    await runAdminNegativeCase(
      'admin-approve-negative-wrong-token',
      adminUrl,
      adminReservationRef,
      adminUnitId,
      adminDateKey,
      {
        ...adminApprovePayload,
        adminToken: 'wrong-token',
      },
      adminIdToken
    );
    await runAdminNegativeCase(
      'admin-approve-negative-wrong-unit',
      adminUrl,
      adminReservationRef,
      adminUnitId,
      adminDateKey,
      {
        ...adminApprovePayload,
        unitId: 'other-unit',
      },
      adminIdToken,
      [() => assertNoCapacityDoc('other-unit', adminDateKey)]
    );
    await runAdminNegativeCase(
      'admin-approve-negative-wrong-reservation',
      adminUrl,
      adminReservationRef,
      adminUnitId,
      adminDateKey,
      {
        ...adminApprovePayload,
        reservationId: 'does-not-exist',
      },
      adminIdToken,
      [() => assertReservationDocMissing(adminUnitId, 'does-not-exist')]
    );
    await runAdminNegativeCase(
      'admin-approve-negative-invalid-action',
      adminUrl,
      adminReservationRef,
      adminUnitId,
      adminDateKey,
      {
        ...adminApprovePayload,
        action: 'banana',
      },
      adminIdToken
    );

    const rejectStart = clampToWindow(nextFutureSlot(new Date(), 4), '10:00', '22:00');
    const rejectEnd = new Date(rejectStart.getTime() + 60 * 60 * 1000);
    const rejectDateKey = dateKeyFromDate(rejectStart);
    const { base: rejectBaselineBase } = await getCapacityBase(adminUnitId, rejectDateKey);
    const rejectHeadcount = 3;

    const rejectCreateResponse = await postJson<{
      bookingId: string;
      manageToken: string;
      adminActionToken?: string;
    }>(createUrl, {
      unitId: adminUnitId,
      reservation: {
        name: 'Smoke Admin Reject',
        headcount: rejectHeadcount,
        startTime: rejectStart.toISOString(),
        endTime: rejectEnd.toISOString(),
        preferredTimeSlot: 'evening',
        seatingPreference: 'any',
        contact: { email: 'smoke-admin-reject@example.com' },
      },
    });

    if (!rejectCreateResponse.adminActionToken) {
      fail('adminActionToken missing from guestCreateReservation response', {
        responseKeys: Object.keys(rejectCreateResponse),
      });
    }

    const rejectReservationRef = db
      .collection('units')
      .doc(adminUnitId)
      .collection('reservations')
      .doc(rejectCreateResponse.bookingId);

    await delay(200);
    const rejectReservationSnap = await rejectReservationRef.get();
    const rejectReservation = rejectReservationSnap.data() || {};
    assert.equal(rejectReservation.status, 'pending');

    const adminRejectPayload = {
      unitId: adminUnitId,
      reservationId: rejectCreateResponse.bookingId,
      adminToken: rejectCreateResponse.adminActionToken,
      action: 'reject',
    };
    const adminRejectResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminRejectPayload,
      adminIdToken
    );
    if (!adminRejectResponse.ok) {
      const latestSnap = await rejectReservationRef.get();
      fail('Admin reject failed', {
        httpStatus: adminRejectResponse.status,
        responseText: adminRejectResponse.text,
        request: adminRejectPayload,
        reservation: latestSnap.data(),
      });
    }

    await delay(200);
    const rejectedSnap = await rejectReservationRef.get();
    const rejectedReservation = rejectedSnap.data() || {};
    const rejectedCapacity = await getCapacityBase(adminUnitId, rejectDateKey);
    assert.equal(rejectedReservation.status, 'cancelled');
    assert.equal(rejectedReservation.capacityLedger?.applied, false);
    assert.equal(rejectedCapacity.base, rejectBaselineBase);

    const adminRejectIdempotencyBefore = await snapshotState(
      'admin-reject-idempotency-before',
      rejectReservationRef,
      adminUnitId,
      rejectDateKey
    );
    const adminRejectAgainResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminRejectPayload,
      adminIdToken
    );
    if (!adminRejectAgainResponse.ok) {
      const latestSnap = await rejectReservationRef.get();
      fail('Admin reject idempotency HTTP failed', {
        httpStatus: adminRejectAgainResponse.status,
        responseText: adminRejectAgainResponse.text,
        request: adminRejectPayload,
        reservation: latestSnap.data(),
      });
    }
    const adminRejectIdempotencyAfter = await snapshotState(
      'admin-reject-idempotency-after',
      rejectReservationRef,
      adminUnitId,
      rejectDateKey
    );
    assertStateUnchanged(
      adminRejectIdempotencyBefore,
      adminRejectIdempotencyAfter,
      'Admin reject idempotency failed',
      {
        response: adminRejectAgainResponse,
        payload: adminRejectPayload,
      },
      { includeHeadcount: true }
    );

    const adminReuseAfterRejectBefore = await snapshotState(
      'admin-reject-token-reuse-before',
      rejectReservationRef,
      adminUnitId,
      rejectDateKey
    );
    const adminReuseRejectPayload = {
      unitId: adminUnitId,
      reservationId: rejectCreateResponse.bookingId,
      adminToken: rejectCreateResponse.adminActionToken,
      action: 'approve',
    };
    const adminReuseRejectResponse = await postJsonSafeWithAuth(
      adminUrl,
      adminReuseRejectPayload,
      adminIdToken
    );
    const adminReuseAfterRejectAfter = await snapshotState(
      'admin-reject-token-reuse-after',
      rejectReservationRef,
      adminUnitId,
      rejectDateKey
    );
    if (adminReuseRejectResponse.ok) {
      fail('Admin token reuse unexpectedly succeeded', {
        response: adminReuseRejectResponse,
        payload: adminReuseRejectPayload,
        before: adminReuseAfterRejectBefore,
        after: adminReuseAfterRejectAfter,
      });
    }
    assertStateUnchanged(
      adminReuseAfterRejectBefore,
      adminReuseAfterRejectAfter,
      'Admin token reuse mutated state',
      {
        response: adminReuseRejectResponse,
        payload: adminReuseRejectPayload,
      },
      { includeHeadcount: true }
    );

    await runAdminNegativeCase(
      'admin-reject-negative-wrong-token',
      adminUrl,
      rejectReservationRef,
      adminUnitId,
      rejectDateKey,
      {
        ...adminRejectPayload,
        adminToken: 'wrong-token',
      },
      adminIdToken
    );
    await runAdminNegativeCase(
      'admin-reject-negative-wrong-unit',
      adminUrl,
      rejectReservationRef,
      adminUnitId,
      rejectDateKey,
      {
        ...adminRejectPayload,
        unitId: 'other-unit',
      },
      adminIdToken,
      [() => assertNoCapacityDoc('other-unit', rejectDateKey)]
    );
    await runAdminNegativeCase(
      'admin-reject-negative-wrong-reservation',
      adminUrl,
      rejectReservationRef,
      adminUnitId,
      rejectDateKey,
      {
        ...adminRejectPayload,
        reservationId: 'does-not-exist',
      },
      adminIdToken,
      [() => assertReservationDocMissing(adminUnitId, 'does-not-exist')]
    );
    await runAdminNegativeCase(
      'admin-reject-negative-invalid-action',
      adminUrl,
      rejectReservationRef,
      adminUnitId,
      rejectDateKey,
      {
        ...adminRejectPayload,
        action: 'banana',
      },
      adminIdToken
    );
  }

  console.log('\nSMOKE PASS: reservation flow verified.');
};

run().catch(err => {
  console.error(err);
  fail('Unhandled error in smoke test');
});
