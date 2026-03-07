import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isInvitationExpired,
  isInvitationRedeemable,
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
