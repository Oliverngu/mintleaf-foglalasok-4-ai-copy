export type FirestoreValue = unknown;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Firestore rejects `undefined` values, so we must remove them before writes.
 * This utility keeps null/falsey values, cleans nested objects recursively, and
 * strips undefined entries from arrays instead of replacing them with placeholders.
 */
export const cleanFirestoreData = <T extends FirestoreValue>(data: T): T => {
  const cleanValue = (value: FirestoreValue): FirestoreValue => {
    if (value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      const cleanedArray = value
        .map(item => cleanValue(item))
        .filter((item): item is FirestoreValue => item !== undefined);

      return cleanedArray;
    }

    if (isPlainObject(value)) {
      return Object.entries(value).reduce<Record<string, FirestoreValue>>((acc, [key, val]) => {
        const cleanedVal = cleanValue(val);

        if (cleanedVal !== undefined) {
          acc[key] = cleanedVal;
        }

        return acc;
      }, {}) as T;
    }

    return value;
  };

  return cleanValue(data) as T;
};
