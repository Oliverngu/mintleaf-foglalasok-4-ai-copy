export type InvitationMode = 'create' | 'claim_existing';

type TimestampLike = { toDate: () => Date };

type InvitationLike = {
  status?: unknown;
  mode?: unknown;
  existingUserId?: unknown;
  expiresAt?: TimestampLike | null;
};

export const resolveInvitationMode = (value: InvitationLike): InvitationMode =>
  value.mode === 'claim_existing' ? 'claim_existing' : 'create';

export const isInvitationExpired = (
  expiresAt: TimestampLike | null | undefined,
  now = new Date()
): boolean => {
  if (!expiresAt) return false;
  const expiresAtDate = expiresAt.toDate();
  return expiresAtDate.getTime() <= now.getTime();
};

export const isInvitationRedeemable = (value: InvitationLike, now = new Date()): boolean => {
  if (value.status !== 'active') return false;
  return !isInvitationExpired(value.expiresAt, now);
};

export const validateClaimExistingInvitation = (value: InvitationLike): string | null => {
  if (resolveInvitationMode(value) !== 'claim_existing') return null;
  if (typeof value.existingUserId !== 'string' || !value.existingUserId.trim()) {
    return 'A meghívó hibás: hiányzó felhasználó-azonosító.';
  }
  return null;
};
