import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReservationError } from './normalizeReservationError';

const messages = {
  invalid: 'invalid',
  conflict: 'conflict',
  rate_limited: 'rate_limited',
  unauthorized: 'unauthorized',
  not_found: 'not_found',
  server: 'server',
  network: 'network',
  timeout: 'timeout',
  unknown: 'unknown',
};

test('normalizeReservationError maps conflict response', async () => {
  const response = new Response(JSON.stringify({ message: 'conflict', traceId: 't1' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
  const normalized = await normalizeReservationError({ response, messages });
  assert.equal(normalized.kind, 'conflict');
  assert.equal(normalized.messagePublic, 'conflict');
  assert.equal(normalized.traceId, 't1');
  assert.equal(normalized.retryable, false);
});

test('normalizeReservationError maps network errors', async () => {
  const normalized = await normalizeReservationError({
    error: new TypeError('failed to fetch'),
    messages,
  });
  assert.equal(normalized.kind, 'network');
  assert.equal(normalized.retryable, true);
});

test('normalizeReservationError maps timeout errors', async () => {
  const normalized = await normalizeReservationError({
    error: { name: 'AbortError', message: 'timeout' },
    messages,
  });
  assert.equal(normalized.kind, 'timeout');
  assert.equal(normalized.retryable, true);
});

test('normalizeReservationError falls back to unknown', async () => {
  const normalized = await normalizeReservationError({ error: 'nope', messages });
  assert.equal(normalized.kind, 'unknown');
  assert.equal(normalized.retryable, false);
});
