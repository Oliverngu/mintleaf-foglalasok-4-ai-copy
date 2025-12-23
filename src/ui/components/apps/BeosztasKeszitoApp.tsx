import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
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
    note: '',
    isHighlighted: false
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
        note: shift.note || '',
        isHighlighted: !!shift.isHighlighted
      });
    } else {
      setIsDayOff(false);
      setFormData({
        userId: userId,
        startTime: '',
        endTime: '',
        note: '',
        isHighlighted: false
      });
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
        isDayOff: true,
        isHighlighted: false
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
        isDayOff: false,
        isHighlighted: formData.isHighlighted
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
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Kiemelés (narancs)</label>
              <input
                type="checkbox"
                checked={!!formData.isHighlighted && !isDayOff}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    isHighlighted: isDayOff ? false : e.target.checked
                  }))
                }
                disabled={isDayOff}
              />
              {formData.isHighlighted && !isDayOff && (
                <button
                  type="button"
                  onClick={() =>
                    setFormData(prev => ({ ...prev, isHighlighted: false }))
                  }
                  className="text-xs text-orange-600 font-semibold underline"
                >
                  Kiemelés törlése
                </button>
              )}
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

const getWeekDays = (date: Date): Date[] => {
  const startOfWeek = new Date(date);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const newDay = new Date(startOfWeek);
    newDay.setDate(startOfWeek.getDate() + i);
    return newDay;
  });
};

const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  const isTouchLike = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(pointer: coarse)')?.matches) return true;
    return 'ontouchstart' in window;
  }, []);
  const selectionArmedRef = useRef(false);
  const armedCellKeyRef = useRef<string | null>(null);
  const modalOpenTokenRef = useRef<string | null>(null);
  const lastOpenAttemptAtByKeyRef = useRef<Record<string, number>>({});
  const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [selectionOverlays, setSelectionOverlays] = useState<
    { id: string; left: number; top: number; width: number; height: number }[]
  >([]);
  const [bulkConfirm, setBulkConfirm] = useState<{
    action: 'dayOff' | 'setStart' | 'setEnd' | 'deleteNote' | 'highlight';
    time?: string;
    payload?: any;
    counts: { total: number; editable: number; hasContent: number };
  } | null>(null);
  const [bulkTimeModal, setBulkTimeModal] = useState<{
    type: 'start' | 'end';
    value: string;
  } | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const overlayRafRef = useRef<number | null>(null);
  const toggleCellSelection = useCallback(
    (cellKey: string) => {
      setSelectedCellKeys(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
    },
    []
  );
  const parseCellKey = useCallback((cellKey: string) => {
  if (!cellKey || cellKey.length < 12) {
    return { userId: '', dayKey: '' };
  }

  const dayKey = cellKey.slice(-10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { userId: '', dayKey: '' };
  }

  const sepIndex = cellKey.length - 11;
  if (cellKey[sepIndex] !== '-') {
    return { userId: '', dayKey: '' };
  }

  const userId = cellKey.slice(0, sepIndex);
  return { userId, dayKey };
}, []);
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

  const [clickGuardUntil, setClickGuardUntil] = useState<number>(0);
  const isMultiUnitView = activeUnitIds.length > 1;

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
    const unsubUsers = onSnapshot(collection(db, 'users'), snapshot => {
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
    });

    const unsubPositions = onSnapshot(
      query(collection(db, 'positions'), orderBy('name')),
      snapshot => {
        setPositions(
          snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...(docSnap.data() as any)
          })) as Position[]
        );
      }
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

  const weekDays = useMemo(
    () => getWeekDays(currentDate),
    [currentDate]
  );
  const weekDayKeys = useMemo(
    () => weekDays.map(day => toDateString(day)),
    [weekDays]
  );

  const weekStartDateStr = useMemo(
    () => toDateString(weekDays[0]),
    [weekDays]
  );

  const openingSettings = useMemo(
    () =>
      weekSettings ||
      createDefaultSettings(activeUnitIds[0] || 'default', weekStartDateStr),
    [weekSettings, activeUnitIds, weekStartDateStr]
  );

  useEffect(() => {
    if (!activeUnitIds || activeUnitIds.length === 0) {
      setUnitWeekSettings({});
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      const entries = await Promise.all(
        activeUnitIds.map(async unitId => {
          try {
            const settingsId = `${unitId}_${weekStartDateStr}`;
            const snap = await getDoc(
              doc(db, 'schedule_settings', settingsId)
            );
            if (snap.exists()) {
              return snap.data() as ScheduleSettings;
            }
            return createDefaultSettings(unitId, weekStartDateStr);
          } catch (error) {
            console.error(
              'Failed to load schedule settings for unit',
              unitId,
              error
            );
            return null;
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
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [activeUnitIds, weekDays, weekStartDateStr]);

  const filteredUsers = useMemo(() => {
    if (!activeUnitIds || activeUnitIds.length === 0) return [];
    return allAppUsers
      .filter(
        u => u.unitIds && u.unitIds.some(uid => activeUnitIds.includes(uid))
      )
      .sort((a, b) =>
        (a.position || '').localeCompare(b.position || '')
      );
  }, [allAppUsers, activeUnitIds]);

  useEffect(() => {
    if (!settingsDocId) return;
    const docRef = doc(db, 'schedule_display_settings', settingsDocId);
    const unsubscribe = onSnapshot(docRef, docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setSavedOrderedUserIds(data.orderedUserIds || []);
        setSavedHiddenUserIds(data.hiddenUserIds || []);
      } else {
        setSavedOrderedUserIds([]);
        setSavedHiddenUserIds([]);
      }
    });
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
    const unsub = onSnapshot(settingsDocRef, docSnap => {
      const settings = {
        ...DEFAULT_EXPORT_SETTINGS,
        ...(docSnap.data() || {})
      } as ExportStyleSettings;
      setExportSettings(settings);
      setInitialExportSettings(settings);
    });
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
    const weekStartDateStr = toDateString(weekDays[0]);
    const settingsId = `${unitId}_${weekStartDateStr}`;
    const unsub = onSnapshot(
      doc(db, 'schedule_settings', settingsId),
      docSnap => {
        if (docSnap.exists()) {
          setWeekSettings(docSnap.data() as ScheduleSettings);
        } else {
          setWeekSettings(
            createDefaultSettings(unitId, weekStartDateStr)
          );
        }
      }
    );
    return () => unsub();
  }, [activeUnitIds, weekDays, canManage]);

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

      const unitSettings =
        unitWeekSettings[shift.unitId] ||
        (weekSettings?.unitId === shift.unitId ? weekSettings : undefined);

      return (
        unitSettings?.dailySettings?.[dayIndex] ||
        weekSettings?.dailySettings?.[dayIndex] ||
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
    const dayTotals: number[] = Array(7).fill(0);

    orderedUsers.forEach(user => {
      userTotals[user.id] = 0;
      weekDays.forEach((day, dayIndex) => {
        const dayKey = toDateString(day);
        const dayShifts =
          shiftsByUserDay.get(user.id)?.get(dayKey) || [];

        const dayHours = dayShifts.reduce(
          (sum, shift) =>
            sum +
            calculateShiftDuration(shift, {
              closingTime:
                getUnitDaySetting(shift, dayIndex)?.closingTime || null,
              closingOffsetMinutes:
                getUnitDaySetting(shift, dayIndex)?.closingOffsetMinutes || 0,
              referenceDate: weekDays[dayIndex]
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
    weekDays,
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

  const renderedUserOrder = useMemo(
    () =>
      visiblePositionOrder.flatMap(
        pos => visibleUsersByPosition[pos] || []
      ),
    [visiblePositionOrder, visibleUsersByPosition]
  );

  const hiddenUsers = useMemo(
    () =>
      allAppUsers.filter(u => hiddenUserIds.has(u.id)),
    [allAppUsers, hiddenUserIds]
  );

  let zebraRowIndex = 0;
  const getCellTargets = useCallback(() => {
    const targets: {
      cellKey: string;
      user: User;
      dayKey: string;
      date: Date;
      shift: Shift | null;
      canEdit: boolean;
    }[] = [];

    selectedCellKeys.forEach(cellKey => {
      const { userId, dayKey } = parseCellKey(cellKey);
      if (!dayKey) return;

      const user = allAppUsers.find(u => u.id === userId);
      if (!user) return;

      const dayIndex = weekDayKeys.indexOf(dayKey);
      if (dayIndex === -1) return;

      const date = weekDays[dayIndex];
      const shifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
      const primaryShift = shifts[0] || null;
      if (
        primaryShift?.unitId &&
        activeUnitIds[0] &&
        primaryShift.unitId !== activeUnitIds[0]
      ) {
        return;
      }

      targets.push({
        cellKey,
        user,
        dayKey,
        date,
        shift: primaryShift,
        canEdit:
          canManage ||
          (userId === currentUser.id &&
            (!primaryShift?.unitId ||
              primaryShift.unitId === activeUnitIds[0]))
      });
    });

    return targets;
  }, [
    selectedCellKeys,
    parseCellKey,
    allAppUsers,
    weekDayKeys,
    weekDays,
    shiftsByUserDay,
    canManage,
    currentUser.id,
    activeUnitIds
  ]);

  const ensureShiftForTarget = useCallback(
    async (
      target: {
        cellKey: string;
        user: User;
        dayKey: string;
        date: Date;
        shift: Shift | null;
        canEdit: boolean;
      },
      baseFields: Partial<Shift> = {}
    ): Promise<Shift | null> => {
      if (target.shift?.id) return target.shift;

      const activeUnitId = activeUnitIds[0];
      const userInActiveUnit =
        !!activeUnitId && !!target.user.unitIds?.includes(activeUnitId);
      if (!canManage && !userInActiveUnit) {
        return null;
      }

      const dayStart = new Date(target.date);
      dayStart.setHours(0, 0, 0, 0);

      const newShiftData: Omit<Shift, 'id'> = {
        userId: target.user.id,
        userName: target.user.fullName || target.user.id || 'N/A',
        position: target.user.position || '',
        unitId: activeUnitIds[0],
        status: viewMode,
        start: Timestamp.fromDate(dayStart),
        end: null,
        note: '',
        isDayOff: false,
        isHighlighted: false,
        ...baseFields
      };

      const docRef = await addDoc(collection(db, 'shifts'), newShiftData);
      return { id: docRef.id, ...newShiftData };
    },
    [activeUnitIds, canManage, viewMode]
  );

  const executeBulk = useCallback(
    async (
      action: 'dayOff' | 'setStart' | 'setEnd' | 'deleteNote' | 'highlight',
      payload?: any
    ) => {
      const targets = getCellTargets();
      if (!targets.length) return;
      const timeValue =
        typeof payload === 'string' ? payload : payload?.time ?? null;
      const parsedTime =
        action === 'setStart' || action === 'setEnd'
          ? (() => {
              if (!timeValue || typeof timeValue !== 'string') return null;
              const [h, m] = timeValue.split(':').map(Number);
              if (Number.isNaN(h) || Number.isNaN(m)) return null;
              return { hours: h, minutes: m };
            })()
          : null;

      if (
        (action === 'setStart' || action === 'setEnd') &&
        !parsedTime
      ) {
        alert('Adj meg egy időpontot (HH:MM)');
        return;
      }

      let skippedPerm = 0;
      let errors = 0;
      let permDenied = 0;
      let applied = 0;

      for (const target of targets) {
        const unitId = activeUnitIds[0];
        if (!target.canEdit) {
          skippedPerm += 1;
          continue;
        }

        try {
          let updatePayload: Partial<Shift> = {};
          let baseFields: Partial<Shift> = {};

          if (action === 'dayOff') {
            const dayStart = new Date(target.date);
            dayStart.setHours(0, 0, 0, 0);
            const startTs = Timestamp.fromDate(dayStart);
            updatePayload = {
              start: startTs,
              end: null,
              isDayOff: true,
              isHighlighted: false
            };
            baseFields = updatePayload;
          } else if (action === 'setStart') {
            const date = new Date(target.date);
            date.setHours(parsedTime.hours, parsedTime.minutes || 0, 0, 0);
            const ts = Timestamp.fromDate(date);
            updatePayload = { start: ts, isDayOff: false };
            baseFields = { ...updatePayload };
          } else if (action === 'setEnd') {
            const date = new Date(target.date);
            date.setHours(parsedTime.hours, parsedTime.minutes || 0, 0, 0);
            const dayStart = new Date(target.date);
            dayStart.setHours(0, 0, 0, 0);
            updatePayload = {
              end: Timestamp.fromDate(date),
              isDayOff: false
            };
            if (!target.shift?.start) {
              updatePayload.start = Timestamp.fromDate(dayStart);
            }
            baseFields = { start: Timestamp.fromDate(dayStart), ...updatePayload };
          } else if (action === 'deleteNote') {
            updatePayload = { note: '' };
            baseFields = updatePayload;
          } else if (action === 'highlight') {
  // Highlight ne hozzon létre shiftet üres cellára
  if (!target.shift?.id) {
    // nincs bejegyzés -> nincs mit perzisztálni
    continue;
  }
  updatePayload = { isHighlighted: !!payload?.value };
  await updateDoc(doc(db, 'shifts', target.shift.id), { ...updatePayload, unitId: activeUnitIds[0] });
  applied += 1;
  continue;
}
          await updateDoc(
  doc(db, 'shifts', shift.id),
  {
    ...updatePayload,
    unitId
  }
);
          applied += 1;
        } catch (err) {
          console.warn('Bulk update failed', err);
          if ((err as any)?.code === 'permission-denied') permDenied += 1;
          errors += 1;
        }
      }

      if (skippedPerm > 0 || errors > 0 || applied === 0) {
        alert(
          `Művelet kész. Sikeres: ${applied}. Kihagyva jogosultság hiányában: ${skippedPerm}. Hibás/tiltott: ${errors}. Permission denied: ${permDenied}.`
        );
      }
      setBulkConfirm(null);
    },
    [ensureShiftForTarget, getCellTargets]
  );

  const launchBulkWithConfirmation = useCallback(
    (
      action: 'dayOff' | 'setStart' | 'setEnd' | 'deleteNote' | 'highlight',
      payload?: any
    ) => {
      const targets = getCellTargets();
      if (!targets.length) return;
      const counts = {
        total: targets.length,
        editable: targets.filter(t => t.canEdit).length,
        hasContent: targets.filter(
          t => {
            if (!t.shift) return false;
            const dayStart = new Date(t.date);
            dayStart.setHours(0, 0, 0, 0);
            const startDate = t.shift.start?.toDate?.();
            const hasNonPlaceholderStart =
              !!startDate && startDate.getTime() !== dayStart.getTime();

            return (
              !!t.shift.isDayOff ||
              !!t.shift.end ||
              !!(t.shift.note && t.shift.note.trim()) ||
              !!t.shift.isHighlighted ||
              hasNonPlaceholderStart
            );
          }
        ).length
      };

      const requiresConfirmation =
        action === 'dayOff' ||
        action === 'setStart' ||
        action === 'setEnd' ||
        action === 'deleteNote';

      if (requiresConfirmation && counts.hasContent > 0) {
        const timeValue =
          typeof payload === 'string' ? payload : payload?.time;
        setBulkConfirm({
          action,
          time: timeValue,
          payload,
          counts
        });
        return;
      }

      executeBulk(action, payload);
    },
    [executeBulk, getCellTargets]
  );

  const resetSelectionState = useCallback(() => {
    selectionArmedRef.current = false;
    armedCellKeyRef.current = null;
    modalOpenTokenRef.current = null;
    setSelectedCellKeys(new Set());
    setSelectionOverlays([]);
    cellRefs.current = {};
  }, []);

  // Selection overlay checklist:
  // [ ] tap toggles selection, no modal
  // [ ] plus opens modal
  // [ ] multiple selection works
  // [ ] adjacent selections merge H+V
  // [ ] overlay stays aligned during scroll/resize
  // [ ] overlay uses theme main color tint

  const handlePrevWeek = () => {
    resetSelectionState();
    setCurrentDate(d => {
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    resetSelectionState();
    setCurrentDate(d => {
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };

  const handlePublishWeek = () => {
    const weekStart = weekDays[0];
    const weekEnd = new Date(weekDays[6]);
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

    const weekStart = weekDays[0];
    const weekEnd = new Date(weekDays[6]);
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
      const weekLabel = `${weekDays[0].toLocaleDateString('hu-HU', {
        month: 'short',
        day: 'numeric'
      })} - ${weekDays[6].toLocaleDateString('hu-HU', {
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

  const issueModalOpenToken = useCallback(() => {
    const token = `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    modalOpenTokenRef.current = token;
    return token;
  }, []);

  const handleOpenShiftModal = useCallback(
    (params: {
      shift: Shift | null;
      userId: string;
      date: Date;
      expectedToken: string;
      allowTouchModal?: boolean;
      cellKey?: string;
    }) => {
      const {
        shift,
        userId,
        date,
        expectedToken,
        allowTouchModal = false,
        cellKey
      } = params;

      if (!expectedToken) return;
      if (modalOpenTokenRef.current !== expectedToken) return;
      if (clickGuardUntil && Date.now() < clickGuardUntil) {
        return;
      }
      if (isTouchLike && !allowTouchModal) return;

      if (cellKey) {
        const now = Date.now();
        const lastOpen = lastOpenAttemptAtByKeyRef.current[cellKey] || 0;
        if (now - lastOpen < 900) return;
        lastOpenAttemptAtByKeyRef.current[cellKey] = now;
      }

      modalOpenTokenRef.current = null;
      selectionArmedRef.current = false;
      armedCellKeyRef.current = null;
      setSelectedCellKeys(new Set());
      setEditingShift({ shift, userId, date });
      setIsShiftModalOpen(true);
    },
    [clickGuardUntil, isTouchLike, setSelectedCellKeys]
  );

  const handleCellTap = useCallback(
    (params: {
      intent: 'cell' | 'plus';
      shift: Shift | null;
      userId: string;
      date: Date;
    }) => {
      const { intent, shift, userId, date } = params;
      const cellKey = `${userId}-${toDateString(date)}`;

      if (intent === 'plus') {
  if (selectedCellKeys.size > 0) return;

  const token = issueModalOpenToken();
  handleOpenShiftModal({
    shift,
    userId,
    date,
    expectedToken: token,
    allowTouchModal: true,
    cellKey
  });
  return;
}

      if (intent === 'cell' && selectedCellKeys.has(cellKey)) {
        toggleCellSelection(cellKey);
        selectionArmedRef.current = false;
        armedCellKeyRef.current = null;
        return;
      }

      if (
        selectionArmedRef.current &&
        armedCellKeyRef.current === cellKey
      ) {
        const token = issueModalOpenToken();
        handleOpenShiftModal({
          shift,
          userId,
          date,
          expectedToken: token,
          allowTouchModal: false,
          cellKey
        });
        return;
      }

      toggleCellSelection(cellKey);

      selectionArmedRef.current = true;
      armedCellKeyRef.current = cellKey;

      if (isTouchLike) {
        return;
      }
    },
    [handleOpenShiftModal, isTouchLike, issueModalOpenToken, toggleCellSelection, selectedCellKeys]
  );

  const recomputeSelectionOverlays = useCallback(() => {
    const wrap = scrollWrapRef.current;
    if (!wrap) return;
    if (!renderedUserOrder.length || selectedCellKeys.size === 0) {
      setSelectionOverlays([]);
      return;
    }

    const activeRects = new Map<
      string,
      { startCol: number; endCol: number; startRow: number; endRow: number }
    >();
    const finalized: {
      startCol: number;
      endCol: number;
      startRow: number;
      endRow: number;
    }[] = [];

    renderedUserOrder.forEach((user, rowIndex) => {
      const rowRuns: { start: number; end: number }[] = [];
      let inRun = false;
      let runStart = 0;
      weekDayKeys.forEach((dayKey, colIndex) => {
        const key = `${user.id}-${dayKey}`;
        const isSel = selectedCellKeys.has(key);

        if (isSel && !inRun) {
          inRun = true;
          runStart = colIndex;
        }

        const atRowEnd = colIndex === weekDayKeys.length - 1;
        if ((!isSel && inRun) || (inRun && atRowEnd)) {
          const endCol = (!isSel && !atRowEnd) ? colIndex - 1 : colIndex;
          rowRuns.push({ start: runStart, end: endCol });
          inRun = false;
        }
      });

      const nextActive = new Map<
        string,
        { startCol: number; endCol: number; startRow: number; endRow: number }
      >();
      rowRuns.forEach(run => {
        const key = `${run.start}-${run.end}`;
        const existing = activeRects.get(key);
        if (existing && existing.endRow === rowIndex - 1) {
          nextActive.set(key, {
            ...existing,
            endRow: rowIndex
          });
        } else {
          nextActive.set(key, {
            startCol: run.start,
            endCol: run.end,
            startRow: rowIndex,
            endRow: rowIndex
          });
        }
      });

      activeRects.forEach((rect, key) => {
        if (!nextActive.has(key)) finalized.push(rect);
      });
      activeRects.clear();
      nextActive.forEach((rect, key) => activeRects.set(key, rect));
    });

    activeRects.forEach(rect => finalized.push(rect));

    const wrapRect = wrap.getBoundingClientRect();
    const inset = 2;
    const firstUser = renderedUserOrder[0];
    const firstDayKey = weekDayKeys[0];
    const firstDayCell = firstUser
      ? cellRefs.current[`${firstUser.id}-${firstDayKey}`]
      : null;
    const minLeft = firstDayCell
      ? firstDayCell.getBoundingClientRect().left - wrapRect.left + inset
      : 0;

    const overlays = finalized
      .map(rect => {
        const topLeftKey = `${renderedUserOrder[rect.startRow].id}-${weekDayKeys[rect.startCol]}`;
        const bottomRightKey = `${renderedUserOrder[rect.endRow].id}-${weekDayKeys[rect.endCol]}`;
        const topEl = cellRefs.current[topLeftKey];
        const bottomEl = cellRefs.current[bottomRightKey];
        if (!topEl || !bottomEl) return null;

        const topRect = topEl.getBoundingClientRect();
        const bottomRect = bottomEl.getBoundingClientRect();

        let left = topRect.left - wrapRect.left + inset;
        const top = topRect.top - wrapRect.top + inset;
        const right = bottomRect.right - wrapRect.left - inset;
        const bottom = bottomRect.bottom - wrapRect.top - inset;

        if (minLeft && left < minLeft) {
          left = minLeft;
        }
        const width = Math.max(0, right - left);

        return {
          id: `${rect.startRow}-${rect.endRow}-${rect.startCol}-${rect.endCol}`,
          left,
          top,
          width,
          height: Math.max(0, bottom - top)
        };
      })
      .filter((o): o is { id: string; left: number; top: number; width: number; height: number } => !!o);

    setSelectionOverlays(overlays);
  }, [renderedUserOrder, selectedCellKeys, weekDayKeys]);

  useLayoutEffect(() => {
    recomputeSelectionOverlays();
  }, [recomputeSelectionOverlays]);

  useEffect(() => {
    const handle = () => {
      if (overlayRafRef.current !== null) return;
      overlayRafRef.current = requestAnimationFrame(() => {
        overlayRafRef.current = null;
        recomputeSelectionOverlays();
      });
    };
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, { passive: true });
    const wrap = scrollWrapRef.current;
    wrap?.addEventListener('scroll', handle, { passive: true } as any);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle as any);
      wrap?.removeEventListener('scroll', handle as any);
      if (overlayRafRef.current !== null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
    };
  }, [recomputeSelectionOverlays]);

  useEffect(() => {
    if (!isShiftModalOpen) {
      resetSelectionState();
    }
  }, [isShiftModalOpen, resetSelectionState]);

  const handleBulkDayOff = useCallback(() => {
    launchBulkWithConfirmation('dayOff');
  }, [launchBulkWithConfirmation]);

  const handleBulkDeleteNote = useCallback(() => {
    launchBulkWithConfirmation('deleteNote');
  }, [launchBulkWithConfirmation]);

  const handleBulkHighlight = useCallback(
    (value: boolean) => {
      launchBulkWithConfirmation('highlight', { value });
    },
    [launchBulkWithConfirmation]
  );

  const handleBulkSetTime = useCallback(
    (type: 'start' | 'end', value: string) => {
      launchBulkWithConfirmation(type === 'start' ? 'setStart' : 'setEnd', {
        time: value
      });
    },
    [launchBulkWithConfirmation]
  );

  const handleBulkClearSelection = () => setSelectedCellKeys(new Set());

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
            weekStartDateStr
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
    [canManage, activeUnitIds, weekStartDateStr]
  );

  // --- UPDATED PNG EXPORT FUNCTION (better alignment for text in cells) ---
  const handlePngExport = (hideEmptyUsers: boolean): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!tableRef.current) {
      reject(new Error('Table ref not found'));
      return;
    }

    setIsPngExporting(true);

    // Offscreen konténer – csak háttér + padding
    const exportContainer = document.createElement('div');
    Object.assign(exportContainer.style, {
      position: 'absolute',
      left: '-9999px',
      top: '0',
      backgroundColor: '#ffffff',
      padding: '20px',
      display: 'inline-block',
      overflow: 'hidden'
    } as CSSStyleDeclaration);

    // Teljes tábla klónozása – minden Tailwind osztály megmarad
    const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
    exportContainer.appendChild(tableClone);
    document.body.appendChild(exportContainer);

    // 1) UI-only elemek eltávolítása (gombok, plusz overlay, óraszám stb.)
    tableClone.querySelectorAll('.export-hide').forEach(el => el.remove());

    tableClone.querySelectorAll<HTMLElement>('.handwritten-note').forEach(el => {
      el.style.whiteSpace = 'pre-wrap';
      el.style.maxWidth = 'none';
      el.style.overflow = 'visible';
      el.style.textOverflow = 'unset';
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
      });

    // 2) Üres dolgozók kiszedése exportból (ha be van pipálva)
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

    // 3) Sticky oszlopok kikapcsolása (hogy ne keverje meg a canvas-t)
    tableClone.querySelectorAll<HTMLElement>('.sticky').forEach(el => {
      el.classList.remove('sticky', 'left-0', 'z-10', 'z-[2]', 'z-[3]', 'z-[5]');
      el.style.position = '';
      el.style.left = '';
      el.style.zIndex = '';
    });

    // 4) X / SZ / SZABI szöveg elrejtése – a háttérszín marad
    tableClone.querySelectorAll<HTMLTableCellElement>('td').forEach(td => {
      const txt = (td.textContent || '').trim().toUpperCase();
      if (txt === 'X' || txt === 'SZ' || txt === 'SZABI') {
        td.textContent = '';
      }
    });

    // 5) Összesítő sor (Napi összes) kiszedése
    tableClone.querySelectorAll('tr.summary-row').forEach(row => row.remove());

    // 6) Zebra csíkozás alkalmazása az exportált táblára
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

    // NINCS padding / font-size / text-align átírás → ugyanaz, mint az UI

    html2canvas(exportContainer, {
      useCORS: true,
      scale: 2,
      backgroundColor: '#ffffff'
    })
      .then(canvas => {
        const link = document.createElement('a');
        const weekStart = weekDays[0]
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
      })
      .catch(err => {
        console.error('PNG export failed:', err);
        alert('Hiba történt a PNG exportálás során.');
        reject(err);
      })
      .finally(() => {
        document.body.removeChild(exportContainer);
        setIsPngExporting(false);
      });
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
        }
        .ml-selection-glass {
          position: absolute;
          border-radius: 10px;
          background: color-mix(in srgb, var(--color-primary) 12%, transparent);
          backdrop-filter: blur(2px) saturate(1.02);
          -webkit-backdrop-filter: blur(2px) saturate(1.02);
          box-shadow:
            0 2px 8px rgba(0,0,0,0.05),
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset 0 -1px 0 rgba(0,0,0,0.05);
          pointer-events: none;
        }
        .ml-selection-glass::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(
            135deg,
            rgba(255,255,255,0.08),
            rgba(255,255,255,0.00) 65%
          );
          opacity: 0.15;
          pointer-events: none;
        }`}
      </style>

      {selectedCellKeys.size > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-[min(92vw,720px)] w-full sm:w-auto">
          <div
            className="shadow-lg rounded-full px-4 py-2 flex flex-wrap items-center gap-2 justify-center"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 12%, white)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)'
            }}
          >
            <span className="text-sm font-semibold text-slate-700">
              Kijelölt: {selectedCellKeys.size}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                onClick={handleBulkDayOff}
              >
                Szabadnap
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                onClick={() => setBulkTimeModal({ type: 'start', value: '' })}
              >
                Kezdés beállítása
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                onClick={() => setBulkTimeModal({ type: 'end', value: '' })}
              >
                Befejezés beállítása
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200"
                onClick={handleBulkDeleteNote}
              >
                Bejegyzés törlése
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-200"
                onClick={() => handleBulkHighlight(true)}
              >
                Kiemelés
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200"
                onClick={() => handleBulkHighlight(false)}
              >
                Kiemelés törlése
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1 rounded-full bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                onClick={handleBulkClearSelection}
              >
                Kijelölés törlése
              </button>
            </div>
          </div>
        </div>
      )}

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

      {isPublishModalOpen && (
        <PublishWeekModal
          units={unitsWithDrafts}
          onClose={() => setIsPublishModalOpen(false)}
          onConfirm={handleConfirmPublish}
        />
      )}

      {successToast && (
        <div className="mb-4 bg-green-100 text-green-800 px-4 py-2 rounded-lg text-sm">
          {successToast}
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevWeek}
            className="p-2 rounded-full hover:bg-gray-200"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-center">
            {weekDays[0].toLocaleDateString('hu-HU', {
              month: 'long',
              day: 'numeric'
            })}{' '}
            -{' '}
            {weekDays[6].toLocaleDateString('hu-HU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h2>
          <button
            onClick={handleNextWeek}
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
                        {weekDays[i].toLocaleDateString('hu-HU', {
                          weekday: 'long'
                        })}
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
            className="text-sm px-3 py-1 rounded-full border transition-colors"
            style={{
              backgroundColor: 'var(--color-surface-static)',
              color: 'var(--color-text-main)',
              borderColor: 'var(--color-border)',
            }}
          >
            {isEditMode
              ? 'Sorrend szerkesztése: BE'
              : 'Sorrend szerkesztése: KI'}
          </button>
          <span className="text-xs text-gray-500">
            Edit módban: a nyilakkal mozgathatod a dolgozókat / pozíció
            blokkokat, a szem ikonnal elrejtheted őket a táblázatból.
          </span>
        </div>
      )}

      <div
        className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm relative"
        ref={scrollWrapRef}
        style={{
          backgroundColor: 'var(--color-surface-static)',
          color: 'var(--color-text-main)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {selectionOverlays.map(overlay => (
            <div
              key={overlay.id}
              className="ml-selection-glass"
              style={{
                left: overlay.left,
                top: overlay.top,
                width: overlay.width,
                height: overlay.height
              }}
            />
          ))}
        </div>
        <div ref={gridWrapRef} className="relative">
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
              {weekDays.map((day, idx) => (
                <th
                  key={idx}
                  className="px-3 py-3 text-center text-xs font-semibold text-slate-600"
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
              ))}
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
                      {weekDays.map((_, i) => (
                        <td
                          key={i}
                          className="px-3 py-1 text-center text-[11px] text-slate-500 border border-slate-200"
                        >
                          {weekSettings.dailySettings[i]?.openingTime || '-'}
                        </td>
                      ))}
                    </tr>
                  )}
                  {weekSettings.showClosingTime && (
                    <tr>
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1 text-left text-[11px] font-semibold text-slate-500 border border-slate-200">
                        Zárás
                      </td>
                      {weekDays.map((_, i) => (
                        <td
                          key={i}
                          className="px-3 py-1 text-center text-[11px] text-slate-500 border border-slate-200"
                        >
                          {weekSettings.dailySettings[i]?.closingTime || '-'}
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
                      colSpan={1 + weekDays.length}
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

                    const isAltRow = zebraRowIndex % 2 === 1;
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
                                {isMultiUnitView && userUnit && (
                                  <UnitLogoBadge unit={userUnit} size={18} />
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
                        {weekDays.map((day, dayIndex) => {
                          const cellKey = `${user.id}-${toDateString(day)}`;
                          const isSelected = selectedCellKeys.has(cellKey);
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
                          const hasHighlight =
                            !isLeave &&
                            userDayShifts.some(s => s.isHighlighted && !s.isDayOff);
                          const shiftNote =
                            userDayShifts.find(
                              s => s.note && !s.isDayOff
                            )?.note || '';

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
                          const hasContent = displayParts.length > 0;
                          const hasNote = !!shiftNote;

                          let cellClasses =
                            'whitespace-pre-wrap align-middle text-center border border-slate-200 text-[13px] cursor-pointer transition-colors';
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
                          let cellStyle: React.CSSProperties | undefined;
                          if (!isDayOff && !isLeave) {
                            if (hasHighlight) {
                              cellStyle = {
                                background: '#fff7ed',
                                color: '#9a3412'
                              };
                            } else {
                              cellStyle = isSelected
                                ? { color: rowTextColor }
                                : { background: rowBg, color: rowTextColor };
                            }
                          }

                          return (
                            <td
                              key={dayIndex}
                              className={cellClasses}
                              ref={el => {
                                cellRefs.current[cellKey] = el;
                              }}
                              style={cellStyle}
                              onClick={() => {
                                if (!canEditCell) return;
                                handleCellTap({
                                  intent: 'cell',
                                  shift: userDayShifts[0] || null,
                                  userId: user.id,
                                  date: day
                                });
                            }}
                            >
                              <div className="relative flex flex-col items-center justify-center px-1 py-2 min-h-[40px] gap-1">
                                {hasContent && (
                                  <span className="whitespace-pre-wrap leading-tight">
                                    {displayParts.join('\n')}
                                  </span>
                                )}
                                {hasNote && (
                                  <span className="handwritten-note tracking-tighter">
                                    {`"${shiftNote}"`}
                                  </span>
                                )}
                                {!hasContent && canEditCell && (
                                  <button
                                    type="button"
                                    className="export-hide select-none text-slate-200 text-lg font-light"
                                    onClick={e => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (selectedCellKeys.size > 0) {
                                        return;
                                      }
                                      handleCellTap({
                                        intent: 'plus',
                                        shift: userDayShifts[0] || null,
                                        userId: user.id,
                                        date: day
                                      });
                                    }}
                                  >
                                    +
                                  </button>
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
              {weekDays.map((_, i) => (
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
                    weekDays,
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

      {bulkConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-800">
                Biztosan folytatod?
              </h3>
              <p className="text-sm text-slate-600">
                {bulkConfirm.counts.hasContent} kijelölt cellában már van
                meglévő tartalom. A(z){' '}
                <span className="font-semibold">
                  {bulkConfirm.action === 'dayOff'
                    ? 'Szabadnap'
                    : bulkConfirm.action === 'setStart'
                      ? 'Kezdés beállítása'
                      : bulkConfirm.action === 'setEnd'
                        ? 'Befejezés beállítása'
                        : 'Bejegyzés törlése'}
                </span>{' '}
                művelet felülírhatja vagy törölheti ezeket.
              </p>
              {bulkConfirm.time && (
                <p className="text-sm text-slate-600">
                  Időpont: <span className="font-semibold">{bulkConfirm.time}</span>
                </p>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <div>Kijelölve: {bulkConfirm.counts.total}</div>
                <div>Szerkeszthető: {bulkConfirm.counts.editable}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700"
                onClick={() => setBulkConfirm(null)}
              >
                Mégse
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-lg bg-red-600 text-white"
                onClick={() =>
                  executeBulk(bulkConfirm.action, bulkConfirm.payload)
                }
              >
                Alkalmaz
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkTimeModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-sm space-y-3">
            <h3 className="text-lg font-semibold text-slate-800">
              {bulkTimeModal.type === 'start'
                ? 'Kezdés beállítása'
                : 'Befejezés beállítása'}
            </h3>
            <input
              type="time"
              value={bulkTimeModal.value}
              onChange={e =>
                setBulkTimeModal(prev =>
                  prev ? { ...prev, value: e.target.value } : prev
                )
              }
              className="w-full p-2 border rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700"
                onClick={() => setBulkTimeModal(null)}
              >
                Mégse
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-lg bg-green-600 text-white"
                onClick={() => {
                  if (!bulkTimeModal.value) return;
                  handleBulkSetTime(bulkTimeModal.type, bulkTimeModal.value);
                  setBulkTimeModal(null);
                }}
              >
                Alkalmaz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Siker üzenet eltüntetése pár másodperc után */}
      {successToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-full bg-slate-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {successToast}
        </div>
      )}
    </div>
  );
};
