export type ReservationErrorKind =
  | 'network'
  | 'timeout'
  | 'invalid'
  | 'conflict'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_found'
  | 'server'
  | 'unknown';

export type ReservationError = {
  kind: ReservationErrorKind;
  messagePublic: string;
  messageDebug?: string;
  retryable: boolean;
  status?: number;
  traceId?: string | null;
};

type MessageMap = Record<ReservationErrorKind, string>;

const getKindFromStatus = (status: number): ReservationErrorKind => {
  if (status === 400) return 'invalid';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
};

const isRetryable = (kind: ReservationErrorKind) =>
  ['network', 'timeout', 'rate_limited', 'server'].includes(kind);

const readResponseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) return { rawText: '', json: null as unknown };
  try {
    return { rawText: text, json: JSON.parse(text) as unknown };
  } catch {
    return { rawText: text, json: null as unknown };
  }
};

export const normalizeReservationError = async ({
  response,
  error,
  messages,
}: {
  response?: Response;
  error?: unknown;
  messages: MessageMap;
}): Promise<ReservationError> => {
  if (response) {
    const { rawText, json } = await readResponseBody(response);
    const kind = getKindFromStatus(response.status);
    const traceId =
      (json as Record<string, unknown> | null)?.traceId ??
      (json as Record<string, unknown> | null)?.requestId ??
      null;
    const jsonMessage = (json as Record<string, unknown> | null)?.message;
    const messageDebug =
      (typeof jsonMessage === 'string' ? jsonMessage : undefined) ||
      response.statusText ||
      rawText ||
      undefined;
    return {
      kind,
      messagePublic: messages[kind] || messages.unknown,
      messageDebug: typeof messageDebug === 'string' ? messageDebug : undefined,
      retryable: isRetryable(kind),
      status: response.status,
      traceId: typeof traceId === 'string' ? traceId : null,
    };
  }

  if (error && typeof error === 'object') {
    const err = error as { name?: string; message?: string };
    if (err.name === 'AbortError') {
      return {
        kind: 'timeout',
        messagePublic: messages.timeout,
        messageDebug: err.message,
        retryable: true,
      };
    }
    if (error instanceof TypeError) {
      return {
        kind: 'network',
        messagePublic: messages.network,
        messageDebug: err.message,
        retryable: true,
      };
    }
  }

  return {
    kind: 'unknown',
    messagePublic: messages.unknown,
    messageDebug: error instanceof Error ? error.message : undefined,
    retryable: false,
  };
};
