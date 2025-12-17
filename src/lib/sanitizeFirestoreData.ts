export function sanitizeFirestoreData<T>(value: T): T {
  const sanitize = (input: unknown): unknown => {
    if (input === undefined) return undefined;
    if (input === null) return null;

    if (Array.isArray(input)) {
      const sanitizedItems = input
        .map(item => sanitize(item))
        .filter(item => item !== undefined);
      return sanitizedItems;
    }

    if (typeof input === 'object') {
      const proto = Object.getPrototypeOf(input);
      const isPlainObject = proto === Object.prototype || proto === null;
      if (!isPlainObject) return input;

      const entries = Object.entries(input as Record<string, unknown>);
      const sanitizedEntries = entries
        .map(([key, val]) => [key, sanitize(val)] as const)
        .filter(([, val]) => val !== undefined);
      return Object.fromEntries(sanitizedEntries);
    }

    return input;
  };

  return sanitize(value) as T;
}

export function hasUndefinedDeep(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null) return false;
  if (Array.isArray(value)) return value.some(item => hasUndefinedDeep(item));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const isPlainObject = proto === Object.prototype || proto === null;
    if (!isPlainObject) return false;
    return Object.values(value as Record<string, unknown>).some(hasUndefinedDeep);
  }
  return false;
}

export function assertNoUndefinedDeep(value: unknown, label?: string): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!hasUndefinedDeep(value)) return;
  const message = label ? `${label} contains undefined values` : 'Value contains undefined values';
  console.error(message, value);
  throw new Error(message);
}
