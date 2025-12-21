import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  FC,
  useRef
} from 'react';
import {
  Shift,
  Request,
  User,
  Unit,
  Position,
  ScheduleSettings,
  ExportStyleSettings,
  DailySetting
} from '../../../core/models/data';
import { db, Timestamp, serverTimestamp } from '../../../core/firebase/config';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  writeBatch,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
  query,
  getDoc
} from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import PencilIcon from '../../../../components/icons/PencilIcon';
import TrashIcon from '../../../../components/icons/TrashIcon';
import PlusIcon from '../../../../components/icons/PlusIcon';
import DownloadIcon from '../../../../components/icons/DownloadIcon';
import { generateExcelExport } from './ExportModal';
import SettingsIcon from '../../../../components/icons/SettingsIcon';
import html2canvas from 'html2canvas';
import ColorPicker from '../common/ColorPicker';
import ImageIcon from '../../../../components/icons/ImageIcon';
import ArrowUpIcon from '../../../../components/icons/ArrowUpIcon';
import ArrowDownIcon from '../../../../components/icons/ArrowDownIcon';
import EyeSlashIcon from '../../../../components/icons/EyeSlashIcon';
import EyeIcon from '../../../../components/icons/EyeIcon';
import UnitLogoBadge from '../common/UnitLogoBadge';
import XIcon from '../../../../components/icons/XIcon';
import UserPlusIcon from '../../../../components/icons/UserPlusIcon';

// Helper function to calculate shift duration in hours
const calculateShiftDuration = (
  shift: Shift,
  options?: {
    closingTime?: string | null;
    closingOffsetMinutes?: number;
    referenceDate?: Date;
  }
): number => {
  if (shift.isDayOff || !shift.start) return 0;

  let end = shift.end?.toDate();
  const referenceDate = options?.referenceDate || shift.start.toDate();

  if (!end && referenceDate) {
    const closingTime = options?.closingTime;
    if (!closingTime) return 0;

    const [hours, minutes] = closingTime.split(':').map(Number);
    end = new Date(referenceDate);
    end.setHours(
      hours,
      minutes + (options?.closingOffsetMinutes || 0),
      0,
      0
    );

    const startDate = shift.start.toDate();
    if (end < startDate) {
      end.setDate(end.getDate() + 1);
    }
  }

  if (!end) return 0;

  const durationMs = end.getTime() - shift.start.toDate().getTime();
  return durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
};

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (shift: Partial<Shift> & { id?: string }) => void;
  onDelete: (shiftId: string) => void;
  shift: Shift | null;
  userId: string;
  date: Date;
  users: User[];
  schedule: Shift[];
  viewMode: 'draft' | 'published';
  currentUser: User;
  canManage: boolean;
}

const ShiftModal: FC<ShiftModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  shift,
  userId,
  date,
  users,
  schedule,
  viewMode,
  currentUser,
  canManage
}) => {
  const [formData, setFormData] = useState({
    userId: userId,
    startTime: '',
    endTime: '',
    note: ''
  });
  const [isDayOff, setIsDayOff] = useState(false);

  useEffect(() => {
    if (shift) {
      setIsDayOff(!!shift.isDayOff);
      setFormData({
        userId: shift.userId,
        startTime: shift.isDayOff
          ? ''
          : shift.start?.toDate().toTimeString().substring(0, 5) || '',
        endTime: shift.isDayOff
          ? ''
          : shift.end?.toDate()?.toTimeString().substring(0, 5) || '',
        note: shift.note || ''
      });
    } else {
      setIsDayOff(false);
      setFormData({ userId: userId, startTime: '', endTime: '', note: '' });
    }
  }, [shift, userId, isOpen]);

  const userFullName = useMemo(() => {
    const user = users.find(u => u.id === formData.userId);
    return user ? user.fullName : '';
  }, [users, formData.userId]);

  const recentShifts = useMemo(() => {
    return schedule
      .filter(
        s =>
          s.userId === formData.userId &&
          !!s.start &&
          !s.isDayOff
      )
      .sort(
        (a, b) =>
          (b.start?.toMillis() || 0) - (a.start?.toMillis() || 0)
      )
      .slice(0, 5);
  }, [schedule, formData.userId]);

  const formatTime = (timestamp?: Timestamp | null) =>
    timestamp?.toDate().toTimeString().substring(0, 5) || '';

  const computeTopTimes = useCallback(
    (getter: (shift: Shift) => string) => {
      const counts = new Map<string, { count: number; firstIndex: number }>();
      recentShifts.forEach((shift, idx) => {
        const time = getter(shift);
        if (!time) return;
        const existing = counts.get(time);
        counts.set(time, {
          count: (existing?.count || 0) + 1,
          firstIndex: existing?.firstIndex ?? idx
        });
      });

      return Array.from(counts.entries())
        .sort(
          (a, b) =>
            b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex
        )
        .slice(0, 2)
        .map(([time]) => time);
    },
    [recentShifts]
  );

  const startPresets = useMemo(
    () => computeTopTimes(shift => formatTime(shift.start)),
    [computeTopTimes]
  );

  const endPresets = useMemo(
    () => computeTopTimes(shift => formatTime(shift.end)),
    [computeTopTimes]
  );

  if (!isOpen) return null;

  const isOwnShift =
    shift?.userId === currentUser.id || (!shift && formData.userId === currentUser.id);
  const canEditTime = viewMode === 'draft' || canManage;
  const canEditNote = canManage || isOwnShift;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const user = users.find(u => u.id === formData.userId);
    if (!user) return;

    if (isDayOff) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      onSave({
        id: shift?.id,
        userId: user.id,
        userName: user.fullName,
        position: user.position || 'N/A',
        start: Timestamp.fromDate(dayStart),
        end: null,
        note: formData.note,
        status: viewMode,
        isDayOff: true
      });
    } else {
      const [startHour, startMinute] = formData.startTime.split(':').map(Number);
      const startDate = new Date(date);
      startDate.setHours(startHour, startMinute, 0, 0);

      let endDate: Date | null = null;
      if (formData.endTime) {
        const [endHour, endMinute] = formData.endTime.split(':').map(Number);
        endDate = new Date(date);
        endDate.setHours(endHour, endMinute, 0, 0);
        if (endDate <= startDate) {
          // Handle overnight shifts
          endDate.setDate(endDate.getDate() + 1);
        }
      }

      onSave({
        id: shift?.id,
        userId: user.id,
        userName: user.fullName,
        position: user.position || 'N/A',
        start: Timestamp.fromDate(startDate),
        end: endDate ? Timestamp.fromDate(endDate) : null,
        note: formData.note,
        status: viewMode,
        isDayOff: false
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-lg"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800">
              {shift ? 'Műszak szerkesztése' : 'Új műszak'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 text-gray-500"
            >
              &times;
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Munkatárs</label>
              <input
                type="text"
                value={userFullName}
                readOnly
                className="w-full mt-1 p-2 border rounded-lg bg-gray-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDayOff"
                checked={isDayOff}
                onChange={e => setIsDayOff(e.target.checked)}
                className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isDayOff" className="font-medium text-gray-700">
                Szabadnap (X)
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Kezdés</label>
                <input
                  type="time"
                value={formData.startTime}
                onChange={e =>
                  setFormData(f => ({ ...f, startTime: e.target.value }))
                }
                className="w-full mt-1 p-2 border rounded-lg"
                disabled={!canEditTime || isDayOff}
                required={!isDayOff}
              />
                {startPresets.length > 0 && !isDayOff && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {startPresets.map(time => (
                      <button
                        type="button"
                        key={`start-${time}`}
                        onClick={() =>
                          setFormData(f => ({ ...f, startTime: time }))
                        }
                        className="px-2 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Befejezés (opcionális)
                </label>
                <input
                  type="time"
                value={formData.endTime}
                onChange={e =>
                  setFormData(f => ({ ...f, endTime: e.target.value }))
                }
                className="w-full mt-1 p-2 border rounded-lg"
                disabled={!canEditTime || isDayOff}
              />
                {endPresets.length > 0 && !isDayOff && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {endPresets.map(time => (
                      <button
                        type="button"
                        key={`end-${time}`}
                        onClick={() =>
                          setFormData(f => ({ ...f, endTime: time }))
                        }
                        className="px-2 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Megjegyzés</label>
              <textarea
                value={formData.note}
                onChange={e =>
                  setFormData(f => ({ ...f, note: e.target.value }))
                }
                rows={2}
                className="w-full mt-1 p-2 border rounded-lg"
                disabled={!canEditNote}
              />
            </div>
          </div>
          <div className="p-4 bg-gray-50 flex justify-between items-center rounded-b-2xl">
            <div>
              {shift && (
                <button
                  type="button"
                  onClick={() => onDelete(shift.id)}
                  className="text-red-600 font-semibold hover:bg-red-50 p-2 rounded-lg"
                >
                  Törlés
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
              >
                Mégse
              </button>
              <button
                type="submit"
                className="text-white px-4 py-2 rounded-lg font-semibold"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Mentés
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PublishWeekModalProps {
  units: { unitId: string; unitName: string; draftCount: number }[];
  onClose: () => void;
  onConfirm: (selectedUnitIds: string[]) => Promise<void>;
}

const PublishWeekModal: FC<PublishWeekModalProps> = ({
  units,
  onClose,
  onConfirm
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggle = (unitId: string) => {
    setSelectedIds(prev =>
      prev.includes(unitId)
        ? prev.filter(id => id !== unitId)
        : [...prev, unitId]
    );
  };

  const handleToggleAll = () => {
    if (selectedIds.length === units.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(units.map(u => u.unitId));
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await onConfirm(selectedIds);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-lg"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-gray-800">Hét Publikálása</h2>
          <p className="text-sm text-gray-600 mt-1">
            Válaszd ki, melyik egységek piszkozatait szeretnéd publikálni.
          </p>
        </div>
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          <label className="flex items-center p-3 bg-gray-100 rounded-lg font-semibold">
            <input
              type="checkbox"
              checked={selectedIds.length === units.length}
              onChange={handleToggleAll}
              className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
            />
            <span className="ml-3">Összes kijelölése</span>
          </label>
          {units.map(({ unitId, unitName, draftCount }) => (
            <label
              key={unitId}
              className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(unitId)}
                onChange={() => handleToggle(unitId)}
                className="h-5 w-5 rounded text-green-600 focus:ring-green-500"
              />
              <span className="ml-3 flex-grow font-medium text-gray-800">
                {unitName}
              </span>
              <span className="text-sm bg-gray-200 text-gray-700 font-bold px-2 py-1 rounded-full">
                {draftCount} műszak
              </span>
            </label>
          ))}
        </div>
        <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedIds.length === 0}
            className="text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {isSubmitting
              ? 'Publikálás...'
              : `Kiválasztottak publikálása (${selectedIds.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

interface BeosztasAppProps {
  schedule: Shift[];
  requests: Request[];
  currentUser: User;
  canManage: boolean;
  allUnits: Unit[];
  activeUnitIds: string[];
}

type ViewSpan = 7 | 14 | 21 | 28 | 42; // 42 = fixed month view (6 weeks)
type TempUser = User & { tempId: string; scopeId: string };

const VIEW_SPAN_OPTIONS: { label: string; value: ViewSpan }[] = [
  { label: '1 hét', value: 7 },
  { label: '2 hét', value: 14 },
  { label: '3 hét', value: 21 },
  { label: '4 hét', value: 28 },
  { label: 'Havi (6 hét)', value: 42 }
];

const WEEKDAY_LABELS = [
  'Hétfő',
  'Kedd',
  'Szerda',
  'Csütörtök',
  'Péntek',
  'Szombat',
  'Vasárnap'
];

const getStartOfWeek = (date: Date): Date => {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
};

const getMonthViewStart = (date: Date): Date => {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  return getStartOfWeek(firstDayOfMonth);
};

const getViewDays = (date: Date, span: ViewSpan): Date[] => {
  const start =
    span === 42 ? getMonthViewStart(date) : getStartOfWeek(date);

  return Array.from({ length: span }, (_, i) => {
    const newDay = new Date(start);
    newDay.setDate(start.getDate() + i);
    newDay.setHours(0, 0, 0, 0);
    return newDay;
  });
};

const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDayKeyLocal = (dayKey: string): Date => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
};

const createDefaultSettings = (
  unitId: string,
  weekStartDate: string
): ScheduleSettings => ({
  id: `${unitId}_${weekStartDate}`,
  unitId,
  weekStartDate,
  showOpeningTime: false,
  showClosingTime: false,
  dailySettings: Array.from({ length: 7 }, () => ({
    isOpen: true,
    openingTime: '08:00',
    closingTime: '22:00',
    closingOffsetMinutes: 0,
    quotas: {}
  })).reduce(
    (acc, curr, i) => ({
      ...acc,
      [i]: curr
    }),
    {}
  )
});

// --- NEW: Default Export Settings ---
const DEFAULT_EXPORT_SETTINGS: ExportStyleSettings = {
  id: '',
  zebraStrength: 15,
  zebraColor: '#F1F5F9',
  nameColumnColor: '#E2E8F0',
  dayHeaderBgColor: '#CBD5E1',
  categoryHeaderBgColor: '#CBD5E1',
  categoryHeaderTextColor: '#1E293B',
  gridThickness: 1,
  gridColor: '#9CA3AF',
  useRoundedCorners: true,
  borderRadius: 8,
  fontSizeCell: 14,
  fontSizeHeader: 16,
  useFullNameForDays: true
};

const adjustColor = (hex: string, percent: number): string => {
  if (!hex || hex.length < 7) return '#FFFFFF';
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);
  const amount = Math.round(2.55 * percent);
  r = Math.min(255, Math.max(0, r + amount));
  g = Math.min(255, Math.max(0, g + amount));
  b = Math.min(255, Math.max(0, b + amount));
  const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// --- COLOR HELPER FUNCTIONS ---
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result =
    /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
};

const getContrastingTextColor = (
  hex: string
): '#FFFFFF' | '#000000' => {
  if (!hex) return '#000000';
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
};

const getLuminance = (r: number, g: number, b: number) => {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

const getContrastRatio = (hex1: string, hex2: string) => {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
};

// --- Export Settings Panel Component ---
const ExportSettingsPanel: FC<{
  settings: ExportStyleSettings;
  setSettings: React.Dispatch<React.SetStateAction<ExportStyleSettings>>;
  presetColors?: string[];
}> = ({ settings, setSettings, presetColors }) => {
  const handleColorChange = (
    key: keyof ExportStyleSettings,
    value: string
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSliderChange = (
    key: keyof ExportStyleSettings,
    value: string
  ) => {
    setSettings(prev => ({ ...prev, [key]: Number(value) }));
  };

  const handleCheckboxChange = (
    key: keyof ExportStyleSettings,
    checked: boolean
  ) => {
    setSettings(prev => ({ ...prev, [key]: checked }));
  };

  const categoryTextColor = useMemo(
    () => getContrastingTextColor(settings.categoryHeaderBgColor),
    [settings.categoryHeaderBgColor]
  );
  const dayHeaderTextColor = useMemo(
    () => getContrastingTextColor(settings.dayHeaderBgColor),
    [settings.dayHeaderBgColor]
  );
  const nameColumnTextColor = useMemo(
    () => getContrastingTextColor(settings.nameColumnColor),
    [settings.nameColumnColor]
  );
  const zebraTextColor = useMemo(
    () => getContrastingTextColor(settings.zebraColor),
    [settings.zebraColor]
  );

  const contrastWarning = useMemo(() => {
    const checks = [
      getContrastRatio(settings.categoryHeaderBgColor, categoryTextColor),
      getContrastRatio(settings.dayHeaderBgColor, dayHeaderTextColor),
      getContrastRatio(settings.nameColumnColor, nameColumnTextColor),
      getContrastRatio(settings.zebraColor, zebraTextColor)
    ];
    return checks.some(ratio => ratio < 3.0)
      ? 'Alacsony kontraszt – válassz világosabb vagy sötétebb árnyalatot.'
      : null;
  }, [
    settings,
    categoryTextColor,
    dayHeaderTextColor,
    nameColumnTextColor,
    zebraTextColor
  ]);

  const altZebraColor = useMemo(
    () => adjustColor(settings.zebraColor, -(settings.zebraStrength / 2)),
    [settings.zebraColor, settings.zebraStrength]
  );
  const altNameColor = useMemo(
    () => adjustColor(settings.nameColumnColor, -(settings.zebraStrength / 2)),
    [settings.nameColumnColor, settings.zebraStrength]
  );
  const altZebraTextColor = useMemo(
    () => getContrastingTextColor(altZebraColor),
    [altZebraColor]
  );
  const altNameTextColor = useMemo(
    () => getContrastingTextColor(altNameColor),
    [altNameColor]
  );

  const tableZebraDelta = useMemo(
    () => settings.zebraStrength / 4,
    [settings.zebraStrength]
  );
  const tableAltZebraColor = useMemo(
    () => adjustColor(settings.zebraColor, -tableZebraDelta),
    [settings.zebraColor, tableZebraDelta]
  );
  const tableAltNameColor = useMemo(
    () => adjustColor(settings.nameColumnColor, -tableZebraDelta),
    [settings.nameColumnColor, tableZebraDelta]
  );

  const ColorInput: FC<{ id: keyof ExportStyleSettings; label: string }> = ({
    id,
    label
  }) => (
    <ColorPicker
      label={label}
      value={settings[id] as string}
      onChange={value => handleColorChange(id, value)}
      presetColors={presetColors}
    />
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {/* Left: Controls */}
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold mb-2">Sorok színezése</h4>
            <label className="block text-sm">
              Zebra erősség: {settings.zebraStrength}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.zebraStrength}
              onChange={e =>
                handleSliderChange('zebraStrength', e.target.value)
              }
              className="w-full"
            />
            <ColorInput id="zebraColor" label="Alapszín" />
          </div>
          <div>
            <h4 className="font-semibold mb-2">Név oszlop</h4>
            <ColorInput id="nameColumnColor" label="Alapszín" />
          </div>
          <div>
            <h4 className="font-semibold mb-2">Fejlécek</h4>
            <ColorInput id="dayHeaderBgColor" label="Napok fejléce" />
            <ColorInput
              id="categoryHeaderBgColor"
              label="Kategória háttér"
            />
          </div>
          <div>
            <h4 className="font-semibold mb-2">Rács és Keret</h4>
            <ColorInput id="gridColor" label="Rácsvonal színe" />
            <label className="block text-sm mt-2">
              Lekerekítés: {settings.borderRadius}px
            </label>
            <input
              type="range"
              min="0"
              max="24"
              value={settings.borderRadius}
              onChange={e =>
                handleSliderChange('borderRadius', e.target.value)
              }
              className="w-full"
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.useRoundedCorners}
                onChange={e =>
                  handleCheckboxChange('useRoundedCorners', e.target.checked)
                }
              />{' '}
              Lekerekített sarkok
            </label>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Tipográfia</h4>
            <label className="block text-sm">Napok formátuma</label>
            <select
              value={settings.useFullNameForDays ? 'full' : 'short'}
              onChange={e =>
                handleCheckboxChange(
                  'useFullNameForDays',
                  e.target.value === 'full'
                )
              }
              className="w-full p-2 border rounded"
            >
              <option value="full">Teljes napnevek (Hétfő, Kedd...)</option>
              <option value="short">Rövid nevek (H, K...)</option>
            </select>
          </div>
        </div>
        {/* Right: Preview */}
        <div className="sticky top-0">
          <h4 className="font-semibold mb-2">Előnézet</h4>
          <div
            className="p-2 bg-gray-200"
            style={{
              borderRadius: settings.useRoundedCorners
                ? `${settings.borderRadius}px`
                : '0px'
            }}
          >
            <table
              className="w-full text-xs border-collapse"
              style={{
                border: `${settings.gridThickness}px solid ${settings.gridColor}`
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      background: settings.nameColumnColor,
                      color: nameColumnTextColor,
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeHeader}px`,
                      verticalAlign: 'middle',
                      textAlign: 'left'
                    }}
                  >
                    Munkatárs
                  </th>
                  <th
                    style={{
                      background: settings.dayHeaderBgColor,
                      color: dayHeaderTextColor,
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeHeader}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    H
                  </th>
                  <th
                    style={{
                      background: settings.dayHeaderBgColor,
                      color: dayHeaderTextColor,
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeHeader}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    K
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: settings.categoryHeaderBgColor }}>
                  <td
                    colSpan={3}
                    style={{
                      padding: '6px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontWeight: 'bold',
                      color: categoryTextColor,
                      fontSize: '1.1em',
                      verticalAlign: 'middle',
                      textAlign: 'left'
                    }}
                  >
                    Pultos
                  </td>
                </tr>
                <tr
                  style={{
                    background: settings.zebraColor,
                    color: zebraTextColor
                  }}
                >
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      background: settings.nameColumnColor,
                      color: nameColumnTextColor,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'left'
                    }}
                  >
                    Minta János
                  </td>
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    10:00-18:00
                  </td>
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    X
                  </td>
                </tr>
                <tr
                  style={{
                    background: altZebraColor,
                    color: altZebraTextColor
                  }}
                >
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      background: altNameColor,
                      color: altNameTextColor,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'left'
                    }}
                  >
                    Teszt Eszter
                  </td>
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    X
                  </td>
                  <td
                    style={{
                      padding: '4px',
                      border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                      fontSize: `${settings.fontSizeCell}px`,
                      verticalAlign: 'middle',
                      textAlign: 'center'
                    }}
                  >
                    14:00-22:00
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {contrastWarning && (
            <p className="text-xs text-red-600 font-semibold mt-2">
              {contrastWarning}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface ExportConfirmationModalProps {
  type: 'PNG' | 'Excel';
  onClose: () => void;
  onConfirm: () => Promise<void>;
  exportSettings: ExportStyleSettings;
  unitName: string;
  hideEmptyUsersOnExport: boolean;
  onToggleHideEmptyUsers: (value: boolean) => void;
}

const ExportConfirmationModal: FC<ExportConfirmationModalProps> = ({
  type,
  onClose,
  onConfirm,
  exportSettings,
  unitName,
  hideEmptyUsersOnExport,
  onToggleHideEmptyUsers
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleConfirmClick = async () => {
    setIsExporting(true);
    try {
      await onConfirm();
    } catch (err) {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const Preview: FC<{ settings: ExportStyleSettings }> = ({ settings }) => {
    const altZebraColor = useMemo(
      () =>
        adjustColor(settings.zebraColor, -(settings.zebraStrength / 2)),
      [settings.zebraColor, settings.zebraStrength]
    );
    const altNameColor = useMemo(
      () =>
        adjustColor(
          settings.nameColumnColor,
          -(settings.zebraStrength / 2)
        ),
      [settings.nameColumnColor, settings.zebraStrength]
    );
    const categoryTextColor = getContrastingTextColor(
      settings.categoryHeaderBgColor
    );

    return (
      <div
        className="p-2 bg-gray-200"
        style={{
          borderRadius: settings.useRoundedCorners
            ? `${settings.borderRadius}px`
            : '0px'
        }}
      >
        <table
          className="w-full text-xs border-collapse"
          style={{
            border: `${settings.gridThickness}px solid ${settings.gridColor}`
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  background: settings.nameColumnColor,
                  color: getContrastingTextColor(settings.nameColumnColor),
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  textAlign: 'left'
                }}
              >
                Név
              </th>
              <th
                style={{
                  background: settings.dayHeaderBgColor,
                  color: getContrastingTextColor(settings.dayHeaderBgColor),
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  textAlign: 'center'
                }}
              >
                H
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: settings.categoryHeaderBgColor }}>
              <td
                colSpan={2}
                style={{
                  padding: '6px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  fontWeight: 'bold',
                  color: categoryTextColor,
                  textAlign: 'left'
                }}
              >
                Pultos
              </td>
            </tr>
            <tr
              style={{
                background: settings.zebraColor,
                color: getContrastingTextColor(settings.zebraColor)
              }}
            >
              <td
                style={{
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  background: settings.nameColumnColor,
                  color: getContrastingTextColor(settings.nameColumnColor),
                  textAlign: 'left'
                }}
              >
                Minta J.
              </td>
              <td
                style={{
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  textAlign: 'center'
                }}
              >
                08-16
              </td>
            </tr>
            <tr
              style={{
                background: altZebraColor,
                color: getContrastingTextColor(altZebraColor)
              }}
            >
              <td
                style={{
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  background: altNameColor,
                  color: getContrastingTextColor(altNameColor),
                  textAlign: 'left'
                }}
              >
                Teszt E.
              </td>
              <td
                style={{
                  padding: '4px',
                  border: `${settings.gridThickness}px solid ${settings.gridColor}`,
                  textAlign: 'center'
                }}
              >
                X
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-xl"
        style={{ backgroundColor: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-gray-800">
            Export előnézet és megerősítés
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <h3 className="font-semibold text-gray-800">Előnézet</h3>
            <div className="mt-2 scale-90 origin-top-left">
              <Preview settings={exportSettings} />
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-gray-600">
              Az exportált táblázat megjelenése testreszabható a
              Beállítások menüben. Biztosan exportálni szeretnéd ezzel a
              formátummal?
            </p>
            <div className="p-3 bg-gray-100 rounded-lg text-sm">
              <span className="font-semibold">Egység:</span> {unitName}
              <br />
              <span className="font-semibold">Formátum:</span> {type}
            </div>
            {type === 'PNG' && (
              <div className="mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={hideEmptyUsersOnExport}
                    onChange={e =>
                      onToggleHideEmptyUsers(e.target.checked)
                    }
                  />
                  <span>
                    Csak azok a munkatársak jelenjenek meg, akiknek van
                    beosztott órájuk ezen a héten.
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
          >
            Mégse
          </button>
          <button
            onClick={handleConfirmClick}
            disabled={isExporting}
            className="text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400 flex items-center gap-2"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {isExporting && (
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isExporting ? 'Exportálás...' : 'Exportálás megerősítése'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const BeosztasApp: FC<BeosztasAppProps> = ({
  schedule,
  requests,
  currentUser,
  canManage,
  allUnits,
  activeUnitIds
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewSpan, setViewSpan] = useState<ViewSpan>(7);
  const [viewMode, setViewMode] = useState<'draft' | 'published'>(
    'published'
  );
  const [allAppUsers, setAllAppUsers] = useState<User[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<{
    shift: Shift | null;
    userId: string;
    date: Date;
  } | null>(null);

  const [weekSettings, setWeekSettings] =
    useState<ScheduleSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    'opening' | 'export'
  >('opening');

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [unitsWithDrafts, setUnitsWithDrafts] = useState<
    { unitId: string; unitName: string; draftCount: number }[]
  >([]);

  const [isPngExporting, setIsPngExporting] = useState(false);
  const [orderedUsers, setOrderedUsers] = useState<User[]>([]);
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(
    new Set()
  );
  const [isHiddenMenuOpen, setIsHiddenMenuOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const [isEditMode, setIsEditMode] = useState(false);

  const [savedOrderedUserIds, setSavedOrderedUserIds] = useState<string[]>(
    []
  );
  const [savedHiddenUserIds, setSavedHiddenUserIds] = useState<string[]>(
    []
  );

  const [exportSettings, setExportSettings] =
    useState<ExportStyleSettings>(DEFAULT_EXPORT_SETTINGS);
  const [initialExportSettings, setInitialExportSettings] =
    useState<ExportStyleSettings>(DEFAULT_EXPORT_SETTINGS);
  const [isSavingExportSettings, setIsSavingExportSettings] =
    useState(false);
  const [unitWeekSettings, setUnitWeekSettings] = useState<
    Record<string, ScheduleSettings>
  >({});
  const [tempUsersByScope, setTempUsersByScope] = useState<
    Record<string, TempUser[]>
  >({});
  const [tempUserWarning, setTempUserWarning] = useState<string | null>(
    null
  );
  const [isTempModalOpen, setIsTempModalOpen] = useState(false);
  const [tempForm, setTempForm] = useState<{
    fullName: string;
    position: string;
    unitId: string;
  }>({ fullName: '', position: '', unitId: '' });
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const settingsWarnedRef = useRef(false);
  const exportSettingsHaveChanged = useMemo(
    () =>
      JSON.stringify(exportSettings) !==
      JSON.stringify(initialExportSettings),
    [exportSettings, initialExportSettings]
  );

  const [exportConfirmation, setExportConfirmation] = useState<{
    type: 'PNG' | 'Excel';
  } | null>(null);
  const [successToast, setSuccessToast] = useState('');
  const [hideEmptyUsersOnExport, setHideEmptyUsersOnExport] =
    useState(false);
  useEffect(() => {
    if (!successToast) return;
    const timeoutId = window.setTimeout(() => setSuccessToast(''), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [successToast]);

  const [clickGuardUntil, setClickGuardUntil] = useState<number>(0);
  const isMultiUnitView = activeUnitIds.length > 1;
  const [selectedCells, setSelectedCells] = useState<Set<string>>(
    new Set()
  );
  const [lastSelectedCell, setLastSelectedCell] = useState<{
    userId: string;
    dayKey: string;
  } | null>(null);
  const isRangeDragActive = useRef(false);
  const dragStartRef = useRef<{ userIndex: number; dayIndex: number } | null>(
    null
  );
  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
    setLastSelectedCell(null);
    isRangeDragActive.current = false;
    dragStartRef.current = null;
  }, []);
  const createCellKey = useCallback(
    (userId: string, dayKey: string) => `${userId}__${dayKey}`,
    []
  );
  const parseCellKey = useCallback(
    (key: string) => {
      const [userId, dayKey] = key.split('__');
      return { userId, dayKey };
    },
    []
  );

  // Subtle zebra palette for the UI table, mirroring export defaults
  const tableZebraDelta = useMemo(
    () => exportSettings.zebraStrength / 4,
    [exportSettings.zebraStrength]
  );
  const tableBaseZebraColor = exportSettings.zebraColor;
  const tableBaseNameColor = exportSettings.nameColumnColor;
  const tableAltZebraColor = useMemo(
    () => adjustColor(exportSettings.zebraColor, -tableZebraDelta),
    [exportSettings.zebraColor, tableZebraDelta]
  );
  const tableAltNameColor = useMemo(
    () => adjustColor(exportSettings.nameColumnColor, -tableZebraDelta),
    [exportSettings.nameColumnColor, tableZebraDelta]
  );
  const unitMap = useMemo(
    () => new Map(allUnits.map(unit => [unit.id, unit])),
    [allUnits]
  );
  const userMap = useMemo(() => {
    const temps = Object.values(tempUsersByScope).flat();
    const combined = [...allAppUsers, ...temps];
    return new Map(combined.map(user => [user.id, user]));
  }, [allAppUsers, tempUsersByScope]);
  const permissionWarned = useRef(false);
  const handleSnapshotError = useCallback(
    (error: any) => {
      if (error?.name === 'AbortError') return;
      if (error?.code === 'permission-denied') {
        if (!permissionWarned.current) {
          console.warn('Firestore permission denied');
          permissionWarned.current = true;
        }
        return;
      }
      console.error('Firestore listener error', error);
    },
    []
  );

  const activeBrandColors = useMemo(() => {
    const collectColors = (unit?: Unit) => {
      if (!unit?.brandColors) return [] as string[];
      const { primary, secondary, background } = unit.brandColors;
      return [primary, secondary, background].filter(Boolean) as string[];
    };

    for (const unitId of activeUnitIds) {
      const unit = unitMap.get(unitId);
      const colors = collectColors(unit);
      if (colors.length) return colors;
    }

    const fallbackUnit = unitMap.get(activeUnitIds[0] || '');
    return collectColors(fallbackUnit);
  }, [activeUnitIds, unitMap]);

  const settingsDocId = useMemo(() => {
    if (activeUnitIds.length === 0) return null;
    return activeUnitIds.sort().join('_');
  }, [activeUnitIds]);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        setAllAppUsers(
          snapshot.docs.map(docSnap => {
            const data = docSnap.data() as any;
            const lastName = data.lastName || '';
            const firstName = data.firstName || '';
            return {
              id: docSnap.id,
              ...data,
              fullName:
                data.fullName ||
                `${lastName} ${firstName}`.trim()
            } as User;
          })
        );
        setIsDataLoading(false);
      },
      handleSnapshotError
    );

    const unsubPositions = onSnapshot(
      query(collection(db, 'positions'), orderBy('name')),
      snapshot => {
        setPositions(
          snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as any)
          })) as Position[]
        );
      },
      handleSnapshotError
    );

    return () => {
      unsubUsers();
      unsubPositions();
    };
  }, []);

  useEffect(() => {
    if (weekSettings) {
      setUnitWeekSettings(prev => ({
        ...prev,
        [weekSettings.unitId]: weekSettings
      }));
    }
  }, [weekSettings]);

  const normalizedStartDate = useMemo(
    () => (viewSpan === 42 ? getMonthViewStart(currentDate) : getStartOfWeek(currentDate)),
    [currentDate, viewSpan]
  );

  const viewDays = useMemo(
    () => getViewDays(normalizedStartDate, viewSpan),
    [normalizedStartDate, viewSpan]
  );

  const viewDayKeys = useMemo(
    () => viewDays.map(d => toDateString(d)),
    [viewDays]
  );

  const viewStartDateKey = useMemo(
    () => toDateString(normalizedStartDate),
    [normalizedStartDate]
  );

  const openingSettings = useMemo(
    () =>
      weekSettings ||
      createDefaultSettings(activeUnitIds[0] || 'default', viewStartDateKey),
    [weekSettings, activeUnitIds, viewStartDateKey]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  useEffect(() => {
    const stopDrag = () => {
      isRangeDragActive.current = false;
      dragStartRef.current = null;
    };
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('mouseleave', stopDrag);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('pointerleave', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('mouseleave', stopDrag);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('pointerleave', stopDrag);
    };
  }, []);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, normalizedStartDate, viewSpan, viewMode, activeUnitIds]);

  useEffect(() => {
    if (activeUnitIds.length === 1) {
      setTempForm(prev => ({ ...prev, unitId: activeUnitIds[0] }));
    } else {
      setTempForm(prev => ({ ...prev, unitId: '' }));
    }
  }, [activeUnitIds]);

  useEffect(() => {
    settingsWarnedRef.current = false;
    if (!activeUnitIds || activeUnitIds.length === 0) {
      setUnitWeekSettings({});
      setTempUsersByScope({});
      return;
    }
    const scopeStart = viewStartDateKey;
    const unsubs: (() => void)[] = [];
    const localTempUsers: Record<string, TempUser[]> = {};

    let isMounted = true;

    const loadSettings = async () => {
      const entries = await Promise.all(
        activeUnitIds.map(async unitId => {
          try {
            const settingsId = `${unitId}_${viewStartDateKey}`;
            const snap = await getDoc(
              doc(db, 'schedule_settings', settingsId)
            );
            if (snap.exists()) {
              return snap.data() as ScheduleSettings;
            }
            return createDefaultSettings(unitId, viewStartDateKey);
          } catch (error) {
            if (!settingsWarnedRef.current) {
              console.warn('Failed to load schedule settings for unit', unitId, error);
              settingsWarnedRef.current = true;
              setSettingsWarning('A heti beállítások nem érhetők el, alapértelmezett értékekkel jelenítjük meg.');
            }
            return createDefaultSettings(unitId, viewStartDateKey);
          }
        })
      );

      if (!isMounted) return;

      const map: Record<string, ScheduleSettings> = {};
      entries.forEach(settings => {
        if (settings) {
          map[settings.unitId] = settings;
        }
      });
      setUnitWeekSettings(map);
      if (!settingsWarnedRef.current && Object.keys(map).length > 0) {
        setSettingsWarning(null);
      }
    };

    loadSettings();

    activeUnitIds.forEach(unitId => {
      const scopeId = `${unitId}_${scopeStart}`;
      const collectionRef = collection(
        db,
        'unit_schedules',
        scopeId,
        'tempUsers'
      );
      const unsub = onSnapshot(
        collectionRef,
        snapshot => {
          if (!isMounted) return;
          localTempUsers[scopeId] = snapshot.docs.map(docSnap => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              tempId: docSnap.id,
              scopeId,
              ...data,
              isTemporary: true
            } as TempUser;
          });
          setTempUsersByScope(prev => ({
            ...prev,
            ...localTempUsers
          }));
        },
        err => {
          handleSnapshotError(err);
          if (err?.code === 'permission-denied') {
            setTempUsersByScope(prev => ({
              ...prev,
              [scopeId]: []
            }));
            setTempUserWarning(
              'A beugrósok listája nem elérhető ehhez a nézethez (engedély hiányzik).'
            );
          }
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
    };
  }, [activeUnitIds, viewDays, viewStartDateKey, handleSnapshotError]);

  const filteredUsers = useMemo(() => {
    if (!activeUnitIds || activeUnitIds.length === 0) return [];
    const scopeIdBase = viewStartDateKey;
    const tempUsers = activeUnitIds.flatMap(unitId => {
      const scopeId = `${unitId}_${scopeIdBase}`;
      return tempUsersByScope[scopeId] || [];
    });
    const combinedUsers = [...allAppUsers, ...tempUsers];
    return combinedUsers
      .filter(
        u => u.unitIds && u.unitIds.some(uid => activeUnitIds.includes(uid))
      )
      .sort((a, b) =>
        (a.position || '').localeCompare(b.position || '')
      );
  }, [allAppUsers, activeUnitIds, tempUsersByScope, viewDays]);

  useEffect(() => {
    if (!settingsDocId) return;
    const docRef = doc(db, 'schedule_display_settings', settingsDocId);
    const unsubscribe = onSnapshot(
      docRef,
      docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setSavedOrderedUserIds(data.orderedUserIds || []);
          setSavedHiddenUserIds(data.hiddenUserIds || []);
        } else {
          setSavedOrderedUserIds([]);
          setSavedHiddenUserIds([]);
        }
      },
      handleSnapshotError
    );
    return () => unsubscribe();
  }, [settingsDocId]);

  useEffect(() => {
    setHiddenUserIds(new Set(savedHiddenUserIds));

    if (savedOrderedUserIds.length > 0) {
      const userMap = new Map(filteredUsers.map(u => [u.id, u]));
      const ordered = savedOrderedUserIds
        .map(id => userMap.get(id))
        .filter((u): u is User => u !== undefined);

      const newUsers = filteredUsers.filter(
        u => !savedOrderedUserIds.includes(u.id)
      );
      setOrderedUsers([...ordered, ...newUsers]);
    } else {
      setOrderedUsers(filteredUsers);
    }
  }, [filteredUsers, savedOrderedUserIds, savedHiddenUserIds]);

  const saveDisplaySettings = useCallback(
    async (newOrder: string[], newHidden: string[]) => {
      if (!settingsDocId) return;
      const docRef = doc(
        db,
        'schedule_display_settings',
        settingsDocId
      );
      try {
        await setDoc(
          docRef,
          {
            orderedUserIds: newOrder,
            hiddenUserIds: newHidden
          },
          { merge: true }
        );
      } catch (error) {
        console.error('Failed to save display settings:', error);
      }
    },
    [settingsDocId]
  );

  useEffect(() => {
    if (!canManage || activeUnitIds.length !== 1) {
      setExportSettings(DEFAULT_EXPORT_SETTINGS);
      setInitialExportSettings(DEFAULT_EXPORT_SETTINGS);
      return;
    }

    const unitId = activeUnitIds[0];
    const settingsDocRef = doc(db, 'unit_export_settings', unitId);
    const unsub = onSnapshot(
      settingsDocRef,
      docSnap => {
        const settings = {
          ...DEFAULT_EXPORT_SETTINGS,
          ...(docSnap.data() || {})
        } as ExportStyleSettings;
        setExportSettings(settings);
        setInitialExportSettings(settings);
      },
      handleSnapshotError
    );
    return () => unsub();
  }, [activeUnitIds, canManage]);

  const handleSaveExportSettings = async () => {
    if (!canManage || activeUnitIds.length !== 1) {
      alert(
        'A beállítások mentéséhez válasszon ki pontosan egy egységet.'
      );
      return;
    }
    setIsSavingExportSettings(true);
    const unitId = activeUnitIds[0];
    try {
      const settingsDocRef = doc(db, 'unit_export_settings', unitId);

      const settingsToSave = {
        ...exportSettings,
        categoryHeaderTextColor: getContrastingTextColor(
          exportSettings.categoryHeaderBgColor
        )
      };

      await setDoc(settingsDocRef, settingsToSave);

      alert('Exportálási beállítások mentve ehhez az egységhez!');
      setInitialExportSettings(settingsToSave);
    } catch (error) {
      console.error(
        'Failed to save export settings for unit:',
        error
      );
      alert('Hiba történt a beállítások mentésekor.');
    } finally {
      setIsSavingExportSettings(false);
    }
  };

  useEffect(() => {
    if (!canManage || activeUnitIds.length !== 1) {
      setWeekSettings(null);
      return;
    }
    const unitId = activeUnitIds[0];
    const settingsId = `${unitId}_${viewStartDateKey}`;
    const unsub = onSnapshot(
      doc(db, 'schedule_settings', settingsId),
      docSnap => {
        if (docSnap.exists()) {
          setWeekSettings(docSnap.data() as ScheduleSettings);
        } else {
          setWeekSettings(
            createDefaultSettings(unitId, viewStartDateKey)
          );
        }
      },
      handleSnapshotError
    );
    return () => unsub();
  }, [activeUnitIds, viewDays, canManage, viewStartDateKey]);

  const activeShifts = useMemo(
    () =>
      schedule.filter(
        s =>
          (s.status || 'draft') === viewMode &&
          (!s.unitId || activeUnitIds.includes(s.unitId))
      ),
    [schedule, viewMode, activeUnitIds]
  );

  const getUnitDaySetting = useCallback(
    (shift: Shift, dayIndex: number): DailySetting | null => {
      if (!shift.unitId) return null;
      const normalizedIndex = dayIndex % 7;

      const unitSettings =
        unitWeekSettings[shift.unitId] ||
        (weekSettings?.unitId === shift.unitId ? weekSettings : undefined);

      return (
        unitSettings?.dailySettings?.[normalizedIndex] ||
        weekSettings?.dailySettings?.[normalizedIndex] ||
        null
      );
    },
    [unitWeekSettings, weekSettings]
  );

  const shiftsByUserDay = useMemo(() => {
    const map = new Map<string, Map<string, Shift[]>>();
    orderedUsers.forEach(user => map.set(user.id, new Map()));
    activeShifts.forEach(shift => {
      if (shift.start) {
        const userShifts = map.get(shift.userId);
        if (userShifts) {
          const dayKey = toDateString(shift.start.toDate());
          if (!userShifts.has(dayKey)) userShifts.set(dayKey, []);
          userShifts.get(dayKey)!.push(shift);
        }
      }
    });
    return map;
  }, [activeShifts, orderedUsers]);

  const requestsByUserDay = useMemo(() => {
    const map = new Map<string, Map<string, Request[]>>();
    requests
      .filter(r => r.status === 'approved' && r.startDate && r.endDate)
      .forEach(req => {
        if (!map.has(req.userId)) map.set(req.userId, new Map());
        const userRequests = map.get(req.userId)!;
        const start = req.startDate!.toDate();
        const end = req.endDate!.toDate();
        const loopDate = new Date(start);

        while (loopDate <= end) {
          const dayKey = toDateString(loopDate);
          if (!userRequests.has(dayKey)) userRequests.set(dayKey, []);
          userRequests.get(dayKey)!.push(req);
          loopDate.setDate(loopDate.getDate() + 1);
        }
      });
    return map;
  }, [requests]);

  const workHours = useMemo(() => {
    const userTotals: Record<string, number> = {};
    const dayTotals: number[] = Array(viewDays.length).fill(0);

    orderedUsers.forEach(user => {
      userTotals[user.id] = 0;
      viewDays.forEach((day, dayIndex) => {
        const dayKey = toDateString(day);
        const dayShifts =
          shiftsByUserDay.get(user.id)?.get(dayKey) || [];

        const dayHours = dayShifts.reduce(
          (sum, shift) =>
            shift.highlightOnly
              ? sum
              : sum +
                calculateShiftDuration(shift, {
                  closingTime:
                    getUnitDaySetting(shift, dayIndex % 7)?.closingTime || null,
                  closingOffsetMinutes:
                    getUnitDaySetting(shift, dayIndex % 7)?.closingOffsetMinutes ||
                    0,
                  referenceDate: viewDays[dayIndex]
                }),
          0
        );
        userTotals[user.id] += dayHours;
        if (!hiddenUserIds.has(user.id)) {
          dayTotals[dayIndex] += dayHours;
        }
      });
    });
    const grandTotal = dayTotals.reduce((a, b) => a + b, 0);
    return { userTotals, dayTotals, grandTotal };
  }, [
    orderedUsers,
    hiddenUserIds,
    viewDays,
    shiftsByUserDay,
    weekSettings,
    getUnitDaySetting
  ]);

  const visibleUsersByPosition = useMemo(() => {
    const visible = orderedUsers.filter(
      u => !hiddenUserIds.has(u.id)
    );
    const grouped: Record<string, User[]> = {};
    visible.forEach(user => {
      const pos = user.position || 'Nincs pozíció';
      if (!grouped[pos]) grouped[pos] = [];
      grouped[pos].push(user);
    });
    return grouped;
  }, [orderedUsers, hiddenUserIds]);

  const visiblePositionOrder = useMemo(() => {
    const originalOrder = [
      ...new Set(
        orderedUsers.map(u => u.position || 'Nincs pozíció')
      )
    ];
    return originalOrder.filter(
      pos =>
        visibleUsersByPosition[pos] &&
        visibleUsersByPosition[pos].length > 0
    );
  }, [orderedUsers, visibleUsersByPosition]);
  const visibleFlatUsers = useMemo(
    () =>
      visiblePositionOrder.flatMap(
        pos => visibleUsersByPosition[pos] || []
      ),
    [visiblePositionOrder, visibleUsersByPosition]
  );
  const visibleUserIndexMap = useMemo(
    () =>
      new Map<string, number>(
        visibleFlatUsers.map((user, idx) => [user.id, idx])
      ),
    [visibleFlatUsers]
  );
  const selectedCellEntries = useMemo(
    () => Array.from(selectedCells).map(parseCellKey),
    [parseCellKey, selectedCells]
  );

  const hiddenUsers = useMemo(
    () =>
      allAppUsers.filter(u => hiddenUserIds.has(u.id)),
    [allAppUsers, hiddenUserIds]
  );

  let zebraRowIndex = 0;

  const handlePrevView = () =>
    setCurrentDate(d => {
      const newDate = new Date(d);
      if (viewSpan === 42) {
        newDate.setMonth(newDate.getMonth() - 1);
        newDate.setDate(1);
      } else {
        newDate.setDate(newDate.getDate() - viewSpan);
      }
      return newDate;
    });

  const handleNextView = () =>
    setCurrentDate(d => {
      const newDate = new Date(d);
      if (viewSpan === 42) {
        newDate.setMonth(newDate.getMonth() + 1);
        newDate.setDate(1);
      } else {
        newDate.setDate(newDate.getDate() + viewSpan);
      }
      return newDate;
    });

  const handlePublishWeek = () => {
    const weekStart = viewDays[0];
    const weekEnd = new Date(viewDays[viewDays.length - 1]);
    weekEnd.setHours(23, 59, 59, 999);

    const draftShifts = schedule.filter(
      s =>
        (s.status === 'draft' || !s.status) &&
        s.start &&
        s.start.toDate() >= weekStart &&
        s.start.toDate() <= weekEnd &&
        s.unitId
    );

    if (draftShifts.length === 0) {
      alert('Nincsenek piszkozatban lévő műszakok ezen a héten.');
      return;
    }

    const draftsByUnit = draftShifts.reduce(
      (acc, shift) => {
        if (shift.unitId) {
          if (!acc[shift.unitId]) {
            acc[shift.unitId] = 0;
          }
          acc[shift.unitId]++;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    const unitsData = Object.entries(draftsByUnit)
      .map(([unitId, count]) => ({
        unitId,
        unitName:
          allUnits.find(u => u.id === unitId)?.name ||
          'Ismeretlen Egység',
        draftCount: count
      }))
      .sort((a, b) => a.unitName.localeCompare(b.unitName));

    setUnitsWithDrafts(unitsData);
    setIsPublishModalOpen(true);
  };

  const handleConfirmPublish = async (selectedUnitIds: string[]) => {
    if (selectedUnitIds.length === 0) {
      setIsPublishModalOpen(false);
      return;
    }

    const weekStart = viewDays[0];
    const weekEnd = new Date(viewDays[viewDays.length - 1]);
    weekEnd.setHours(23, 59, 59, 999);

    const shiftsToPublish = schedule.filter(
      s =>
        (s.status === 'draft' || !s.status) &&
        s.start &&
        s.start.toDate() >= weekStart &&
        s.start.toDate() <= weekEnd &&
        s.unitId &&
        selectedUnitIds.includes(s.unitId)
    );

    if (shiftsToPublish.length > 0) {
      const batch = writeBatch(db);
      shiftsToPublish.forEach(shift =>
        batch.update(doc(db, 'shifts', shift.id), {
          status: 'published'
        })
      );
      try {
        await batch.commit();
        alert('A kiválasztott műszakok sikeresen publikálva!');
      } catch (err) {
        console.error('Error publishing shifts:', err);
        alert('Hiba a műszakok publikálása során.');
        setIsPublishModalOpen(false);
        return;
      }

      const affectedUserIds = [...new Set(shiftsToPublish.map(s => s.userId))];
      const weekLabel = `${viewDays[0].toLocaleDateString('hu-HU', {
        month: 'short',
        day: 'numeric'
      })} - ${viewDays[viewDays.length - 1].toLocaleDateString('hu-HU', {
        month: 'short',
        day: 'numeric'
      })}`;

      const recipients = affectedUserIds
        .map(userId => allAppUsers.find(u => u.id === userId))
        .filter(
          (u): u is User =>
            !!u && !!u.email && u.notifications?.newSchedule !== false
        )
        .map(u => u.email as string);

      const unitId = selectedUnitIds[0] || null;
      const unitName =
        allUnits.find(u => u.id === unitId)?.name || 'Ismeretlen egység';
      const publicScheduleUrl = window.location?.href || '';

      if (recipients.length > 0) {
        await addDoc(collection(db, 'email_queue'), {
          typeId: 'schedule_published',
          unitId,
          payload: {
            unitName,
            weekLabel,
            url: publicScheduleUrl,
            editorName: currentUser.fullName,
            recipients
          },
          createdAt: serverTimestamp(),
          status: 'pending'
        });
      }
    }
    setIsPublishModalOpen(false);
  };

  const handleOpenShiftModal = (
    shift: Shift | null,
    userId: string,
    date: Date
  ) => {
    if (clickGuardUntil && Date.now() < clickGuardUntil) {
      return;
    }
    setEditingShift({ shift, userId, date });
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (
    shiftData: Partial<Shift> & { id?: string }
  ) => {
    const shiftToSave = {
      ...shiftData,
      unitId: activeUnitIds[0]
    };
    if (shiftToSave.id) {
      const docId = shiftToSave.id;
      const { id, ...dataToUpdate } = shiftToSave;
      await updateDoc(doc(db, 'shifts', docId), dataToUpdate);
    } else {
      const { id, ...dataToAdd } = shiftToSave;
      await addDoc(collection(db, 'shifts'), dataToAdd);
    }
    setIsShiftModalOpen(false);
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (
      window.confirm(
        'Biztosan törölni szeretnéd ezt a műszakot?'
      )
    ) {
      await deleteDoc(doc(db, 'shifts', shiftId));
      setIsShiftModalOpen(false);
    }
  };

  const handleSettingsChange = useCallback(
    (updater: (prev: ScheduleSettings) => ScheduleSettings) => {
      setWeekSettings(prev => {
        const baseSettings =
          prev ||
          createDefaultSettings(
            activeUnitIds[0] || 'default',
            viewStartDateKey
          );

        const updated = updater(baseSettings);
        if (canManage && activeUnitIds.length === 1) {
          setDoc(doc(db, 'schedule_settings', updated.id), updated).catch(
            error => {
              console.error('Failed to save settings:', error);
            }
          );
        }
        return updated;
      });
    },
    [canManage, activeUnitIds, viewStartDateKey]
  );

  const buildRangeKeys = useCallback(
    (startRow: number, endRow: number, startDay: number, endDay: number) => {
      const keys: string[] = [];
      for (let r = startRow; r <= endRow; r++) {
        const user = visibleFlatUsers[r];
        if (!user) continue;
        for (let d = startDay; d <= endDay; d++) {
          const dayKey = viewDayKeys[d];
          if (dayKey) {
            keys.push(createCellKey(user.id, dayKey));
          }
        }
      }
      return keys;
    },
    [createCellKey, visibleFlatUsers, viewDayKeys]
  );

  const handleCellSelect = (
    user: User,
    day: Date,
    userIndex: number,
    dayIndex: number,
    event?: React.MouseEvent | React.PointerEvent
  ) => {
    const dayKey = toDateString(day);
    const key = createCellKey(user.id, dayKey);
    const hasSelection = selectedCells.size > 0;
    const isSelected = selectedCells.has(key);
    const mouseEvt = event as React.MouseEvent;
    const isMeta = !!(mouseEvt && (mouseEvt.metaKey || mouseEvt.ctrlKey));
    const isShiftKey = !!(mouseEvt && mouseEvt.shiftKey);

    if (isMeta) {
      const next = new Set(selectedCells);
      if (isSelected) {
        next.delete(key);
      } else {
        next.add(key);
      }
      setSelectedCells(next);
      setLastSelectedCell({ userId: user.id, dayKey });
      return;
    }

    if (isShiftKey && lastSelectedCell) {
      const lastUserIndex = visibleUserIndexMap.get(lastSelectedCell.userId);
      const lastDayIndex = viewDayKeys.indexOf(lastSelectedCell.dayKey);
      if (lastUserIndex !== undefined && lastDayIndex !== -1) {
        const minRow = Math.min(lastUserIndex, userIndex);
        const maxRow = Math.max(lastUserIndex, userIndex);
        const minDay = Math.min(lastDayIndex, dayIndex);
        const maxDay = Math.max(lastDayIndex, dayIndex);
        const keysToAdd = buildRangeKeys(minRow, maxRow, minDay, maxDay);
        const next = new Set(selectedCells);
        keysToAdd.forEach(k => next.add(k));
        setSelectedCells(next);
        setLastSelectedCell({ userId: user.id, dayKey });
        return;
      }
    }

    if (!hasSelection) {
      setSelectedCells(new Set([key]));
      setLastSelectedCell({ userId: user.id, dayKey });
      return;
    }

    if (!isSelected) {
      const next = new Set(selectedCells);
      next.add(key);
      setSelectedCells(next);
      setLastSelectedCell({ userId: user.id, dayKey });
      return;
    }

    const userDayShifts =
      shiftsByUserDay.get(user.id)?.get(dayKey) || [];
    handleOpenShiftModal(userDayShifts[0] || null, user.id, day);
  };

  const handleCellMouseDown = (
    user: User,
    dayKey: string,
    userIndex: number,
    dayIndex: number,
    event: React.PointerEvent
  ) => {
    const isPrimaryButton =
      event.button === 0 ||
      event.pointerType === 'touch' ||
      event.pointerType === 'pen';
    if (!isPrimaryButton) return;
    event.preventDefault();
    isRangeDragActive.current = true;
    dragStartRef.current = { userIndex, dayIndex };
  };

  const handleCellMouseEnter = (userIndex: number, dayIndex: number) => {
    if (!isRangeDragActive.current || !dragStartRef.current) return;
    const start = dragStartRef.current;
    const minRow = Math.min(start.userIndex, userIndex);
    const maxRow = Math.max(start.userIndex, userIndex);
    const minDay = Math.min(start.dayIndex, dayIndex);
    const maxDay = Math.max(start.dayIndex, dayIndex);
    const keysToAdd = buildRangeKeys(minRow, maxRow, minDay, maxDay);
    setSelectedCells(prev => {
      const next = new Set(prev);
      keysToAdd.forEach(k => next.add(k));
      return next;
    });
  };

  const getDayStart = (dayKey: string) => {
    const date = parseDayKeyLocal(dayKey);
    return date;
  };

  const handleBulkDayOff = async () => {
    if (!canManage || selectedCellEntries.length === 0) return;
    const needsConfirm = selectedCellEntries.some(cell =>
      (shiftsByUserDay.get(cell.userId)?.get(cell.dayKey) || []).some(
        s => !s.isDayOff
      )
    );
    if (needsConfirm) {
      const confirmed = window.confirm(
        'A kijelölt műszakok szabadnapra állnak. Folytatod?'
      );
      if (!confirmed) return;
    }

    const batch = writeBatch(db);
    selectedCellEntries.forEach(cell => {
      const user = userMap.get(cell.userId);
      if (!user) return;
      const targetShifts =
        shiftsByUserDay.get(cell.userId)?.get(cell.dayKey) || [];
      if (targetShifts.length > 0) {
        targetShifts.forEach(shift => {
          batch.update(doc(db, 'shifts', shift.id), {
            isDayOff: true,
            end: null,
            highlight: null,
            highlightOnly: false
          });
        });
      } else {
        const startDate = getDayStart(cell.dayKey);
        const newDocRef = doc(collection(db, 'shifts'));
        const unitId =
          activeUnitIds.find(id => user.unitIds?.includes(id)) ||
          user.unitIds?.[0] ||
          activeUnitIds[0];
        batch.set(newDocRef, {
          id: newDocRef.id,
          userId: user.id,
          userName: user.fullName,
          unitId,
          position: user.position || 'N/A',
          start: Timestamp.fromDate(startDate),
          end: null,
          status: viewMode,
          isDayOff: true,
          highlight: null,
          highlightOnly: false
        } as Shift);
      }
    });
    await batch.commit();
    clearSelection();
  };

  const handleBulkDelete = async () => {
    if (!canManage || selectedCellEntries.length === 0) return;
    const batch = writeBatch(db);
    selectedCellEntries.forEach(cell => {
      const targetShifts =
        shiftsByUserDay.get(cell.userId)?.get(cell.dayKey) || [];
      targetShifts.forEach(shift => {
        batch.delete(doc(db, 'shifts', shift.id));
      });
    });
    await batch.commit();
    clearSelection();
  };

  const handleBulkHighlight = async () => {
    if (!canManage || selectedCellEntries.length === 0) return;
    const batch = writeBatch(db);
    selectedCellEntries.forEach(cell => {
      const user = userMap.get(cell.userId);
      if (!user) return;
      const targetShifts =
        shiftsByUserDay.get(cell.userId)?.get(cell.dayKey) || [];
      if (targetShifts.length > 0) {
        targetShifts.forEach(shift => {
          batch.update(doc(db, 'shifts', shift.id), {
            highlight: 'orange',
            highlightOnly: false
          });
        });
      } else {
        const startDate = getDayStart(cell.dayKey);
        const newDocRef = doc(collection(db, 'shifts'));
        const unitId =
          activeUnitIds.find(id => user.unitIds?.includes(id)) ||
          user.unitIds?.[0] ||
          activeUnitIds[0];
        batch.set(newDocRef, {
          id: newDocRef.id,
          userId: user.id,
          userName: user.fullName,
          unitId,
          position: user.position || 'N/A',
          start: Timestamp.fromDate(startDate),
          end: null,
          status: viewMode,
          isDayOff: false,
          highlight: 'orange',
          highlightOnly: true
        } as Shift);
      }
    });
    await batch.commit();
    clearSelection();
  };

  const handleBulkClearHighlight = async () => {
    if (!canManage || selectedCellEntries.length === 0) return;
    const batch = writeBatch(db);
    selectedCellEntries.forEach(cell => {
      const targetShifts =
        shiftsByUserDay.get(cell.userId)?.get(cell.dayKey) || [];
      targetShifts.forEach(shift => {
        if (shift.highlightOnly) {
          batch.delete(doc(db, 'shifts', shift.id));
        } else {
          batch.update(doc(db, 'shifts', shift.id), {
            highlight: null,
            highlightOnly: false
          });
        }
      });
    });
    await batch.commit();
    clearSelection();
  };

  // --- UPDATED PNG EXPORT FUNCTION (staged multi-block capture) ---
  const handlePngExport = (hideEmptyUsers: boolean): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      if (!tableRef.current) {
        reject(new Error('Table ref not found'));
        return;
      }

      setIsPngExporting(true);

      const exportContainer = document.createElement('div');
      Object.assign(exportContainer.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0',
        backgroundColor: '#ffffff',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: `${tableRef.current.clientWidth + 40}px`
      } as CSSStyleDeclaration);

      const tableToBlock = (startIdx: number, endIdx: number) => {
        const tableClone = tableRef.current!.cloneNode(true) as HTMLTableElement;
        tableClone.querySelectorAll('.export-hide').forEach(el => el.remove());

        tableClone.querySelectorAll<HTMLElement>('.handwritten-note').forEach(el => {
          el.style.whiteSpace = 'pre-wrap';
          el.style.maxWidth = 'none';
          el.style.overflow = 'visible';
          el.style.textOverflow = 'unset';
        });

        tableClone.querySelectorAll<HTMLElement>('*').forEach(el => {
          const toRemove = Array.from(el.classList).filter(cls =>
            cls.startsWith('ring-') || cls.startsWith('shadow-') || cls === 'ring-offset-2'
          );
          if (toRemove.length) {
            toRemove.forEach(cls => el.classList.remove(cls));
            el.style.boxShadow = '';
            el.style.outline = '';
          }
        });

        const dayHeaderTextColor = getContrastingTextColor(
          exportSettings.dayHeaderBgColor
        );
        const nameHeaderTextColor = getContrastingTextColor(
          exportSettings.nameColumnColor
        );

        tableClone
          .querySelectorAll<HTMLTableCellElement>('thead th')
          .forEach((th, idx) => {
            const isNameHeader = idx === 0;
            const bg = isNameHeader
              ? exportSettings.nameColumnColor
              : exportSettings.dayHeaderBgColor;
            th.style.background = bg;
            th.style.color = isNameHeader
              ? nameHeaderTextColor
              : dayHeaderTextColor;
          });

        tableClone
          .querySelectorAll<HTMLTableCellElement>('tbody tr td[colspan]')
          .forEach(td => {
            td.style.background = exportSettings.categoryHeaderBgColor;
            td.style.color = exportSettings.categoryHeaderTextColor;
            td.colSpan = 1 + (endIdx - startIdx + 1);
          });

        const withinRange = (cellIndex: number) =>
          cellIndex === 0 || (cellIndex - 1 >= startIdx && cellIndex - 1 <= endIdx);

        tableClone.querySelectorAll('tr').forEach(row => {
          const cells = Array.from(row.children);
          cells.forEach((cell, idx) => {
            if (!withinRange(idx)) {
              row.removeChild(cell);
            }
          });
        });

        if (hideEmptyUsers) {
          tableClone.querySelectorAll('tbody tr').forEach(row => {
            const isCategoryRow = row.querySelector('td[colSpan]');
            const isSummaryRow = row.classList.contains('summary-row');
            if (isCategoryRow || isSummaryRow) return;
            if (row.classList.contains('no-shifts-week')) {
              row.remove();
            }
          });
        }

        tableClone.querySelectorAll<HTMLElement>('.sticky').forEach(el => {
          el.classList.remove('sticky', 'left-0', 'z-10', 'z-[2]', 'z-[3]', 'z-[5]');
          el.style.position = '';
          el.style.left = '';
          el.style.zIndex = '';
        });

        tableClone.querySelectorAll<HTMLTableCellElement>('td').forEach(td => {
          const txt = (td.textContent || '').trim().toUpperCase();
          if (txt === 'X' || txt === 'SZ' || txt === 'SZABI') {
            td.textContent = '';
          }
        });

        tableClone.querySelectorAll('tr.summary-row').forEach(row => row.remove());

        const zebraBase = exportSettings.zebraColor;
        const zebraDelta = exportSettings.zebraStrength / 5;
        const zebraAlt = adjustColor(exportSettings.zebraColor, -zebraDelta);
        const nameBase = exportSettings.nameColumnColor;
        const nameAlt = adjustColor(exportSettings.nameColumnColor, -zebraDelta);

        tableClone
          .querySelectorAll<HTMLTableCellElement>('th, td')
          .forEach(cell => {
            cell.style.borderWidth = '0.5px';
          });

        let dataRowIndex = 0;
        tableClone.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row => {
          const isCategoryRow = row.querySelector('td[colSpan]');
          const isSummaryRow = row.classList.contains('summary-row');
          if (isCategoryRow || isSummaryRow) return;

          const isAltRow = dataRowIndex % 2 === 1;
          const rowBg = isAltRow ? zebraAlt : zebraBase;
          const rowText = getContrastingTextColor(rowBg);
          row.style.background = rowBg;
          row.style.color = rowText;

          const nameCell = row.querySelector('td');
          if (nameCell) {
            const nameBg = isAltRow ? nameAlt : nameBase;
            nameCell.style.background = nameBg;
            nameCell.style.color = getContrastingTextColor(nameBg);
          }

          row.querySelectorAll<HTMLTableCellElement>('td:not(:first-child)').forEach(td => {
            if (
              !td.classList.contains('day-off-cell') &&
              !td.classList.contains('leave-cell')
            ) {
              td.style.background = rowBg;
              td.style.color = rowText;
            }
          });

          dataRowIndex += 1;
        });

        return tableClone;
      };

      const shouldBlock = viewSpan === 28 || viewSpan === 42;
      const blockSize = shouldBlock ? 14 : viewDays.length;
      const blockCount = Math.max(1, Math.ceil(viewDays.length / blockSize));

      for (let block = 0; block < blockCount; block++) {
        const startIdx = block * blockSize;
        const endIdx = Math.min(viewDays.length - 1, startIdx + blockSize - 1);
        const blockWrapper = document.createElement('div');
        blockWrapper.style.display = 'block';
        blockWrapper.style.overflow = 'hidden';
        blockWrapper.appendChild(tableToBlock(startIdx, endIdx));
        exportContainer.appendChild(blockWrapper);
      }

      document.body.appendChild(exportContainer);

      const waitForImages = () =>
        Promise.all(
          Array.from(exportContainer.querySelectorAll('img')).map(
            img =>
              new Promise<void>(resolveImg => {
                img.crossOrigin = 'anonymous';
                if (img.complete) return resolveImg();
                img.onload = () => resolveImg();
                img.onerror = () => resolveImg();
              })
          )
        );

      try {
        await waitForImages();
        const canvas = await html2canvas(exportContainer, {
          useCORS: true,
          scale: 2,
          backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        const weekStart = viewDays[0]
          .toLocaleDateString('hu-HU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          })
          .replace(/\.\s/g, '-')
          .replace('.', '');
        link.download = `beosztas_${weekStart}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        resolve();
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          resolve();
        } else {
          console.error('PNG export failed:', err);
          alert('Hiba történt a PNG exportálás során.');
          reject(err);
        }
      } finally {
        document.body.removeChild(exportContainer);
        setIsPngExporting(false);
      }
    });
  };
  const closeExportWithGuard = () => {
    setExportConfirmation(null);
    setClickGuardUntil(Date.now() + 500);
  };

  const handleMoveUser = (
    userIdToMove: string,
    direction: 'up' | 'down'
  ) => {
    const currentIndex = orderedUsers.findIndex(
      u => u.id === userIdToMove
    );
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedUsers.length)
      return;

    const currentUser = orderedUsers[currentIndex];
    const targetUser = orderedUsers[targetIndex];

    if (
      targetUser &&
      (currentUser.position || 'Nincs pozíció') ===
        (targetUser.position || 'Nincs pozíció')
    ) {
      const newOrderedUsers = [...orderedUsers];
      [
        newOrderedUsers[currentIndex],
        newOrderedUsers[targetIndex]
      ] = [
        newOrderedUsers[targetIndex],
        newOrderedUsers[currentIndex]
      ];
      setOrderedUsers(newOrderedUsers);
      saveDisplaySettings(
        newOrderedUsers.map(u => u.id),
        Array.from(hiddenUserIds)
      );
    }
  };

  const handleMoveGroup = (
    positionToMove: string,
    direction: 'up' | 'down'
  ) => {
    const allUsersByPos = orderedUsers.reduce(
      (acc, user) => {
        const pos = user.position || 'Nincs pozíció';
        if (!acc[pos]) acc[pos] = [];
        acc[pos].push(user);
        return acc;
      },
      {} as Record<string, User[]>
    );

    const stablePositionOrder = [
      ...new Set(
        orderedUsers.map(u => u.position || 'Nincs pozíció')
      )
    ];

    const currentIndex =
      stablePositionOrder.indexOf(positionToMove);
    if (currentIndex === -1) return;

    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (
      targetIndex < 0 ||
      targetIndex >= stablePositionOrder.length
    )
      return;

    [
      stablePositionOrder[currentIndex],
      stablePositionOrder[targetIndex]
    ] = [
      stablePositionOrder[targetIndex],
      stablePositionOrder[currentIndex]
    ];

    const newOrderedUsers = stablePositionOrder.flatMap(
      pos => allUsersByPos[pos] || []
    );
    setOrderedUsers(newOrderedUsers);
    saveDisplaySettings(
      newOrderedUsers.map(u => u.id),
      Array.from(hiddenUserIds)
    );
  };

  const handleHideUser = (userId: string) => {
    const newHidden = new Set(hiddenUserIds).add(userId);
    setHiddenUserIds(newHidden);
    saveDisplaySettings(
      orderedUsers.map(u => u.id),
      Array.from(newHidden)
    );
  };

  const handleShowUser = (userId: string) => {
    const newHidden = new Set(hiddenUserIds);
    newHidden.delete(userId);
    setHiddenUserIds(newHidden);
    saveDisplaySettings(
      orderedUsers.map(u => u.id),
      Array.from(newHidden)
    );
  };

  if (isDataLoading)
    return (
      <div className="relative h-64">
        <LoadingSpinner />
      </div>
    );

  let userRowIndex = 0;

  return (
    <div className="p-4 md:p-8">
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Kalam&display=swap');
        .toggle-checkbox:checked { right: 0; border-color: #16a34a; }
        .toggle-checkbox:checked + .toggle-label { background-color: #16a34a; }
        .handwritten-note {
          font-family: 'Kalam', cursive;
          transform: rotate(-1deg);
          color: #334155;
          display: inline-block;
          max-width: 100%;
          white-space: normal;
          line-height: 1.1;
          letter-spacing: -0.5px;
          font-size: 0.9em;
        }`}
      </style>

      <ShiftModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        onSave={handleSaveShift}
        onDelete={handleDeleteShift}
        shift={editingShift?.shift || null}
        userId={editingShift?.userId || currentUser.id}
        date={editingShift?.date || new Date()}
        users={filteredUsers}
        schedule={schedule}
        viewMode={viewMode}
        currentUser={currentUser}
        canManage={canManage}
      />

      {isTempModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setIsTempModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-lg font-bold text-slate-800">
                Ideiglenes Alkalmazott Hozzáadása
              </h3>
              <button
                className="rounded-full p-2 hover:bg-slate-100"
                onClick={() => setIsTempModalOpen(false)}
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">
                  Teljes név*
                </label>
                <input
                  type="text"
                  value={tempForm.fullName}
                  onChange={e =>
                    setTempForm(prev => ({ ...prev, fullName: e.target.value }))
                  }
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Pl. Beugrós Béla"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">
                  Pozíció*
                </label>
                <input
                  type="text"
                  value={tempForm.position}
                  onChange={e =>
                    setTempForm(prev => ({ ...prev, position: e.target.value }))
                  }
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Pl. Pultos"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">
                  Egység*
                </label>
                <select
                  value={tempForm.unitId}
                  onChange={e =>
                    setTempForm(prev => ({ ...prev, unitId: e.target.value }))
                  }
                  className="w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Válassz egységet</option>
                  {activeUnitIds.map(uid => {
                    const unit = unitMap.get(uid);
                    return (
                      <option key={uid} value={uid}>
                        {unit?.name || 'Ismeretlen egység'}
                      </option>
                    );
                  })}
                </select>
              </div>
              {tempUserWarning && (
                <p className="text-sm text-amber-600">
                  {tempUserWarning}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button
                onClick={() => setIsTempModalOpen(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Mégse
              </button>
              <button
                onClick={async () => {
                  const targetUnit =
                    tempForm.unitId || (activeUnitIds.length === 1 ? activeUnitIds[0] : '');
                  if (!tempForm.fullName || !tempForm.position || !targetUnit) {
                    alert('A név, pozíció és egység megadása kötelező.');
                    return;
                  }
                  const scopeId = `${targetUnit}_${toDateString(viewDays[0])}`;
                  try {
                    const docRef = doc(
                      collection(db, 'unit_schedules', scopeId, 'tempUsers')
                    );
                    await setDoc(docRef, {
                      id: docRef.id,
                      fullName: tempForm.fullName,
                      position: tempForm.position,
                      unitIds: [targetUnit],
                      isTemporary: true
                    });
                    setTempForm({ fullName: '', position: '', unitId: '' });
                    setTempUserWarning(null);
                    setIsTempModalOpen(false);
                  } catch (error: any) {
                    handleSnapshotError(error);
                    if (error?.code === 'permission-denied') {
                      setTempUserWarning(
                        'Nincs jogosultság beugrós felvételéhez ebben a nézetben.'
                      );
                    } else {
                      alert('Hiba történt a beugrós mentésekor.');
                    }
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Mentés
              </button>
            </div>
          </div>
        </div>
      )}

      {isPublishModalOpen && (
        <PublishWeekModal
          units={unitsWithDrafts}
          onClose={() => setIsPublishModalOpen(false)}
          onConfirm={handleConfirmPublish}
        />
      )}

      {settingsWarning && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {settingsWarning}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevView}
            className="p-2 rounded-full hover:bg-gray-200"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-center">
            {viewDays[0].toLocaleDateString('hu-HU', {
              month: 'long',
              day: 'numeric'
            })}{' '}
            -{' '}
            {viewDays[viewDays.length - 1].toLocaleDateString('hu-HU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h2>
          <button
            onClick={handleNextView}
            className="p-2 rounded-full hover:bg-gray-200"
          >
            &gt;
          </button>
        </div>
        <div className="flex items-center gap-3">
          {hiddenUsers.length > 0 && (
            <div className="relative">
              <button
                onClick={() =>
                  setIsHiddenMenuOpen(p => !p)
                }
                className="p-2 rounded-full hover:bg-gray-200 flex items-center gap-2 text-sm font-semibold text-gray-700"
                title="Elrejtett munkatársak"
              >
                <EyeIcon className="h-6 w-6" />
                <span>({hiddenUsers.length})</span>
              </button>
              {isHiddenMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border z-20 p-2">
                  <p className="text-sm font-bold p-2">
                    Elrejtett munkatársak
                  </p>
                  <div className="max-h-60 overflow-y-auto">
                    {hiddenUsers.map(user => (
                      <div
                        key={user.id}
                        className="flex items-center justify_between p-2 hover:bg-gray-100 rounded"
                      >
                        <span className="text-sm text-gray-800">
                          {user.fullName}
                        </span>
                        <button
                          onClick={() =>
                            handleShowUser(user.id)
                          }
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          Visszaállítás
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setIsTempModalOpen(true)}
            className="p-2 rounded-full hover:bg-gray-200"
            title="Beugrós hozzáadása"
          >
            <UserPlusIcon className="h-6 w-6" />
          </button>
          {canManage && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-full hover:bg-gray-200"
              title="Heti beállítások"
            >
              <SettingsIcon className="h-6 w-6" />
            </button>
          )}
          {canManage && (
            <div className="flex items-center bg-gray-200 rounded-full p-1">
              <button
                onClick={() => setViewMode('draft')}
                className={`px-4 py-1 rounded-full text-sm font-semibold ${
                  viewMode === 'draft'
                    ? 'bg-white shadow'
                    : ''
                }`}
              >
                Piszkozat
              </button>
              <button
                onClick={() => setViewMode('published')}
                className={`px-4 py-1 rounded-full text-sm font-semibold ${
                  viewMode === 'published'
                    ? 'bg-white shadow'
                    : ''
                }`}
              >
                Publikált
              </button>
            </div>
          )}
          <button
            onClick={() =>
              setExportConfirmation({ type: 'PNG' })
            }
            disabled={isPngExporting}
            className="p-2 rounded-full hover:bg-gray-200"
            title="Exportálás PNG-be"
          >
            {isPngExporting ? (
              <svg
                className="animate-spin h-6 w-6 text-gray-700"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              <ImageIcon className="h-6 w-6" />
            )}
          </button>
          <button
            onClick={() =>
              setExportConfirmation({ type: 'Excel' })
            }
            className="p-2 rounded-full hover:bg-gray-200"
            title="Exportálás Excelbe"
          >
            <DownloadIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {canManage && showSettings && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-4"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <div className="flex border-b">
                <button
                  onClick={() =>
                    setActiveSettingsTab('opening')
                  }
                  className={`px-4 py-2 font-semibold ${
                    activeSettingsTab === 'opening'
                      ? 'border-b-2 border-green-600 text-green-600'
                      : 'text-gray-500'
                  }`}
                >
                  Nyitvatartás
                </button>
                <button
                  onClick={() =>
                    setActiveSettingsTab('export')
                  }
                  className={`px-4 py-2 font-semibold ${
                    activeSettingsTab === 'export'
                      ? 'border-b-2 border-green-600 text-green-600'
                      : 'text-gray-500'
                  }`}
                  disabled={activeUnitIds.length !== 1}
                >
                  Export (PNG) Stílus
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto">
              {activeSettingsTab === 'opening' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                      Nézet hossza
                      <select
                        value={viewSpan}
                        onChange={e => {
                          const parsed = Number(e.target.value) as ViewSpan;
                          setViewSpan(parsed);
                          setSelectedCells(new Set());
                        }}
                        className="p-2 border rounded"
                      >
                        {VIEW_SPAN_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={openingSettings.showOpeningTime}
                        onChange={e =>
                          handleSettingsChange(prev => ({
                            ...prev,
                            showOpeningTime: e.target.checked
                          }))
                        }
                        className="h-4 w-4 rounded"
                      />{' '}
                      Nyitás megjelenítése
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={openingSettings.showClosingTime}
                        onChange={e =>
                          handleSettingsChange(prev => ({
                            ...prev,
                            showClosingTime: e.target.checked
                          }))
                        }
                        className="h-4 w-4 rounded"
                      />{' '}
                      Zárás megjelenítése
                    </label>
                  </div>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-100"
                    >
                      <span className="font-semibold w-24">
                        {WEEKDAY_LABELS[i]}
                      </span>
                      <input
                        type="time"
                        value={
                          openingSettings.dailySettings[i]?.openingTime || ''
                        }
                        onChange={e =>
                          handleSettingsChange(prev => ({
                            ...prev,
                            dailySettings: {
                              ...prev.dailySettings,
                              [i]: {
                                ...prev.dailySettings[i],
                                openingTime: e.target.value
                              }
                            }
                          }))
                        }
                        className="p-1 border rounded"
                      />
                      <input
                        type="time"
                        value={
                          openingSettings.dailySettings[i]?.closingTime || ''
                        }
                        onChange={e =>
                          handleSettingsChange(prev => ({
                            ...prev,
                            dailySettings: {
                              ...prev.dailySettings,
                              [i]: {
                                ...prev.dailySettings[i],
                                closingTime: e.target.value
                              }
                            }
                          }))
                        }
                        className="p-1 border rounded"
                      />
                      <div className="flex flex-col">
                        <input
                          type="number"
                          min={0}
                          value={
                            openingSettings.dailySettings[i]?.closingOffsetMinutes
                              ?.toString() ?? ''
                          }
                          onChange={e => {
                            const val = Number(e.target.value) || 0;
                            handleSettingsChange(prev => ({
                              ...prev,
                              dailySettings: {
                                ...prev.dailySettings,
                                [i]: {
                                  ...prev.dailySettings[i],
                                  closingOffsetMinutes: val
                                }
                              }
                            }));
                          }}
                          className="p-1 border rounded w-28"
                          placeholder="Offset (perc)"
                        />
                        <span className="text-xs text-gray-500 mt-1">
                          Zárás utáni munka (pl. takarítás)
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {activeSettingsTab === 'export' && (
                <ExportSettingsPanel
                  settings={exportSettings}
                  setSettings={setExportSettings}
                  presetColors={activeBrandColors}
                />
              )}
            </div>
            <div className="p-4 bg-gray-50 flex justify-between items_center rounded-b-2xl">
              <button
                onClick={() =>
                  setExportSettings(DEFAULT_EXPORT_SETTINGS)
                }
                className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
              >
                Alaphelyzet
              </button>
              <div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-gray-200 px-4 py-2 rounded-lg font-semibold mr-2"
                >
                  Bezár
                </button>
                {activeSettingsTab === 'export' && (
                  <button
                    onClick={handleSaveExportSettings}
                    disabled={
                      !exportSettingsHaveChanged ||
                      isSavingExportSettings
                    }
                    className="text-white px-4 py-2 rounded-lg font-semibold disabled:bg-gray-400"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {isSavingExportSettings
                      ? 'Mentés...'
                      : 'Mentés'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {canManage && viewMode === 'draft' && (
        <div className="mb-4 text-center">
          <button
            onClick={handlePublishWeek}
            className="text-white font-bold py-2 px-6 rounded-lg"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            Hét publikálása
          </button>
        </div>
      )}

      {canManage && (
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`rounded-full border p-2 transition-colors ${
              isEditMode ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white text-slate-700'
            }`}
            title="Sorrend szerkesztése"
            style={{
              backgroundColor: 'var(--color-surface-static)',
              color: 'var(--color-text-main)',
              borderColor: 'var(--color-border)',
            }}
          >
            <PencilIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {selectedCells.size > 0 && (
        <div className="sticky top-2 z-30 mb-2 flex flex-wrap items-center gap-2 bg-white/90 backdrop-blur rounded-xl border shadow-sm px-3 py-2">
          <span className="text-sm font-semibold text-slate-700">
            {selectedCells.size} cella kijelölve
          </span>
          <button
            onClick={handleBulkDayOff}
            disabled={!canManage}
            className="flex items-center gap-1 rounded-full bg-rose-50 text-rose-600 px-3 py-1 text-sm font-semibold hover:bg-rose-100"
            title="Szabadnap"
          >
            <XIcon className="h-4 w-4" />
            Szabadnap
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={!canManage}
            className="flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-sm font-semibold hover:bg-slate-200"
          >
            <TrashIcon className="h-4 w-4" />
            Törlés
          </button>
          <button
            onClick={handleBulkHighlight}
            disabled={!canManage}
            className="flex items-center gap-1 rounded-full bg-orange-50 text-orange-700 px-3 py-1 text-sm font-semibold hover:bg-orange-100"
          >
            <span className="h-3 w-3 rounded-full bg-orange-500" />
            Kiemelés
          </button>
          <button
            onClick={handleBulkClearHighlight}
            disabled={!canManage}
            className="flex items-center gap-1 rounded-full bg-white border border-orange-200 text-orange-700 px-3 py-1 text-sm font-semibold hover:bg-orange-50"
          >
            Kiemelés törlése
          </button>
          <button
            onClick={clearSelection}
            className="ml-auto text-sm text-slate-600 hover:text-slate-800 underline"
          >
            Kijelölés törlése
          </button>
        </div>
      )}

      <div
        className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm"
        style={{
          backgroundColor: 'var(--color-surface-static)',
          color: 'var(--color-text-main)',
          borderColor: 'var(--color-border)',
        }}
      >
        <table
          ref={tableRef}
          className="min-w-full text-sm"
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
          }}
        >
          <thead className="bg-slate-100">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-100 px-4 py-3 text-left text-xs font-semibold text-slate-600">
                Munkatárs
              </th>
              {viewDays.map((day, idx) => {
                const isAltWeekBlock =
                  viewSpan >= 28 &&
                  Math.floor(idx / 7) % 2 === 1;
                return (
                  <th
                    key={idx}
                    className="px-3 py-3 text-center text-xs font-semibold text-slate-600"
                    style={isAltWeekBlock ? { backgroundColor: '#f8fafc' } : undefined}
                  >
                    {day.toLocaleDateString('hu-HU', {
                      weekday: 'short'
                    })}
                    <br />
                    {day.toLocaleDateString('hu-HU', {
                      month: '2-digit',
                      day: '2-digit'
                    })}
                  </th>
                );
              })}
            </tr>

            {weekSettings &&
              (weekSettings.showOpeningTime ||
                weekSettings.showClosingTime) && (
                <>
                  {weekSettings.showOpeningTime && (
                    <tr>
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1 text-left text-[11px] font-semibold text-slate-500 border border-slate-200">
                        Nyitás
                      </td>
                      {viewDays.map((_, i) => (
                        <td
                          key={i}
                          className="px-3 py-1 text-center text-[11px] text-slate-500 border border-slate-200"
                        >
                          {weekSettings.dailySettings[i % 7]?.openingTime || '-'}
                        </td>
                      ))}
                    </tr>
                  )}
                  {weekSettings.showClosingTime && (
                    <tr>
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1 text-left text-[11px] font-semibold text-slate-500 border border-slate-200">
                        Zárás
                      </td>
                      {viewDays.map((_, i) => (
                        <td
                          key={i}
                          className="px-3 py-1 text-center text-[11px] text-slate-500 border border-slate-200"
                        >
                          {weekSettings.dailySettings[i % 7]?.closingTime || '-'}
                        </td>
                      ))}
                    </tr>
                  )}
                </>
              )}
          </thead>

          <tbody>
            {visiblePositionOrder.map(positionName => {
              const usersInPos = visibleUsersByPosition[positionName] || [];
              if (usersInPos.length === 0) return null;

              return (
                <React.Fragment key={positionName}>
                  {/* Pozíció fejléce */}
                  <tr>
                    <td
                      colSpan={1 + viewDays.length}
                      className="sticky left-0 z-[5] bg-slate-300 px-4 py-2 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-800 border-t border-b border-slate-400"
                    >
                      <div className="flex items-center justify-between">
                        <span>{positionName}</span>
                        {isEditMode && (
                          <span className="flex items-center gap-1 export-hide">
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveGroup(positionName, 'up')
                              }
                              className="rounded-full p-1 hover:bg-slate-300"
                              title="Pozíció blokk feljebb"
                            >
                              <ArrowUpIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleMoveGroup(positionName, 'down')
                              }
                              className="rounded-full p-1 hover:bg-slate-300"
                              title="Pozíció blokk lejjebb"
                            >
                              <ArrowDownIcon className="h-4 w-4" />
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Dolgozók */}
                  {usersInPos.map(user => {
                    const userUnitId =
                      user.unitIds?.find(uid => activeUnitIds.includes(uid)) ||
                      user.unitIds?.[0];
                    const userUnit = userUnitId
                      ? unitMap.get(userUnitId)
                      : undefined;
                      const weeklyHours = workHours.userTotals[user.id] || 0;
                      const isEmptyWeek = weeklyHours === 0;

                    const currentRowIndex = zebraRowIndex;
                    const userIndex = visibleUserIndexMap.get(user.id) ?? 0;
                    const isAltRow = currentRowIndex % 2 === 1;
                    const rowBg = isAltRow
                      ? tableAltZebraColor
                      : tableBaseZebraColor;
                    const nameBg = isAltRow
                      ? tableAltNameColor
                      : tableBaseNameColor;
                    const nameTextColor = getContrastingTextColor(nameBg);
                    const rowTextColor = getContrastingTextColor(rowBg);
                    zebraRowIndex += 1;

                    return (
                      <tr
                        key={user.id}
                        className={isEmptyWeek ? 'no-shifts-week' : ''}
                        style={{ background: rowBg }}
                      >
                        {/* Név oszlop */}
                    <td
                      className="sticky left-0 z-[3] bg-white border border-slate-200 px-4 py-2 text-left align-middle align-middle"
                      style={{ background: nameBg, color: nameTextColor }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 leading-tight">
                              {user.fullName}
                            </span>
                            {isMultiUnitView && (
                              <div className="flex items-center gap-1">
                                {(user.unitIds || [])
                                  .filter(uid => activeUnitIds.includes(uid))
                                  .map(uid => unitMap.get(uid))
                                  .filter(Boolean)
                                  .map(unit => (
                                    <UnitLogoBadge
                                      key={unit!.id}
                                      unit={unit!}
                                      size={16}
                                    />
                                  ))}
                              </div>
                            )}
                          </div>
                          <span className="export-hide text-[11px] text-slate-400">
                            {weeklyHours.toFixed(1)} óra / hét
                          </span>
                            </div>
                            {isEditMode && (
                              <div className="flex items-center gap-1 export-hide">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveUser(user.id, 'up')
                                  }
                                  className="rounded-full p-1 hover:bg-slate-100"
                                  title="Feljebb"
                                >
                                  <ArrowUpIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveUser(user.id, 'down')
                                  }
                                  className="rounded-full p-1 hover:bg-slate-100"
                                  title="Lejjebb"
                                >
                                  <ArrowDownIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHideUser(user.id)}
                                  className="rounded-full p-1 hover:bg-slate-100"
                                  title="Elrejtés"
                                >
                                  <EyeSlashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Napok */}
                        {viewDays.map((day, dayIndex) => {
                          const dayKey = toDateString(day);
                          const userDayShifts =
                            shiftsByUserDay.get(user.id)?.get(dayKey) || [];
                          const userDayRequests =
                            requestsByUserDay.get(user.id)?.get(dayKey) || [];
                          const leaveRequest = userDayRequests.find(
                            req => req.type === 'leave'
                          );
                          const availabilityRequests = userDayRequests.filter(
                            req => req.type === 'availability'
                          );

                          const displayParts: string[] = [];
                          let isDayOff = false;
                          const isLeave = !!leaveRequest && userDayShifts.length === 0;
                          const shiftNote =
                            userDayShifts.find(
                              s => s.note && !s.isDayOff
                            )?.note || '';
                          const highlightShift = userDayShifts.find(
                            s => s.highlight === 'orange' || s.highlightOnly
                          );

                          if (userDayShifts.length > 0) {
                            const dayOffShift = userDayShifts.find(
                              s => s.isDayOff
                            );
                            if (dayOffShift) {
                              displayParts.push('X');
                              isDayOff = true;
                            } else {
                              displayParts.push(
                                ...userDayShifts
                                  .map(s => {
                                    if (!s.start) return '';
                                    const startStr =
                                      s.start
                                        .toDate()
                                        .toTimeString()
                                        .substring(0, 5) || '';
                                    if (!s.end) return startStr;
                                    const endStr =
                                      s.end
                                        .toDate()
                                        .toTimeString()
                                        .substring(0, 5) || '';
                                    return `${startStr}-${endStr}`;
                                  })
                                  .filter(Boolean)
                              );
                            }
                          }

                          const shouldShowAvailability =
                            availabilityRequests.length > 0 && !isDayOff && !isLeave;

                          if (shouldShowAvailability) {
                            displayParts.push(
                              ...availabilityRequests.map(req => {
                                const range = req.timeRange
                                  ? `${req.timeRange.from}-${req.timeRange.to}`
                                  : 'Időpont kérés';
                                return `⏳ ${range}`;
                              })
                            );
                          }

                          if (!userDayShifts.length && leaveRequest) {
                            displayParts.push('SZ');
                          }

                          const canEditCell = canManage || user.id === currentUser.id;
                          const hasHighlight = !!highlightShift;
                          const hasContent =
                            displayParts.length > 0 ||
                            (hasHighlight && highlightShift?.highlightOnly);
                          const hasNote = !!shiftNote;
                          const shiftUnit =
                            userDayShifts[0]?.unitId &&
                            unitMap.get(userDayShifts[0].unitId || '');
                          const isSelected = selectedCells.has(
                            createCellKey(user.id, dayKey)
                          );
                          const weekBlockAlt =
                            viewSpan >= 28 &&
                            Math.floor(dayIndex / 7) % 2 === 1;

                          let cellClasses =
                            'whitespace-pre-wrap align-middle text-center border border-slate-200 text-[13px] cursor-pointer transition-colors select-none';
                          if (isDayOff) {
                            cellClasses +=
                              ' bg-rose-50 text-rose-500 font-semibold day-off-cell';
                          } else if (isLeave) {
                            cellClasses +=
                              ' bg-amber-50 text-amber-600 font-semibold leave-cell';
                          } else if (hasContent) {
                            cellClasses += ' text-slate-800';
                          } else {
                            cellClasses += ' text-slate-400';
                          }
                          if (isSelected) {
                            cellClasses +=
                              ' ring-2 ring-emerald-500 ring-offset-2 ring-offset-white';
                          }

                          const baseBg =
                            !isDayOff && !isLeave
                              ? weekBlockAlt
                                ? adjustColor(rowBg, 4)
                                : rowBg
                              : undefined;
                          const finalBg =
                            hasHighlight && !isDayOff && !isLeave
                              ? '#FFF7ED'
                              : baseBg;
                          const finalTextColor =
                            hasHighlight && !isDayOff && !isLeave
                              ? '#92400e'
                              : rowTextColor;

                          return (
                            <td
                              key={dayIndex}
                              className={cellClasses}
                              style={
                                !isDayOff && !isLeave
                                  ? { background: finalBg, color: finalTextColor }
                                  : undefined
                              }
                              onClick={e =>
                                canEditCell &&
                                handleCellSelect(user, day, userIndex, dayIndex, e)
                              }
                              onPointerDown={e =>
                                canEditCell &&
                                handleCellMouseDown(
                                  user,
                                  dayKey,
                                  userIndex,
                                  dayIndex,
                                  e
                                )
                              }
                              onPointerEnter={() =>
                                canEditCell &&
                                handleCellMouseEnter(userIndex, dayIndex)
                              }
                            >
                              <div className="relative flex flex-col items-center justify-center px-1 py-2 min-h-[40px] gap-1 overflow-hidden">
                                {isSelected && (
                                  <span
                                    className="pointer-events-none absolute inset-0 bg-emerald-50/60 ring-2 ring-emerald-500/80 ring-offset-1 ring-offset-white shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                                    style={(() => {
                                      const neighborKey = (
                                        rowOffset: number,
                                        colOffset: number
                                      ) => {
                                        const neighborUser = visibleFlatUsers[userIndex + rowOffset];
                                        const neighborDay = viewDayKeys[dayIndex + colOffset];
                                        if (!neighborUser || !neighborDay) return null;
                                        return createCellKey(neighborUser.id, neighborDay);
                                      };
                                      const topKey = neighborKey(-1, 0);
                                      const bottomKey = neighborKey(1, 0);
                                      const leftKey = neighborKey(0, -1);
                                      const rightKey = neighborKey(0, 1);
                                      const hasTopNeighbor = topKey ? selectedCells.has(topKey) : false;
                                      const hasBottomNeighbor = bottomKey
                                        ? selectedCells.has(bottomKey)
                                        : false;
                                      const hasLeftNeighbor = leftKey ? selectedCells.has(leftKey) : false;
                                      const hasRightNeighbor = rightKey ? selectedCells.has(rightKey) : false;
                                      const radius = 10;
                                      return {
                                        borderTopLeftRadius:
                                          !hasTopNeighbor || !hasLeftNeighbor ? radius : 0,
                                        borderTopRightRadius:
                                          !hasTopNeighbor || !hasRightNeighbor ? radius : 0,
                                        borderBottomLeftRadius:
                                          !hasBottomNeighbor || !hasLeftNeighbor ? radius : 0,
                                        borderBottomRightRadius:
                                          !hasBottomNeighbor || !hasRightNeighbor ? radius : 0
                                      };
                                    })()}
                                  />
                                )}
                                {isMultiUnitView &&
                                  userDayShifts.length > 0 &&
                                  userDayShifts[0]?.unitId &&
                                  shiftUnit &&
                                  userDayShifts[0].unitId !== userUnitId && (
                                    <div className="absolute left-1 top-1">
                                      <UnitLogoBadge unit={shiftUnit} size={14} />
                                    </div>
                                  )}
                                {hasHighlight && (
                                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-orange-500" />
                                )}
                                {hasContent && (
                                  <span className="relative z-10 whitespace-pre-wrap leading-tight">
                                    {displayParts.join('\n')}
                                  </span>
                                )}
                                {hasNote && (
                                  <span className="relative z-10 handwritten-note tracking-tighter">
                                    {`"${shiftNote}"`}
                                  </span>
                                )}
                                {!hasContent && canEditCell && (
                                  <span className="export-hide pointer-events-none select-none text-slate-200 text-lg font-light relative z-10">
                                    +
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Összesített sor (napi órák) */}
            <tr className="summary-row bg-slate-50 border-t border-slate-300">
              <td className="sticky left-0 z-[2] bg-slate-50 px-4 py-2 text-left align-middle text-xs font-semibold text-slate-700">
                Napi összes (óra)
              </td>
              {viewDays.map((_, i) => (
                <td
                  key={i}
                  className="px-3 py-2 text-center text-xs font-semibold text-slate-700"
                >
                  {workHours.dayTotals[i].toFixed(1)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Export megerősítő modal */}
      {exportConfirmation && (
        <ExportConfirmationModal
          type={exportConfirmation.type}
          onClose={closeExportWithGuard}
          exportSettings={exportSettings}
          unitName={
            activeUnitIds.length === 1
              ? allUnits.find(u => u.id === activeUnitIds[0])?.name ||
                'Ismeretlen egység'
              : 'Több egység'
          }
          hideEmptyUsersOnExport={hideEmptyUsersOnExport}
          onToggleHideEmptyUsers={value =>
            setHideEmptyUsersOnExport(value)
          }
          onConfirm={async () => {
            try {
              if (exportConfirmation.type === 'PNG') {
                await handlePngExport(hideEmptyUsersOnExport);
                setSuccessToast('PNG export sikeres!');
              } else {
                // Excel export
                try {
                  await generateExcelExport({
                    weekDays: viewDays,
                    orderedUsers,
                    visiblePositionOrder,
                    shiftsByUserDay,
                    weekSettings,
                    requestsByUserDay
                  });
                  setSuccessToast('Excel export sikeres!');
                } catch (err) {
                  console.error('Excel export failed:', err);
                  alert('Hiba történt az Excel exportálás során.');
                }
              }
            } finally {
              closeExportWithGuard();
            }
          }}
        />
      )}

      {/* Siker üzenet eltüntetése pár másodperc után */}
      {successToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition duration-300 ease-out"
        >
          {successToast}
        </div>
      )}
    </div>
  );
};
