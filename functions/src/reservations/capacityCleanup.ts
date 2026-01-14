import { normalizeCapacityDoc } from './capacityDocContract';

type CapacityUpdate = Record<string, unknown>;

export type CapacityCleanupResult = {
  update?: CapacityUpdate;
  deletes?: Array<'byTimeSlot'>;
};

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toPlainByTimeSlot = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, slotValue]) => isNumber(slotValue)
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
};

const buildUpdate = (normalized: ReturnType<typeof normalizeCapacityDoc>): CapacityUpdate => {
  const update: CapacityUpdate = {
    totalCount: normalized.totalCount,
    count: normalized.totalCount,
  };
  if (normalized.byTimeSlot) {
    update.byTimeSlot = normalized.byTimeSlot;
  }
  return update;
};

export const normalizeCapacitySnapshot = (
  rawDoc: unknown
): CapacityCleanupResult => {
  const normalized = normalizeCapacityDoc(rawDoc);
  const record = rawDoc && typeof rawDoc === 'object' ? (rawDoc as Record<string, unknown>) : {};
  const hadByTimeSlot = !!record.byTimeSlot;
  const rawTotal = isNumber(record.totalCount) ? record.totalCount : undefined;
  const rawCount = isNumber(record.count) ? record.count : undefined;
  const rawSlots = toPlainByTimeSlot(record.byTimeSlot);

  const normalizedUpdate = buildUpdate(normalized);

  const rawSlotSum = rawSlots
    ? Object.values(rawSlots).reduce((acc, value) => acc + value, 0)
    : undefined;
  const normalizedSlotSum = normalized.byTimeSlot
    ? Object.values(normalized.byTimeSlot).reduce((acc, value) => acc + value, 0)
    : undefined;

  const needsUpdate =
    rawTotal !== normalized.totalCount ||
    rawCount !== normalized.totalCount ||
    rawSlotSum !== normalizedSlotSum ||
    (hadByTimeSlot && !normalized.byTimeSlot) ||
    (!hadByTimeSlot && !!normalized.byTimeSlot);

  if (!needsUpdate) {
    return {};
  }
  const deletes: CapacityCleanupResult['deletes'] =
    hadByTimeSlot && !normalized.byTimeSlot ? ['byTimeSlot'] : undefined;
  return {
    update: normalizedUpdate,
    ...(deletes ? { deletes } : {}),
  };
};
