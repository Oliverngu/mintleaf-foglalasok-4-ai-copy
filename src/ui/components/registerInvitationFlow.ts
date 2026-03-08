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

export const mapClaimRecoveryErrorMessage = (
  fallbackMessage: string,
  code?: string,
  details?: unknown
): string => {
  const normalizedCode = typeof code === 'string' ? code.replace(/^functions\//, '') : code;

  switch (normalizedCode) {
    case 'not-found':
      return 'A helyreállításhoz szükséges meghívó vagy felhasználó nem található.';
    case 'failed-precondition':
      return 'A meghívó állapota miatt most nem futtatható helyreállítás.';
    case 'permission-denied':
      return 'Nincs jogosultság a helyreállításhoz. Próbáld újra később.';
    case 'deadline-exceeded':
      return 'A helyreállítás időtúllépés miatt megszakadt. Próbáld újra.';
    case 'already-exists':
      return 'A fiók már másik felhasználóhoz kapcsolódik, nem törölhető automatikusan.';
    default:
      if (typeof details === 'string' && details.trim()) {
        return details;
      }
      return fallbackMessage;
  }
};
