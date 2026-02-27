const PERMISSION_CODE = 'permission-denied';

type ErrorLike = {
  code?: string;
  message?: string;
  name?: string;
};

export const isPermissionDenied = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const value = err as ErrorLike;
  return value.code === PERMISSION_CODE || value.code === `firestore/${PERMISSION_CODE}`;
};

export const toUserMessage = (err: unknown, fallback: string): string => {
  if (isPermissionDenied(err)) {
    return 'Nincs jogosultságod ehhez a művelethez.';
  }

  if (err && typeof err === 'object') {
    const value = err as ErrorLike;
    if (value.name === 'SchedulerGuardError' && typeof value.message === 'string' && value.message) {
      return value.message;
    }
  }

  return fallback;
};

export const logSchedulerError = (context: string, err: unknown, details?: Record<string, unknown>): void => {
  console.error(`[scheduler] ${context}`, {
    details,
    error: err,
  });
};
