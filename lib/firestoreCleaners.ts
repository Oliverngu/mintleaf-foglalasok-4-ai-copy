export type FirestoreValue = unknown;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Firestore rejects `undefined` values, so we must remove them before writes.
 * This utility keeps null/falsey values and cleans nested objects recursively.
 */
export const cleanFirestoreData = <T extends FirestoreValue>(data: T): T => {
  const cleanValue = (value: FirestoreValue): FirestoreValue => {
    if (value === undefined) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => {
        const cleanedItem = cleanValue(item);
        return cleanedItem === undefined ? null : cleanedItem;
      });
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
