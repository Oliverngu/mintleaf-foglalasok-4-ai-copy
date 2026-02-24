import { getOnlineStatus } from './getOnlineStatus';

export type SubmitErrorKind =
  | 'network'
  | 'validation'
  | 'rate_limit'
  | 'server'
  | 'unknown';

export type SubmitError = {
  userTitle: string;
  userMessage: string;
  debugId: string | null;
  kind: SubmitErrorKind;
};

const messages: Record<
  'hu' | 'en',
  Record<SubmitErrorKind, { title: string; message: string }>
> = {
  hu: {
    network: {
      title: 'Nem sikerült csatlakozni',
      message: 'Nincs internetkapcsolat vagy a szerver nem elérhető. Próbáld újra.',
    },
    rate_limit: {
      title: 'Túl sok próbálkozás',
      message:
        'Túl sok próbálkozás rövid idő alatt. Várj egy kicsit és próbáld újra.',
    },
    validation: {
      title: 'Hibás adatok',
      message: 'Néhány adat hibás vagy hiányzik. Ellenőrizd a mezőket.',
    },
    server: {
      title: 'Szerverhiba',
      message: 'Szerverhiba történt. Próbáld újra később.',
    },
    unknown: {
      title: 'Ismeretlen hiba',
      message: 'Ismeretlen hiba történt. Próbáld újra.',
    },
  },
  en: {
    network: {
      title: 'Connection failed',
      message: 'No internet connection or the server is unavailable. Please try again.',
    },
    rate_limit: {
      title: 'Too many attempts',
      message: 'Too many attempts in a short time. Wait a bit and try again.',
    },
    validation: {
      title: 'Invalid details',
      message: 'Some details are missing or invalid. Please check the fields.',
    },
    server: {
      title: 'Server error',
      message: 'A server error occurred. Please try again later.',
    },
    unknown: {
      title: 'Unknown error',
      message: 'An unknown error occurred. Please try again.',
    },
  },
};

const getStatus = (response?: Response): number | undefined => response?.status;

const getErrorMessage = (error?: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
};

export const normalizeSubmitError = ({
  response,
  error,
  isOnline,
  traceId,
  locale = 'hu',
}: {
  response?: Response;
  error?: unknown;
  isOnline?: boolean;
  traceId?: string | null;
  locale?: 'hu' | 'en';
}): SubmitError => {
  const status = getStatus(response);
  const message = getErrorMessage(error);
  const online = getOnlineStatus(isOnline);

  let kind: SubmitErrorKind = 'unknown';
  if (online === false || /failed to fetch|networkerror/i.test(message)) {
    kind = 'network';
  } else if (status === 429 || /rate.*limit/i.test(message)) {
    kind = 'rate_limit';
  } else if (status === 400 || status === 422 || /invalid|missing|required/i.test(message)) {
    kind = 'validation';
  } else if (typeof status === 'number' && status >= 500) {
    kind = 'server';
  }

  const { title, message: userMessage } = messages[locale][kind];

  return {
    kind,
    userTitle: title,
    userMessage,
    debugId: traceId ?? null,
  };
};
