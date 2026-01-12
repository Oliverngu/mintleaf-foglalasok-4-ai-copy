export type TimeSlotKey = 'night' | 'morning' | 'afternoon' | 'evening';

type TimeSlotLocale = 'hu' | 'en';
type TimeSlotFormatMode = 'label' | 'raw' | 'raw+label';

const TIME_SLOT_KEYS: TimeSlotKey[] = ['night', 'morning', 'afternoon', 'evening'];
const TIME_SLOT_LABELS: Record<TimeSlotKey, { hu: string; en: string }> = {
  night: { hu: 'Éjszaka', en: 'Night' },
  morning: { hu: 'Reggel', en: 'Morning' },
  afternoon: { hu: 'Délután', en: 'Afternoon' },
  evening: { hu: 'Este', en: 'Evening' },
};

const normalizeTimeSlotKey = (value: unknown): TimeSlotKey | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if ((TIME_SLOT_KEYS as string[]).includes(normalized)) {
    return normalized as TimeSlotKey;
  }
  return null;
};

const getTimeSlotLabel = (key: TimeSlotKey, locale: TimeSlotLocale = 'hu') => {
  return locale === 'hu' ? TIME_SLOT_LABELS[key].hu : TIME_SLOT_LABELS[key].en;
};

const formatTimeSlot = (
  value: unknown,
  options: { mode: TimeSlotFormatMode; locale?: TimeSlotLocale }
) => {
  const locale = options.locale ?? 'hu';
  const raw = typeof value === 'string' ? value.trim() : '';
  const normalized = normalizeTimeSlotKey(value);
  const label = normalized ? getTimeSlotLabel(normalized, locale) : undefined;

  if (options.mode === 'raw') {
    return raw || '—';
  }
  if (options.mode === 'label') {
    return normalized ? label : '—';
  }

  if (!raw) return '—';
  return `${raw} (${label ?? (locale === 'hu' ? 'Ismeretlen' : 'Unknown')})`;
};

export { formatTimeSlot, getTimeSlotLabel, normalizeTimeSlotKey };
