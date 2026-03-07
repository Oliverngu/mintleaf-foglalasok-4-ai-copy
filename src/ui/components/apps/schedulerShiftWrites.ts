import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  type Firestore,
  type WriteBatch,
  Timestamp,
} from 'firebase/firestore';

import type { Shift } from '../../../core/models/data';

type ShiftWritePayload = Partial<Omit<Shift, 'id'>>;

const SHIFT_ALLOWED_FIELDS: Array<keyof Omit<Shift, 'id'>> = [
  'userId',
  'userName',
  'unitId',
  'position',
  'start',
  'end',
  'note',
  'status',
  'isDayOff',
  'isHighlighted',
  'dayKey',
];

type TimestampLike = {
  toDate: () => Date;
  seconds: number;
  nanoseconds: number;
};

const isFirestoreTimestampLike = (value: unknown): value is TimestampLike => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { toDate?: unknown; seconds?: unknown; nanoseconds?: unknown };
  return (
    typeof candidate.toDate === 'function' &&
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number'
  );
};

const toCanonicalTimestamp = (value: { toDate: () => Date }): Timestamp =>
  Timestamp.fromDate(value.toDate());

export const normalizeShiftTimeInput = (value: unknown): Timestamp | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return isFirestoreTimestampLike(value) ? toCanonicalTimestamp(value) : undefined;
};

const normalizeTimeField = (value: unknown): Timestamp | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return isFirestoreTimestampLike(value) ? toCanonicalTimestamp(value) : undefined;
};

const normalizeNoteField = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
};

/**
 * Sanitization contract:
 * - Unknown keys are dropped.
 * - `start` and `end` accept only Firestore Timestamp or null (for clear).
 * - `note` accepts string or null (for clear).
 * - `undefined` means no-op on that field.
 */
export const sanitizeShiftPayload = (payload: Partial<Shift>): ShiftWritePayload => {
  const sanitized: ShiftWritePayload = {};

  SHIFT_ALLOWED_FIELDS.forEach(field => {
    const value = payload[field];
    if (field === 'start' || field === 'end') {
      const normalized = normalizeTimeField(value);
      if (normalized !== undefined) {
        (sanitized as ShiftWritePayload)[field] = normalized as any;
      }
      return;
    }

    if (field === 'note') {
      const normalized = normalizeNoteField(value);
      if (normalized !== undefined) {
        sanitized.note = normalized;
      }
      return;
    }

    if (value !== undefined) {
      (sanitized as ShiftWritePayload)[field] = value as any;
    }
  });

  return sanitized;
};

export const createShift = async (db: Firestore, payload: Partial<Shift>): Promise<void> => {
  await addDoc(collection(db, 'shifts'), sanitizeShiftPayload(payload));
};

export const updateShift = async (
  db: Firestore,
  shiftId: string,
  payload: Partial<Shift>
): Promise<void> => {
  await updateDoc(doc(db, 'shifts', shiftId), sanitizeShiftPayload(payload));
};

export const deleteShift = async (db: Firestore, shiftId: string): Promise<void> => {
  await deleteDoc(doc(db, 'shifts', shiftId));
};

export const batchUpdateShifts = (
  db: Firestore,
  batch: WriteBatch,
  updates: Array<{ shiftId: string; payload: Partial<Shift> }>
): string[] => {
  const affectedShiftIds: string[] = [];
  updates.forEach(({ shiftId, payload }) => {
    batch.update(doc(db, 'shifts', shiftId), sanitizeShiftPayload(payload));
    affectedShiftIds.push(shiftId);
  });
  return affectedShiftIds;
};
