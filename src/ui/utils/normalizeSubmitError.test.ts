import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeSubmitError } from './normalizeSubmitError';

test('normalizeSubmitError maps network Failed to fetch', () => {
  const normalized = normalizeSubmitError({ error: new Error('Failed to fetch') });
  assert.equal(normalized.kind, 'network');
  assert.equal(
    normalized.userMessage,
    'Nincs internetkapcsolat vagy a szerver nem elérhető. Próbáld újra.'
  );
});

test('normalizeSubmitError maps offline navigator state', () => {
  const normalized = normalizeSubmitError({ isOnline: false });
  assert.equal(normalized.kind, 'network');
});

test('normalizeSubmitError maps rate limit status', () => {
  const response = new Response(null, { status: 429 });
  const normalized = normalizeSubmitError({ response });
  assert.equal(normalized.kind, 'rate_limit');
});

test('normalizeSubmitError maps validation status', () => {
  const response = new Response(null, { status: 400 });
  const normalized = normalizeSubmitError({ response });
  assert.equal(normalized.kind, 'validation');
});

test('normalizeSubmitError maps server status', () => {
  const response = new Response(null, { status: 500 });
  const normalized = normalizeSubmitError({ response });
  assert.equal(normalized.kind, 'server');
});

test('normalizeSubmitError falls back to unknown', () => {
  const normalized = normalizeSubmitError({ error: new Error('something odd') });
  assert.equal(normalized.kind, 'unknown');
});

test('normalizeSubmitError supports english locale', () => {
  const normalized = normalizeSubmitError({
    error: new Error('Failed to fetch'),
    locale: 'en',
  });
  assert.equal(normalized.kind, 'network');
  assert.equal(
    normalized.userMessage,
    'No internet connection or the server is unavailable. Please try again.'
  );
});
