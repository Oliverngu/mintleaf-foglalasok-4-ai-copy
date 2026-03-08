import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isInvitationExpired,
  isInvitationRedeemable,
  mapClaimRecoveryErrorMessage,
  resolveInvitationMode,
  validateClaimExistingInvitation,
} from './registerInvitationFlow';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

test('resolveInvitationMode defaults to create', () => {
  assert.equal(resolveInvitationMode({}), 'create');
  assert.equal(resolveInvitationMode({ mode: 'claim_existing' }), 'claim_existing');
});

test('isInvitationExpired handles missing and past/future dates', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(isInvitationExpired(undefined, now), false);
  assert.equal(isInvitationExpired(ts('2025-12-31T23:59:59.000Z'), now), true);
  assert.equal(isInvitationExpired(ts('2026-01-01T00:00:01.000Z'), now), false);
});

test('isInvitationRedeemable requires active and non-expired', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(isInvitationRedeemable({ status: 'active', expiresAt: ts('2026-01-02T00:00:00.000Z') }, now), true);
  assert.equal(isInvitationRedeemable({ status: 'used', expiresAt: ts('2026-01-02T00:00:00.000Z') }, now), false);
  assert.equal(isInvitationRedeemable({ status: 'active', expiresAt: ts('2025-12-31T23:59:59.000Z') }, now), false);
});

test('validateClaimExistingInvitation enforces existingUserId', () => {
  assert.equal(validateClaimExistingInvitation({ mode: 'create' }), null);
  assert.equal(validateClaimExistingInvitation({ mode: 'claim_existing' }), 'A meghívó hibás: hiányzó felhasználó-azonosító.');
  assert.equal(validateClaimExistingInvitation({ mode: 'claim_existing', existingUserId: 'user-1' }), null);
});

test('mapClaimRecoveryErrorMessage maps callable error codes to user-safe messages', () => {
  const fallback = 'fallback';
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'not-found'), 'A helyreállításhoz szükséges meghívó vagy felhasználó nem található.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'failed-precondition'), 'A meghívó állapota miatt most nem futtatható helyreállítás.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'permission-denied'), 'Nincs jogosultság a helyreállításhoz. Próbáld újra később.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'deadline-exceeded'), 'A helyreállítás időtúllépés miatt megszakadt. Próbáld újra.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'already-exists'), 'A fiók már másik felhasználóhoz kapcsolódik, nem törölhető automatikusan.');

  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/not-found'), 'A helyreállításhoz szükséges meghívó vagy felhasználó nem található.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/failed-precondition'), 'A meghívó állapota miatt most nem futtatható helyreállítás.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/permission-denied'), 'Nincs jogosultság a helyreállításhoz. Próbáld újra később.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/deadline-exceeded'), 'A helyreállítás időtúllépés miatt megszakadt. Próbáld újra.');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/already-exists'), 'A fiók már másik felhasználóhoz kapcsolódik, nem törölhető automatikusan.');

  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/internal', 'Részletes hiba'), 'Részletes hiba');
  assert.equal(mapClaimRecoveryErrorMessage(fallback, 'functions/internal', { message: 'nope' }), fallback);
});
