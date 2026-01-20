import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  FC,
  useRef,
  CSSProperties
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
  where,
  writeBatch,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
  query,
  getDoc,
  DocumentData,
  Query,
  QueryDocumentSnapshot
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
import GlassOverlay from '../common/GlassOverlay';

const LAYERS = {
  modal: 90,
  // Dashboard: dim=20, sidebar=30 -> app elemek 20 alatt!
  toast: 19,
  toolbar: 18,
  tableHeader: 17,
  tableSection: 16,
  tableCell: 15,
} as const;

const DEFAULT_CLOSING_TIME = '22:00';
const DEFAULT_CLOSING_OFFSET_MINUTES = 0;
const SUCCESS_TOAST_DURATION_MS = 3200;
const SUCCESS_TOAST_EXIT_MS = 240;

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

  const startDate = shift.start.toDate();
  let end = shift.end?.toDate();
  const referenceDate = options?.referenceDate || startDate;

  if (!end && referenceDate) {
    const closingTime = options?.closingTime ?? DEFAULT_CLOSING_TIME;
    const closingOffsetMinutes =
      options?.closingOffsetMinutes ?? DEFAULT_CLOSING_OFFSET_MINUTES;

    const [hours, minutes] = closingTime.split(':').map(Number);
    end = new Date(referenceDate);
    end.setHours(hours, minutes + closingOffsetMinutes, 0, 0);

    if (end < startDate) {
      end.setDate(end.getDate() + 1);
    }
  }

  if (!end) return 0;

  const durationMs = end.getTime() - startDate.getTime();
  return durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
};

type SelectionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SelectionOverlay = SelectionRect & { id: string };

type SelectionCell = {
  key: string;
  row: number;
  col: number;
  rect: SelectionRect;
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

interface BulkTimeModalState {
  type: 'start' | 'end';
  value: string;
}

interface BulkTimeModalProps {
  state: BulkTimeModalState | null;
  onClose: () => void;
  onApply: (type: 'start' | 'end', value: string) => void;
}

const BulkTimeModal: FC<BulkTimeModalProps> = ({ state, onClose, onApply }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (state?.value !== undefined) {
      setValue(state.value);
    }
  }, [state]);

  if (!state) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      style={{ zIndex: LAYERS.modal }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-gray-800">
          {state.type === 'start' ? 'Kezdő idő beállítása' : 'Vég idő beállítása'}
        </h3>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Időpont (HH:MM)
          </label>
          <input
            type="time"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex justify-end gap-2 text-sm">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 transition-colors hover:bg-gray-100"
          >
            Mégse
          </button>
          <button
            onClick={() => onApply(state.type, value)}
            className="rounded-lg px-3 py-1.5 text-white shadow-sm"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Alkalmaz
          </button>
        </div>
      </div>
    </div>
  );
};

interface HiddenUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  hiddenUsers: User[];
  onUnhide: (userId: string) => void;
  layer?: number;
}

const HiddenUsersModal: FC<HiddenUsersModalProps> = ({
  isOpen,
  onClose,
  hiddenUsers,
  onUnhide,
  layer = LAYERS.modal
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      style={{ zIndex: layer }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-800">
            Elrejtett munkatársak
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Bezárás"
          >
            ×
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-2">
          {hiddenUsers.length === 0 ? (
            <p className="text-sm text-slate-600">Nincs elrejtett munkatárs.</p>
          ) : (
            hiddenUsers.map(user => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                <span>{user.fullName}</span>
                <button
                  onClick={() => onUnhide(user.id)}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Visszaállítás
                </button>
              </div>
            ))
          )}
        </div>
        <div className="border-t px-4 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Bezár
          </button>
        </div>
      </div>
    </div>
  );
};


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
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (shift) {
      setIsDayOff(!!shift.isDayOff);
      setIsHighlighted(!!shift.isHighlighted);
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
      setIsHighlighted(false);
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
        isHighlighted
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
        isHighlighted
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: LAYERS.modal }}
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isHighlighted"
                checked={isHighlighted}
                onChange={e => setIsHighlighted(e.target.checked)}
                className="h-5 w-5 rounded text-orange-500 focus:ring-orange-500"
                disabled={!(canManage || isOwnShift)}
              />
              <label htmlFor="isHighlighted" className="font-medium text-gray-700">
                Kiemelés
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: LAYERS.modal }}
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
  isSidebarOpen?: boolean;
  onWeekRangeChange?: (range: { start: Date; end: Date }) => void;
  topOffsetPx?: number;
}

const startOfWeekMonday = (date: Date): Date => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getWeekDaysFrom = (start: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => {
    const newDay = new Date(start);
    newDay.setDate(start.getDate() + i);
    return newDay;
  });

const getMonthWeekBlocks = (date: Date): Date[] => {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const firstMonday = startOfWeekMonday(monthStart);
  const lastMonday = startOfWeekMonday(monthEnd);

  const blocks: Date[] = [];
  let cursor = new Date(firstMonday);
  while (cursor <= lastMonday) {
    blocks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  return blocks;
};

const getWeekDays = (date: Date): Date[] => {
  const startOfWeek = startOfWeekMonday(date);
  return getWeekDaysFrom(startOfWeek);
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
    closingTime: DEFAULT_CLOSING_TIME,
    closingOffsetMinutes: DEFAULT_CLOSING_OFFSET_MINUTES,
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
  onExportingChange: (isExporting: boolean) => void;
  exportSettings: ExportStyleSettings;
  unitName: string;
  hideEmptyUsersOnExport: boolean;
  onToggleHideEmptyUsers: (value: boolean) => void;
  pngScale: 1 | 2 | 3;
  onScaleChange: (value: 1 | 2 | 3) => void;
}

const ExportConfirmationModal: FC<ExportConfirmationModalProps> = ({
  type,
  onClose,
  onConfirm,
  onExportingChange,
  exportSettings,
  unitName,
  hideEmptyUsersOnExport,
  onToggleHideEmptyUsers,
  pngScale,
  onScaleChange
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleConfirmClick = async () => {
    setIsExporting(true);
    onExportingChange(true);
    try {
      await onConfirm();
    } catch (err) {
      setIsExporting(false);
      onExportingChange(false);
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: LAYERS.modal }}
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
              <div className="mt-1 space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    Felbontás
                  </label>
                  <select
                    value={pngScale}
                    onChange={e =>
                      onScaleChange(Number(e.target.value) as 1 | 2 | 3)
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value={1}>1x</option>
                    <option value={2}>2x – ajánlott</option>
                    <option value={3}>3x</option>
                  </select>
                </div>
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
                    beosztásuk a megjelenített időszakban.
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
  activeUnitIds,
  isSidebarOpen = false,
  onWeekRangeChange,
  topOffsetPx = 0,
}) => {
  const isDevEnv =
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV !== 'production';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'draft' | 'published'>(
    'published'
  );
  const [allAppUsers, setAllAppUsers] = useState<User[]>([]);
  const [staffWarning, setStaffWarning] = useState<string | null>(null);
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
  const [isHiddenModalOpen, setIsHiddenModalOpen] = useState(false);

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [unitsWithDrafts, setUnitsWithDrafts] = useState<
    { unitId: string; unitName: string; draftCount: number }[]
  >([]);

  const [isPngExporting, setIsPngExporting] = useState(false);
  const [orderedUsers, setOrderedUsers] = useState<User[]>([]);
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(
    new Set()
  );
  const exportRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(new Set());
  const [anchorCellKey, setAnchorCellKey] = useState<string | null>(null);
  const [selectionOverlays, setSelectionOverlays] = useState<SelectionOverlay[]>([]);
  const cellRefs = useRef<Map<string, HTMLTableCellElement | null>>(new Map());
  const cellMetaRef = useRef<Map<string, { row: number; col: number }>>(new Map());
  const cellCoordIndexRef = useRef<Map<string, string>>(new Map());
  const selectionRafId = useRef<number | null>(null);
  const [bulkTimeModal, setBulkTimeModal] = useState<
    { type: 'start' | 'end'; value: string } | null
  >(null);

  const [isEditMode, setIsEditMode] = useState(false);
  const [viewSpan, setViewSpan] = useState<1 | 2 | 3 | 4 | 'month'>(1);

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    allAppUsers.forEach(user => map.set(user.id, user));
    return map;
  }, [allAppUsers]);

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
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [isToastExiting, setIsToastExiting] = useState(false);
  const successToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const successToastExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [hideEmptyUsersOnExport, setHideEmptyUsersOnExport] =
    useState(false);
  const [pngExportScale, setPngExportScale] = useState<1 | 2 | 3>(2);
  const [isPngExportConfirming, setIsPngExportConfirming] = useState(false);
  const [isPngExportRenderMode, setIsPngExportRenderMode] =
    useState(false);
  const [pngHideEmptyUsers, setPngHideEmptyUsers] = useState(false);

  const [clickGuardUntil, setClickGuardUntil] = useState<number>(0);
  const isMultiUnitView = activeUnitIds.length > 1;
  const getUserUnitIds = useCallback(
    (user: { unitIds?: string[]; unitIDs?: string[]; unitId?: string }) => {
      if (Array.isArray(user.unitIds) && user.unitIds.length > 0) {
        return user.unitIds;
      }
      if (Array.isArray(user.unitIDs) && user.unitIDs.length > 0) {
        return user.unitIDs;
      }
      if (typeof user.unitId === 'string' && user.unitId) {
        return [user.unitId];
      }
      return [];
    },
    []
  );
  const currentUserUnitIds = useMemo(
    () => getUserUnitIds(currentUser),
    [currentUser, getUserUnitIds]
  );
  const isAdminUser = currentUser.role === 'Admin';

  const clearToastTimers = useCallback(() => {
    if (successToastTimeoutRef.current) {
      clearTimeout(successToastTimeoutRef.current);
      successToastTimeoutRef.current = null;
    }
    if (successToastExitTimeoutRef.current) {
      clearTimeout(successToastExitTimeoutRef.current);
      successToastExitTimeoutRef.current = null;
    }
  }, []);

  const triggerToastExit = useCallback(() => {
    clearToastTimers();
    setIsToastExiting(true);
    if (successToastExitTimeoutRef.current) {
      clearTimeout(successToastExitTimeoutRef.current);
    }
    successToastExitTimeoutRef.current = setTimeout(() => {
      setIsToastVisible(false);
      setIsToastExiting(false);
      setSuccessToast('');
    }, SUCCESS_TOAST_EXIT_MS);
  }, [clearToastTimers]);

  const handleDismissToast = useCallback(() => {
    clearToastTimers();
    triggerToastExit();
  }, [clearToastTimers, triggerToastExit]);

  useEffect(() => {
    if (!successToast) {
      clearToastTimers();
      setIsToastVisible(false);
      setIsToastExiting(false);
      return () => clearToastTimers();
    }

    clearToastTimers();
    setIsToastVisible(true);
    setIsToastExiting(false);

    successToastTimeoutRef.current = setTimeout(
      triggerToastExit,
      SUCCESS_TOAST_DURATION_MS
    );

    return () => clearToastTimers();
  }, [clearToastTimers, successToast, triggerToastExit]);

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
    return activeUnitIds.slice().sort().join('_');
  }, [activeUnitIds]);

  const clearSelection = useCallback(() => {
    setSelectedCellKeys(new Set());
    setAnchorCellKey(null);
  }, []);

  const toggleCellSelection = useCallback((cellKey: string) => {
    setSelectedCellKeys(prev => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
    setAnchorCellKey(cellKey);
  }, []);

  const recomputeSelectionOverlays = useCallback(() => {
    if (!isSelectionMode || selectedCellKeys.size === 0) {
      setSelectionOverlays([]);
      return;
    }

    const wrapper = tableWrapperRef.current;
    if (!wrapper) {
      setSelectionOverlays([]);
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const selectedCells: SelectionCell[] = [];

    selectedCellKeys.forEach(key => {
      const cell = cellRefs.current.get(key);
      const meta = cellMetaRef.current.get(key);
      if (!cell || !meta) return;

      const { top, left, width, height } = cell.getBoundingClientRect();
      selectedCells.push({
        key,
        row: meta.row,
        col: meta.col,
        rect: {
          top: top - wrapperRect.top + wrapper.scrollTop,
          left: left - wrapperRect.left + wrapper.scrollLeft,
          width,
          height,
        },
      });
    });

    if (selectedCells.length === 0) {
      setSelectionOverlays([]);
      return;
    }

    const positionMap = new Map<string, SelectionCell>();
    selectedCells.forEach(cell => {
      positionMap.set(`${cell.row}:${cell.col}`, cell);
    });

    const visited = new Set<string>();
    const components: SelectionCell[][] = [];

    selectedCells.forEach(cell => {
      const posKey = `${cell.row}:${cell.col}`;
      if (visited.has(posKey)) return;

      const queue: SelectionCell[] = [cell];
      visited.add(posKey);
      const component: SelectionCell[] = [];

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        const neighbors: Array<[number, number]> = [
          [current.row - 1, current.col],
          [current.row + 1, current.col],
          [current.row, current.col - 1],
          [current.row, current.col + 1],
        ];

        neighbors.forEach(([row, col]) => {
          const neighborKey = `${row}:${col}`;
          if (visited.has(neighborKey)) return;
          const neighbor = positionMap.get(neighborKey);
          if (neighbor) {
            visited.add(neighborKey);
            queue.push(neighbor);
          }
        });
      }

      components.push(component);
    });

    const overlays: SelectionOverlay[] = [];

    components.forEach((component, compIdx) => {
      const rows = new Map<number, SelectionCell[]>();

      component.forEach(cell => {
        const list = rows.get(cell.row) || [];
        list.push(cell);
        rows.set(cell.row, list);
      });

      Array.from(rows.entries())
        .sort(([a], [b]) => a - b)
        .forEach(([rowIndex, cells]) => {
          cells.sort((a, b) => a.col - b.col);

          let segment: SelectionCell[] = [];
          let segmentIndex = 0;

          const flushSegment = () => {
            if (segment.length === 0) return;

            const minLeft = Math.min(...segment.map(c => c.rect.left));
            const minTop = Math.min(...segment.map(c => c.rect.top));
            const maxRight = Math.max(
              ...segment.map(c => c.rect.left + c.rect.width)
            );
            const maxBottom = Math.max(
              ...segment.map(c => c.rect.top + c.rect.height)
            );

            overlays.push({
              id: `${compIdx}-${rowIndex}-${segmentIndex}`,
              left: minLeft,
              top: minTop,
              width: maxRight - minLeft,
              height: maxBottom - minTop,
            });

            segmentIndex += 1;
            segment = [];
          };

          cells.forEach(cell => {
            if (segment.length === 0) {
              segment.push(cell);
              return;
            }

            const prev = segment[segment.length - 1];
            if (cell.col === prev.col + 1) {
              segment.push(cell);
            } else {
              flushSegment();
              segment.push(cell);
            }
          });

          flushSegment();
        });
    });

    setSelectionOverlays(overlays);
  }, [isSelectionMode, selectedCellKeys]);

  // Összefoglaló: a korábbi bounding box merge "áthidalta" a kijelöletlen cellákat.
  // Grid-alapú komponens szétválasztással és soronkénti szegmens overlay-ekkel csak a ténylegesen kijelölt cellák fölé rajzolunk.

  const scheduleOverlayRecalc = useCallback(() => {
    if (selectionRafId.current !== null) {
      cancelAnimationFrame(selectionRafId.current);
    }

    selectionRafId.current = requestAnimationFrame(() => {
      selectionRafId.current = null;
      recomputeSelectionOverlays();
    });
  }, [recomputeSelectionOverlays]);

  useEffect(() => {
    if (!isSelectionMode) {
      clearSelection();
      setSelectionOverlays([]);
      setBulkTimeModal(null);
      return;
    }

    scheduleOverlayRecalc();
  }, [clearSelection, isSelectionMode, scheduleOverlayRecalc]);

  useEffect(() => {
    if (!isSelectionMode) return;
    scheduleOverlayRecalc();
  }, [selectedCellKeys, scheduleOverlayRecalc, isSelectionMode]);

  useEffect(() => {
    if (selectedCellKeys.size === 0) {
      setAnchorCellKey(null);
    }
  }, [selectedCellKeys]);

  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return undefined;

    const handleScroll = () => scheduleOverlayRecalc();
    const handleResize = () => scheduleOverlayRecalc();

    wrapper.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(wrapper);

    return () => {
      wrapper.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [scheduleOverlayRecalc]);

  useEffect(
    () => () => {
      if (selectionRafId.current !== null) {
        cancelAnimationFrame(selectionRafId.current);
      }
    },
    []
  );

  useEffect(() => {
    if (activeUnitIds.length === 0) {
      setAllAppUsers([]);
      setStaffWarning(null);
      setIsDataLoading(false);
      return () => undefined;
    }

    const hasUnitAccess =
      isAdminUser ||
      activeUnitIds.some(unitId => currentUserUnitIds.includes(unitId));
    if (!hasUnitAccess) {
      setAllAppUsers([]);
      setStaffWarning(
        'Nincs jogosultságod az adott egység munkatársainak megtekintéséhez.'
      );
      setIsDataLoading(false);
      return () => undefined;
    }

    setIsDataLoading(true);
    setStaffWarning(null);
    console.log('[staff]', { activeUnitIds, currentUserUnitIds });
    getDoc(doc(db, 'users', currentUser.id))
      .then(docSnap => {
        const data = docSnap.data();
        console.log('[staff] currentUser', {
          data,
          unitIdType: typeof data?.unitId,
          unitIdsIsArray: Array.isArray(data?.unitIds),
          unitIdsFirstType: Array.isArray(data?.unitIds) ? typeof data?.unitIds[0] : null,
          unitIDsIsArray: Array.isArray(data?.unitIDs)
        });
      })
      .catch(error => {
        console.warn('[staff] currentUser read error', error);
      });
    if (settingsDocId) {
      getDoc(doc(db, 'schedule_settings', settingsDocId))
        .then(docSnap => {
          const data = docSnap.data();
          console.log('[staff] schedule_settings', {
            exists: docSnap.exists(),
            unitId: data?.unitId
          });
        })
        .catch(error => {
          console.warn('[staff] schedule_settings read error', error);
        });
    }
    // Staff list must be unit-filtered; global reads are forbidden.
    const sourceMaps = new Map<string, Map<string, User>>();
    let expected = 0;
    let settled = 0;
    let allAttached = false;
    const settledKeys = new Set<string>();
    const mergeAndSetUsers = () => {
      const merged = new Map<string, User>();
      sourceMaps.forEach(map => {
        map.forEach((value, id) => merged.set(id, value));
      });
      setAllAppUsers(Array.from(merged.values()));
    };
    const toUser = (docSnap: QueryDocumentSnapshot<DocumentData>) => {
      const data = docSnap.data() as any;
      const lastName = data.lastName || '';
      const firstName = data.firstName || '';
      return {
        id: docSnap.id,
        ...data,
        fullName: data.fullName || `${lastName} ${firstName}`.trim()
      } as User;
    };
    const attachListener = (key: string, queryRef: Query<DocumentData>) => {
      const map = new Map<string, User>();
      sourceMaps.set(key, map);
      expected += 1;
      return onSnapshot(
        queryRef,
        snapshot => {
          console.log('[staff]', key, 'docs=', snapshot.size);
          map.clear();
          snapshot.docs.forEach(docSnap => {
            map.set(docSnap.id, toUser(docSnap));
          });
          mergeAndSetUsers();
          if (!settledKeys.has(key)) {
            settledKeys.add(key);
            settled += 1;
          }
          if (allAttached && settled === expected) {
            setIsDataLoading(false);
          }
        },
        error => {
          console.warn('[staff]', key, 'error=', error?.code || error);
          console.error('Failed to load staff list:', error);
          if (!settledKeys.has(key)) {
            settledKeys.add(key);
            settled += 1;
          }
          if (allAttached && settled === expected) {
            setIsDataLoading(false);
          }
        }
      );
    };

    // --- Staff list from unit_staff (safe + simple) ---
const unsubscribers: Array<() => void> = [];

activeUnitIds.forEach(unitId => {
  const q = query(collection(db, 'unit_staff', unitId, 'users'));
  unsubscribers.push(
    attachListener(`unitStaff:${unitId}`, q)
  );
});

allAttached = true;
if (expected === 0) {
  setIsDataLoading(false);
} else if (settled === expected) {
  setIsDataLoading(false);
}

    if (activeUnitIds.length <= 10) {
      const unitIdQuery = query(
        collection(db, 'users'),
        where('unitId', 'in', activeUnitIds)
      );
      unsubscribers.push(attachListener('unitId', unitIdQuery));
    }
    allAttached = true;
    if (expected === 0) {
      setIsDataLoading(false);
    }

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
      unsubscribers.forEach(unsub => unsub());
      unsubPositions();
      sourceMaps.clear();
      settledKeys.clear();
    };
  }, [activeUnitIds, currentUserUnitIds, isAdminUser, currentUser.id, settingsDocId]);

  useEffect(() => {
    if (weekSettings) {
      setUnitWeekSettings(prev => ({
        ...prev,
        [weekSettings.unitId]: weekSettings
      }));
    }
  }, [weekSettings]);

  const weekBlocks = useMemo(() => {
    if (viewSpan === 'month') {
      return getMonthWeekBlocks(currentDate);
    }

    const start = startOfWeekMonday(currentDate);
    return Array.from({ length: viewSpan }, (_, i) => {
      const weekStart = new Date(start);
      weekStart.setDate(start.getDate() + i * 7);
      return weekStart;
    });
  }, [currentDate, viewSpan]);

  const weekBlocksDays = useMemo(
    () => weekBlocks.map(start => getWeekDaysFrom(start)),
    [weekBlocks]
  );

  const visibleWeekBlocksDays = useMemo(
    () => weekBlocksDays.filter(week => week && week.length > 0),
    [weekBlocksDays]
  );

  const finalWeekBlocksDays = useMemo(
    () =>
      viewSpan === 1
        ? visibleWeekBlocksDays.slice(0, 1)
        : visibleWeekBlocksDays,
    [visibleWeekBlocksDays, viewSpan]
  );

  const weekDays = useMemo(
    () =>
      finalWeekBlocksDays[0] ||
      getWeekDaysFrom(
        startOfWeekMonday(currentDate)
      ),
    [currentDate, finalWeekBlocksDays]
  );

  useEffect(() => {
    if (!onWeekRangeChange || weekDays.length < 7) return;
    const weekStart = new Date(weekDays[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekDays[6]);
    weekEnd.setHours(23, 59, 59, 999);
    const bufferedStart = new Date(weekStart);
    bufferedStart.setDate(bufferedStart.getDate() - 2);
    const bufferedEnd = new Date(weekEnd);
    bufferedEnd.setDate(bufferedEnd.getDate() + 2);
    onWeekRangeChange({ start: bufferedStart, end: bufferedEnd });
  }, [onWeekRangeChange, weekDays]);

  const weekDayKeySet = useMemo(() => new Set(weekDays.map(toDateString)), [weekDays]);

  const weekStartDateStr = useMemo(
    () => toDateString(weekDays[0]),
    [weekDays]
  );

  useEffect(() => {
    clearSelection();
  }, [clearSelection, weekStartDateStr]);

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
              const data = snap.data() as ScheduleSettings;
              return data.unitId ? data : { ...data, unitId };
            }
            const defaults = createDefaultSettings(
              unitId,
              weekStartDateStr
            );
            if (canManage) {
              await setDoc(doc(db, 'schedule_settings', defaults.id), defaults).catch(
                error => {
                  console.error('Failed to persist default settings:', error);
                }
              );
            }
            return defaults;
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
  }, [activeUnitIds, canManage, weekDays, weekStartDateStr]);

  const filteredUsers = useMemo(() => {
    if (!activeUnitIds || activeUnitIds.length === 0) return [];
    return allAppUsers
      .filter(
        u =>
          getUserUnitIds(u).some(uid => activeUnitIds.includes(uid))
      )
      .sort((a, b) =>
        (a.position || '').localeCompare(b.position || '')
      );
  }, [allAppUsers, activeUnitIds, getUserUnitIds]);

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
          const data = docSnap.data() as ScheduleSettings;
          setWeekSettings(
            data.unitId ? data : { ...data, unitId, id: settingsId }
          );
        } else {
          const defaults = createDefaultSettings(
            unitId,
            weekStartDateStr
          );
          setWeekSettings(defaults);
          setDoc(doc(db, 'schedule_settings', defaults.id), defaults).catch(
            error => {
              console.error('Failed to persist default settings:', error);
            }
          );
        }
      }
    );
    return () => unsub();
  }, [activeUnitIds, weekDays, canManage]);

  const activeShifts = useMemo(() => {
    const filtered = schedule.filter(s => {
      const statusMatch = (s.status || 'draft') === viewMode;
      const unitMatch = !s.unitId || activeUnitIds.includes(s.unitId);
      const hasContent =
        !!s.start ||
        !!s.isDayOff ||
        (s.note ?? '') !== '' ||
        s.isHighlighted === true;
      return statusMatch && unitMatch && hasContent;
    });

    if (isDevEnv && filtered.length) {
      const highlightOnly = filtered.filter(
        shift =>
          !shift.start &&
          !shift.end &&
          !shift.isDayOff &&
          (shift.note ?? '') === '' &&
          !!shift.dayKey
      );
      if (highlightOnly.length > 0) {
        console.debug('activeShifts include highlight-only entries', {
          total: filtered.length,
          highlightOnlyCount: highlightOnly.length,
          sample: highlightOnly.slice(0, 10).map(shift => shift.id),
        });
      }
    }

    return filtered;
  }, [activeUnitIds, isDevEnv, schedule, viewMode]);

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
      const userShifts = map.get(shift.userId);
      let dayKey: string | undefined;
      if (shift.start) {
        dayKey = toDateString(shift.start.toDate());
      } else if (shift.dayKey) {
        dayKey = shift.dayKey;
      }

      if (userShifts && dayKey) {
        if (!userShifts.has(dayKey)) userShifts.set(dayKey, []);
        userShifts.get(dayKey)!.push(shift);
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

  const workHoursByWeek = useMemo(() => {
    const map = new Map<
      string,
      { userTotals: Record<string, number>; dayTotals: number[]; grandTotal: number }
    >();

    finalWeekBlocksDays.forEach(week => {
      const userTotals: Record<string, number> = {};
      const dayTotals: number[] = Array(7).fill(0);

      orderedUsers.forEach(user => {
        userTotals[user.id] = 0;
        week.forEach((day, dayIndex) => {
          const dayKey = toDateString(day);
          const dayShifts =
            shiftsByUserDay.get(user.id)?.get(dayKey) || [];

          const dayHours = dayShifts.reduce((sum, shiftForDay) => {
            if (!shiftForDay) return sum;

            const daySetting = getUnitDaySetting(shiftForDay, dayIndex);
            const closingTime = daySetting?.closingTime ?? DEFAULT_CLOSING_TIME;
            const closingOffsetMinutes =
              daySetting?.closingOffsetMinutes ?? DEFAULT_CLOSING_OFFSET_MINUTES;

            return (
              sum +
              calculateShiftDuration(shiftForDay, {
                closingTime,
                closingOffsetMinutes,
                referenceDate: week[dayIndex]
              })
            );
          }, 0);
          userTotals[user.id] += dayHours;
          if (!hiddenUserIds.has(user.id)) {
            dayTotals[dayIndex] += dayHours;
          }
        });
      });

      map.set(toDateString(week[0]), {
        userTotals,
        dayTotals,
        grandTotal: dayTotals.reduce((a, b) => a + b, 0)
      });
    });

    return map;
  }, [
    orderedUsers,
    hiddenUserIds,
    shiftsByUserDay,
    finalWeekBlocksDays,
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

  useEffect(() => {
    if (!isSelectionMode) return;
    clearSelection();
    setSelectionOverlays([]);
    setBulkTimeModal(null);
  }, [
    clearSelection,
    currentDate,
    activeUnitIds,
    visiblePositionOrder,
    isSelectionMode,
    viewSpan,
    finalWeekBlocksDays
  ]);

  const hiddenUsers = useMemo(
    () =>
      allAppUsers.filter(u => hiddenUserIds.has(u.id)),
    [allAppUsers, hiddenUserIds]
  );

  let zebraRowIndex = 0;
  let renderRowIndex = 0;

  const handlePrevWeek = () =>
    setCurrentDate(d => {
      const newDate = new Date(d);
      if (viewSpan === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setDate(newDate.getDate() - 7 * viewSpan);
      }
      return newDate;
    });

  const handleNextWeek = () =>
    setCurrentDate(d => {
      const newDate = new Date(d);
      if (viewSpan === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        newDate.setDate(newDate.getDate() + 7 * viewSpan);
      }
      return newDate;
    });

  const hasMultipleBlocks = finalWeekBlocksDays.length > 1;
  const headerStart = finalWeekBlocksDays[0]?.[0] || weekDays[0];
  const headerEnd =
    finalWeekBlocksDays[finalWeekBlocksDays.length - 1]?.[6] || weekDays[6];

  const viewOptions = useMemo<Array<{ label: string; value: 1 | 2 | 3 | 4 | 'month' }>>(
    () => [
      { label: 'Heti', value: 1 },
      { label: '2 heti', value: 2 },
      { label: '3 heti', value: 3 },
      { label: '4 heti', value: 4 },
      { label: 'Egy havi', value: 'month' }
    ],
    []
  );

  const tableStickyLayers = {
    header: LAYERS.tableHeader,
    section: LAYERS.tableSection,
    cell: LAYERS.tableCell
  } as const;

  const weekBlockGridColumns =
    finalWeekBlocksDays.length === 1
      ? 'grid-cols-1'
      : isPngExportRenderMode
        ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 lg:grid-cols-2';

  const isToolbarDisabled = isSidebarOpen;
  const toolbarDisabledClass = isToolbarDisabled
    ? 'opacity-60 saturate-75'
    : '';
  const toolbarButtonDisabledClass = isToolbarDisabled
    ? 'pointer-events-none'
    : '';
  const toolbarWrapperClassName = `export-hide sticky top-2 mb-4 ${isSidebarOpen ? 'pointer-events-none' : ''}`;
  const toolbarPillBase = 'shrink-0 whitespace-nowrap';

  const toolbarButtonClass = useCallback(
    (active: boolean) =>
      `text-sm px-4 py-2 rounded-full border border-white/40 backdrop-blur-md transition-colors shadow-sm ${
        active
          ? 'bg-slate-900/85 text-white shadow-md'
          : 'bg-white/30 text-slate-950 hover:bg-white/40'
      } disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none`,
    []
  );

  const cycleViewSpan = useCallback(() => {
    const currentIndex = viewOptions.findIndex(option => option.value === viewSpan);
    const nextIndex = (currentIndex + 1) % viewOptions.length;
    setViewSpan(viewOptions[nextIndex].value);
  }, [viewOptions, viewSpan]);

  const currentViewLabel = useMemo(
    () => viewOptions.find(option => option.value === viewSpan)?.label || 'Heti',
    [viewOptions, viewSpan]
  );

  const usersWithAnyShiftInRenderedPeriod = useMemo(() => {
    const ids = new Set<string>();
    const renderedDayKeys = finalWeekBlocksDays.flatMap(week =>
      week.map(toDateString)
    );

    shiftsByUserDay.forEach((dayMap, userId) => {
      for (const dayKey of renderedDayKeys) {
        const shifts = dayMap.get(dayKey) || [];
        if (shifts.length > 0) {
          ids.add(userId);
          break;
        }
      }
    });

    return ids;
  }, [finalWeekBlocksDays, shiftsByUserDay]);

  const renderWeekTable = (
    weekDaysForBlock: Date[],
    blockIndex: number
  ) => {
    const weekDays = weekDaysForBlock;
    const dayKeysForBlock = weekDays.map(toDateString);
    const defaultUserTotals: Record<string, number> = {};
    orderedUsers.forEach(user => {
      defaultUserTotals[user.id] = 0;
    });
    const workHours =
      workHoursByWeek.get(toDateString(weekDays[0])) || {
        userTotals: defaultUserTotals,
        dayTotals: Array(7).fill(0),
        grandTotal: 0
      };
    const blockZebra = hasMultipleBlocks && blockIndex % 2 === 0;
    const blockClasses = `${
      blockZebra ? 'bg-slate-50/60' : 'bg-white'
    } rounded-xl border border-black/5 shadow-sm`;

    const usersWithAnyShiftInBlockWeek = new Set<string>();
    shiftsByUserDay.forEach((dayMap, userId) => {
      for (const dayKey of dayKeysForBlock) {
        const shifts = dayMap.get(dayKey) || [];
        if (shifts.length > 0) {
          usersWithAnyShiftInBlockWeek.add(userId);
          break;
        }
      }
    });

    return (
      <div key={toDateString(weekDays[0])} className={blockClasses}>
        <table
          className="min-w-full text-sm"
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
          }}
        >
          <thead className="bg-slate-100">
            <tr>
              <th
                className="sticky left-0 bg-slate-100 px-4 py-3 text-left text-xs font-semibold text-slate-600"
                style={{ zIndex: tableStickyLayers.header }}
              >
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
                      <td
                        className="sticky left-0 bg-slate-50 px-4 py-1 text-left text-[11px] font-semibold text-slate-500 border border-slate-200"
                        style={{ zIndex: tableStickyLayers.header }}
                      >
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
                      <td
                        className="sticky left-0 bg-slate-50 px-4 py-1 text-left text-[11px] font-semibold text-slate-500 border border-slate-200"
                        style={{ zIndex: tableStickyLayers.header }}
                      >
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
                      className="sticky left-0 bg-slate-300 px-4 py-2 text-left align-middle text-xs font-semibold uppercase tracking-wide text-slate-800 border-t border-b border-slate-400"
                      style={{ zIndex: tableStickyLayers.section }}
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
                    const hasRenderedPeriodShift =
                      usersWithAnyShiftInRenderedPeriod.has(user.id);
                    const hasShiftInBlockWeek =
                      usersWithAnyShiftInBlockWeek.has(user.id);

                    if (
                      isPngExportRenderMode &&
                      pngHideEmptyUsers &&
                      !hasRenderedPeriodShift
                    ) {
                      return null;
                    }
                    const isEmptyWeek =
                      weeklyHours <= 0.01 && !hasShiftInBlockWeek;

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
                    const currentRowIndex = renderRowIndex++;

                    const hasTags = !!(user.tags && user.tags.length);

                    return (
                      <tr
                        key={user.id}
                        data-user-id={user.id}
                        className={isEmptyWeek ? 'no-shifts-week' : ''}
                        style={{ background: rowBg }}
                      >
                        {/* Név oszlop */}
                        <td
                          className="sticky left-0 bg-white border border-slate-200 px-4 py-2 text-left align-middle align-middle"
                          style={{
                            background: nameBg,
                            color: nameTextColor,
                            zIndex: tableStickyLayers.cell
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800 leading-tight">
                                {user.fullName}
                              </span>
                              {isMultiUnitView && userUnit && (
                                <UnitLogoBadge unit={userUnit} size={18} />
                              )}
                            </div>
                            <div className="export-hide flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                              <span className="flex items-center gap-1">
                                {weeklyHours.toFixed(1)} óra
                                {isEmptyWeek && '· üres hét'}
                              </span>
                              {canManage && isEditMode && (
                                <button
                                  type="button"
                                  onClick={() => handleHideUser(user.id)}
                                  className="rounded-full p-1 text-slate-600 transition hover:bg-slate-200"
                                  title="Alkalmazott elrejtése"
                                >
                                  <EyeSlashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {hasTags && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              {user.tags?.map(tag => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Hét napjai */}
                        {weekDays.map((day, dayIndex) => {
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

                          const canEditCell =
                            canManage || currentUser.id === user.id;
                          const displayParts: string[] = [];
                          const unitIdForCell =
                            activeUnitIds.length === 1 ? activeUnitIds[0] : null;
                          const primaryShift = selectExistingShiftForCell(
                            userDayShifts,
                            unitIdForCell,
                            viewMode
                          );
                          if (isDevEnv && userDayShifts.length > 1) {
                            console.debug('render: multiple shifts in cell', {
                              userId: user.id,
                              dayKey,
                              unitIdForCell,
                              viewMode,
                              primaryShiftId: primaryShift?.id,
                              primaryIsHighlighted: primaryShift?.isHighlighted,
                              shiftIds: userDayShifts.map(s => ({
                                id: s.id,
                                status: s.status,
                                highlightOnly: isHighlightOnlyShift(s),
                              })),
                            });
                          }
                          const dayOffShift =
                            primaryShift?.isDayOff
                              ? primaryShift
                              : userDayShifts.find(s => s.isDayOff);
                          const isDayOff = !!dayOffShift;
                          const isLeave =
                            !!leaveRequest && userDayShifts.length === 0;
                          const shiftNote =
                            (primaryShift?.note && !primaryShift.isDayOff
                              ? primaryShift.note
                              : null) ||
                            userDayShifts.find(
                              s => s.note && !s.isDayOff
                            )?.note ||
                            '';

                          if (userDayShifts.length > 0) {
                            if (dayOffShift) {
                              displayParts.push('X');
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
                            availabilityRequests.forEach(req => {
                              if (req.startDate && req.endDate) {
                                const start = req.startDate.toDate();
                                const end = req.endDate.toDate();
                                const startStr =
                                  start.toTimeString().substring(0, 5) || '';
                                const endStr =
                                  end.toTimeString().substring(0, 5) || '';
                                displayParts.push(`${startStr}-${endStr}`);
                              }
                              if (req.note) {
                                displayParts.push(`(Megjegyzés: ${req.note})`);
                              }
                            });
                          }

                          if (isLeave) {
                            displayParts.push('Szabi');
                            if (leaveRequest?.note) {
                              displayParts.push(`Megjegyzés: ${leaveRequest.note}`);
                            }
                          }

                          const hasContent = displayParts.length > 0;
                          const hasNote = shiftNote !== '';

                          const highlightedShift =
                            unitIdForCell && primaryShift?.isHighlighted
                              ? primaryShift
                              : unitIdForCell
                              ? userDayShifts.find(
                                  s =>
                                    s.unitId === unitIdForCell &&
                                    s.status === viewMode &&
                                    s.isHighlighted
                                )
                              : null;
                          const isHighlightedCell =
                            !!(unitIdForCell && highlightedShift?.isHighlighted);

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

                          const cellDataKey = `${user.id}|${dayKey}`;
                          const cellUiKey = `${cellDataKey}#${currentRowIndex}`;

                          const baseCellStyle: CSSProperties = {};
                          if (!isDayOff && !isLeave) {
                            baseCellStyle.background = rowBg;
                            baseCellStyle.color = rowTextColor;
                          }

                          if (isHighlightedCell) {
                            if (isDayOff || isLeave) {
                              baseCellStyle.boxShadow =
                                '0 0 0 2px rgba(249, 115, 22, 0.65) inset';
                            } else {
                              baseCellStyle.background = '#ffedd5';
                              baseCellStyle.color = '#7c2d12';
                              baseCellStyle.boxShadow =
                                '0 0 0 2px rgba(249, 115, 22, 0.4) inset';
                            }
                          }

                          const cellStyle =
                            Object.keys(baseCellStyle).length > 0
                              ? baseCellStyle
                              : undefined;

                          return (
                            <td
                              key={dayIndex}
                              ref={node => {
                                if (node) {
                                  cellRefs.current.set(cellUiKey, node);
                                  cellMetaRef.current.set(cellUiKey, {
                                    row: currentRowIndex,
                                    col: dayIndex
                                  });
                                  cellCoordIndexRef.current.set(
                                    `${currentRowIndex}:${dayIndex}`,
                                    cellUiKey
                                  );
                                } else {
                                  cellRefs.current.delete(cellUiKey);
                                  cellMetaRef.current.delete(cellUiKey);
                                  cellCoordIndexRef.current.delete(
                                    `${currentRowIndex}:${dayIndex}`
                                  );
                                }
                              }}
                              className={cellClasses}
                              style={cellStyle}
                              onClick={event =>
                                handleCellInteraction(
                                  cellUiKey,
                                  canEditCell,
                                  userDayShifts,
                                  user.id,
                                  day,
                                  event
                                )
                              }
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
                                  <span className="export-hide pointer-events-none select-none text-slate-200 text-lg font-light">
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
              <td
                className="sticky left-0 bg-slate-50 px-4 py-2 text-left align-middle text-xs font-semibold text-slate-700"
                style={{ zIndex: tableStickyLayers.cell }}
              >
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
    );
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

  const getEmailEnabledForUnit = async (
    unitId?: string | null
  ): Promise<boolean> => {
    const isEnabledField = (value: unknown): value is boolean =>
      typeof value === 'boolean';

    if (unitId) {
      const unitSnap = await getDoc(
        doc(db, 'units', unitId, 'settings', 'email')
      );
      if (unitSnap.exists()) {
        const data = unitSnap.data();
        if (isEnabledField(data?.enabled)) {
          return data.enabled;
        }
      }
    }

    const globalSnap = await getDoc(doc(db, 'app_config', 'email'));
    if (globalSnap.exists()) {
      const data = globalSnap.data();
      if (isEnabledField(data?.enabled)) {
        return data.enabled;
      }
    }

    return true;
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
      const chunkSize = 450;
      const shiftChunks: Shift[][] = [];
      for (let i = 0; i < shiftsToPublish.length; i += chunkSize) {
        shiftChunks.push(shiftsToPublish.slice(i, i + chunkSize));
      }

      try {
        for (const chunk of shiftChunks) {
          const batch = writeBatch(db);
          chunk.forEach(shift =>
            batch.update(doc(db, 'shifts', shift.id), {
              status: 'published'
            })
          );
          await batch.commit();
        }
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
        const emailEnabled = await getEmailEnabledForUnit(unitId);
        if (!emailEnabled) {
          setSuccessToast(
            'Az email értesítések jelenleg ki vannak kapcsolva, ezért most nem küldtünk levelet.'
          );
        } else {
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

  const buildRangeSelection = useCallback(
    (anchorKey: string, targetKey: string) => {
      const anchorMeta = cellMetaRef.current.get(anchorKey);
      const targetMeta = cellMetaRef.current.get(targetKey);
      if (!anchorMeta || !targetMeta) return null;

      const minRow = Math.min(anchorMeta.row, targetMeta.row);
      const maxRow = Math.max(anchorMeta.row, targetMeta.row);
      const minCol = Math.min(anchorMeta.col, targetMeta.col);
      const maxCol = Math.max(anchorMeta.col, targetMeta.col);

      const rangeKeys: string[] = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const key = cellCoordIndexRef.current.get(`${row}:${col}`);
          if (key) {
            rangeKeys.push(key);
          }
        }
      }

      return rangeKeys;
    },
    []
  );

  const handleCellInteraction = useCallback(
    (
      cellKey: string,
      canEditCell: boolean,
      userDayShifts: Shift[],
      userId: string,
      day: Date,
      event?: React.MouseEvent<HTMLTableCellElement>
    ) => {
      if (isSelectionMode) {
        const shiftPressed = event?.shiftKey;

        if (shiftPressed) {
          const anchor = anchorCellKey || cellKey;
          const rangeKeys = buildRangeSelection(anchor, cellKey);
          setSelectedCellKeys(prev => {
            const next = new Set(prev);
            if (rangeKeys) {
              rangeKeys.forEach(key => next.add(key));
            } else {
              next.add(cellKey);
            }
            return next;
          });
          setAnchorCellKey(anchor);
          return;
        }

        toggleCellSelection(cellKey);
        return;
      }

      if (canEditCell) {
        handleOpenShiftModal(userDayShifts[0] || null, userId, day);
      }
    },
    [
      anchorCellKey,
      buildRangeSelection,
      handleOpenShiftModal,
      isSelectionMode,
      toggleCellSelection,
    ]
  );

  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => {
      const next = !prev;
      if (next) {
        setIsEditMode(false);
      }
      return next;
    });
  }, []);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(prev => {
      const next = !prev;
      if (next) {
        setIsSelectionMode(false);
      }
      return next;
    });
  }, []);

  const parseDayKeyToDate = useCallback((dayKey: string) => {
    const [year, month, day] = dayKey.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  }, []);

  const parseSelectionKey = useCallback(
    (selectionKey: string) => {
      const [dataKey] = selectionKey.split('#');
      const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
      let userId = '';
      let dayKey = '';

      const lastSep = dataKey.lastIndexOf('|');
      if (lastSep > 0 && lastSep < dataKey.length - 1) {
        const maybeUserId = dataKey.slice(0, lastSep);
        const maybeDayKey = dataKey.slice(lastSep + 1);
        userId = maybeUserId;
        if (dayKeyPattern.test(maybeDayKey) && weekDayKeySet.has(maybeDayKey)) {
          dayKey = maybeDayKey;
        }
      }

      if (!dayKey) {
        const maybeDayKey = dataKey.slice(-10);
        if (dayKeyPattern.test(maybeDayKey) && weekDayKeySet.has(maybeDayKey)) {
          dayKey = maybeDayKey;
          userId = userId || dataKey.slice(0, Math.max(0, dataKey.length - 11));
        } else {
          // legacy/invalid format: keep whatever userId we have, dayKey stays empty
          userId = userId || (lastSep > 0 ? dataKey.slice(0, lastSep) : dataKey);
        }
      }

      if (!dayKey && isDevEnv) {
        console.debug('Skipping selection key without valid dayKey', { selectionKey });
      }

      return { dataKey, dayKey, userId };
    },
    [isDevEnv, weekDayKeySet]
  );

  const resolveCellDayKey = useCallback(
    (cellKey: string): string | null => {
      const parsed = parseSelectionKey(cellKey);
      if (parsed.dayKey) return parsed.dayKey;

      const meta = cellMetaRef.current.get(cellKey);
      if (meta) {
        const day = weekDays[meta.col];
        if (day) return toDateString(day);
      }

      return null;
    },
    [parseSelectionKey, weekDays]
  );

  const isHighlightOnlyShift = useCallback(
    (shift: Shift): boolean =>
      !shift.start &&
      !shift.end &&
      !shift.isDayOff &&
      (shift.note ?? '') === '' &&
      !!shift.dayKey &&
      shift.isHighlighted === true,
    []
  );

  const selectExistingShiftForCell = useCallback(
    (
      userDayShifts: Shift[],
      unitId?: string | null,
      status?: 'draft' | 'published'
    ) => {
      if (!unitId) return null;
      let shiftsForUnit = userDayShifts.filter(shift => shift.unitId === unitId);
      if (status) {
        shiftsForUnit = shiftsForUnit.filter(shift => shift.status === status);
      }
      if (shiftsForUnit.length === 0) return null;
      return shiftsForUnit.find(shift => !isHighlightOnlyShift(shift)) || shiftsForUnit[0];
    },
    [isHighlightOnlyShift]
  );

  const buildHighlightShiftId = useCallback(
    (unitId: string, status: 'draft' | 'published', userId: string, dayKey: string) =>
      `hl_${unitId}_${status}_${userId}_${dayKey}`,
    []
  );

  const buildCellTargetKey = useCallback(
    (
      unitId: string,
      userId: string,
      dayKey: string,
      status: 'draft' | 'published'
    ) => `${unitId}|${status}|${userId}|${dayKey}`,
    []
  );

  const computeSelectionTargets = useCallback(() => {
    const result = {
      targetCells: [] as Array<{
        dayKey: string;
        userId: string;
        user: User | null;
        shift: Shift | null;
        status: 'draft' | 'published';
        unitId: string;
        cellKey: string;
      }>,
      targetShifts: [] as Shift[],
      existingShiftsByCellKey: new Map<string, Shift>(),
      skippedLegacyOrOtherUnit: 0,
      missingDayKeyErrors: 0,
    };

    if (activeUnitIds.length !== 1) return result;

    const unitId = activeUnitIds[0];
    if (!unitId) return result;

    selectedCellKeys.forEach(cellKey => {
      try {
        const { userId } = parseSelectionKey(cellKey);
        const dayKey = resolveCellDayKey(cellKey);
        if (!dayKey || !userId) {
          if (isDevEnv) {
            console.debug('Skipping cell due to missing dayKey/userId', { cellKey, dayKey });
          }
          return;
        }
        if (!(canManage || currentUser.id === userId)) return;

        const user = userById.get(userId) || null;
        if (!user) return;

        const userDayShifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
        const existingShift = selectExistingShiftForCell(
          userDayShifts,
          unitId,
          viewMode
        );

        if (!existingShift && userDayShifts.length > 0) {
          result.skippedLegacyOrOtherUnit += 1;
          return;
        }

        if (existingShift) {
          const key = buildCellTargetKey(unitId, userId, dayKey, viewMode);
          result.existingShiftsByCellKey.set(key, existingShift);
          result.targetShifts.push(existingShift);
        }

        result.targetCells.push({
          dayKey,
          userId,
          user,
          shift: existingShift,
          status: viewMode,
          unitId,
          cellKey,
        });
      } catch (err) {
        result.missingDayKeyErrors += 1;
        if (isDevEnv) {
          console.debug('Skipping cell with missing/invalid dayKey', { cellKey, err });
        }
      }
    });

    return result;
  }, [
    activeUnitIds,
    buildCellTargetKey,
    canManage,
    currentUser.id,
    isDevEnv,
    parseSelectionKey,
    resolveCellDayKey,
    selectExistingShiftForCell,
    selectedCellKeys,
    shiftsByUserDay,
    userById,
    viewMode,
  ]);

  const handleBulkSetTime = useCallback(
    async (type: 'start' | 'end', value: string) => {
      if (!value) {
        setBulkTimeModal(null);
        return;
      }

      const [hours, minutes] = value.split(':').map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        setBulkTimeModal(null);
        return;
      }

      const unitId = activeUnitIds[0];
      if (!unitId) {
        setBulkTimeModal(null);
        return;
      }

      const batch = writeBatch(db);
      let hasBatchWrites = false;
      const additions: Array<Omit<Shift, 'id'>> = [];
      let skippedLegacyOrOtherUnit = 0;
      let skippedEndWithoutStart = 0;

      selectedCellKeys.forEach(cellKey => {
        const { dayKey, userId } = parseSelectionKey(cellKey);

        if (!dayKey || !userId) return;
        if (!(canManage || currentUser.id === userId)) return;

        const user = userById.get(userId);
        if (!user) return;

        const userDayShifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
        const existingShift = selectExistingShiftForCell(
          userDayShifts,
          unitId,
          viewMode
        );
        if (!existingShift && userDayShifts.length > 0) {
          skippedLegacyOrOtherUnit += 1;
          return;
        }

        const dayStart = parseDayKeyToDate(dayKey);
        const targetTime = new Date(dayStart);
        targetTime.setHours(hours, minutes, 0, 0);

        const baseData = {
          userId: user.id,
          userName: user.fullName,
          position: user.position || 'N/A',
          unitId,
          status: viewMode,
        };

        if (existingShift) {
          const updateData: Partial<Shift> = {
            isDayOff: false,
            status: viewMode,
          };

          if (type === 'start') {
            updateData.start = Timestamp.fromDate(targetTime);
          }

          if (type === 'end') {
            const startDate =
              existingShift.start?.toDate() || new Date(dayStart);
            const endDate = new Date(targetTime);
            if (endDate <= startDate) {
              endDate.setDate(endDate.getDate() + 1);
            }
            updateData.end = Timestamp.fromDate(endDate);
            if (!existingShift.start) {
              updateData.start = Timestamp.fromDate(startDate);
            }
          }

          batch.update(doc(db, 'shifts', existingShift.id), updateData);
          hasBatchWrites = true;
        } else {
          if (type === 'start') {
            additions.push({
              ...baseData,
              start: Timestamp.fromDate(targetTime),
              end: null,
              isDayOff: false,
              note: '',
              isHighlighted: false,
            });
          } else {
            skippedEndWithoutStart += 1;
          }
        }
      });

      if (hasBatchWrites) {
        await batch.commit();
      }

      if (additions.length > 0) {
        await Promise.all(
          additions.map(data => addDoc(collection(db, 'shifts'), data))
        );
      }

      if (skippedLegacyOrOtherUnit > 0) {
        console.info('Skipped legacy/other-unit shifts:', skippedLegacyOrOtherUnit);
      }

      if (skippedEndWithoutStart > 0) {
        console.info('Skipped end time without existing start:', skippedEndWithoutStart);
      }

      setBulkTimeModal(null);
    },
    [
      activeUnitIds,
      canManage,
      currentUser.id,
      parseSelectionKey,
      selectedCellKeys,
      shiftsByUserDay,
      userById,
      isHighlightOnlyShift,
      selectExistingShiftForCell,
      viewMode,
    ]
  );

  const handleBulkDayOff = useCallback(async () => {
    const unitId = activeUnitIds[0];
    if (!unitId) return;

    const batch = writeBatch(db);
    let hasBatchWrites = false;
    const additions: Array<Omit<Shift, 'id'>> = [];
    let skippedLegacyOrOtherUnit = 0;

    selectedCellKeys.forEach(cellKey => {
      const { dayKey, userId } = parseSelectionKey(cellKey);
      if (!dayKey || !userId) return;
      if (!(canManage || currentUser.id === userId)) return;

      const user = userById.get(userId);
      if (!user) return;

      const userDayShifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
      const existingShift = selectExistingShiftForCell(
        userDayShifts,
        unitId,
        viewMode
      );
      if (!existingShift && userDayShifts.length > 0) {
        skippedLegacyOrOtherUnit += 1;
        return;
      }
      const dayStart = parseDayKeyToDate(dayKey);

      const baseData = {
        userId: user.id,
        userName: user.fullName,
        position: user.position || 'N/A',
        unitId,
        status: viewMode,
      };

      if (existingShift) {
        const updateData: Partial<Shift> = {
          start: Timestamp.fromDate(dayStart),
          end: null,
          isDayOff: true,
          status: viewMode,
        };
        batch.update(doc(db, 'shifts', existingShift.id), updateData);
        hasBatchWrites = true;
      } else {
        additions.push({
          ...baseData,
          start: Timestamp.fromDate(dayStart),
          end: null,
          isDayOff: true,
          note: '',
          isHighlighted: false,
        });
      }
    });

    if (hasBatchWrites) {
      await batch.commit();
    }

    if (additions.length > 0) {
      await Promise.all(
        additions.map(data => addDoc(collection(db, 'shifts'), data))
      );
    }

    if (skippedLegacyOrOtherUnit > 0) {
      console.info('Skipped legacy/other-unit shifts:', skippedLegacyOrOtherUnit);
    }
  }, [
    activeUnitIds,
    canManage,
    currentUser.id,
    parseDayKeyToDate,
    parseSelectionKey,
    selectedCellKeys,
    selectExistingShiftForCell,
    shiftsByUserDay,
    userById,
    viewMode,
  ]);

  const handleBulkDeleteNote = useCallback(async () => {
    const batch = writeBatch(db);
    let hasBatchWrites = false;
    let skippedLegacyOrOtherUnit = 0;

    selectedCellKeys.forEach(cellKey => {
      const { dayKey, userId } = parseSelectionKey(cellKey);
      if (!dayKey || !userId) return;
      if (!(canManage || currentUser.id === userId)) return;

      const userDayShifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
      const existingShift = selectExistingShiftForCell(
        userDayShifts,
        activeUnitIds[0],
        viewMode
      );
      if (!existingShift && userDayShifts.length > 0) {
        skippedLegacyOrOtherUnit += 1;
        return;
      }

      if (!existingShift || !existingShift.note) return;

      batch.update(doc(db, 'shifts', existingShift.id), {
        note: '',
        status: viewMode,
      });
      hasBatchWrites = true;
    });

    if (hasBatchWrites) {
      await batch.commit();
    }

    if (skippedLegacyOrOtherUnit > 0) {
      console.info('Skipped legacy/other-unit shifts:', skippedLegacyOrOtherUnit);
    }
  }, [
    activeUnitIds,
    canManage,
    currentUser.id,
    parseSelectionKey,
    selectedCellKeys,
    selectExistingShiftForCell,
    shiftsByUserDay,
    viewMode,
  ]);

  const handleBulkClearCells = useCallback(async () => {
    const unitId = activeUnitIds[0];
    if (!unitId) return;

    const batch = writeBatch(db);
    let hasBatchWrites = false;
    let skippedLegacyOrOtherUnit = 0;

    selectedCellKeys.forEach(cellKey => {
      const { dayKey, userId } = parseSelectionKey(cellKey);
      if (!dayKey || !userId) return;
      if (!(canManage || currentUser.id === userId)) return;

      const userDayShifts = shiftsByUserDay.get(userId)?.get(dayKey) || [];
      const existingShift = selectExistingShiftForCell(
        userDayShifts,
        unitId,
        viewMode
      );

      if (!existingShift) {
        if (userDayShifts.length > 0) {
          skippedLegacyOrOtherUnit += 1;
        }
        return;
      }

      batch.delete(doc(db, 'shifts', existingShift.id));
      hasBatchWrites = true;
    });

    if (hasBatchWrites) {
      await batch.commit();
    }

    if (skippedLegacyOrOtherUnit > 0) {
      console.info('Skipped legacy/other-unit shifts:', skippedLegacyOrOtherUnit);
    }
  }, [
    activeUnitIds,
    canManage,
    currentUser.id,
    parseSelectionKey,
    selectedCellKeys,
    selectExistingShiftForCell,
    shiftsByUserDay,
    viewMode,
  ]);
  // Self-tests (manual):
  // a) Select empty cells and apply highlight -> highlight-only docs are created with dayKey.
  // b) Select cells with normal shifts -> isHighlighted toggles true/false on the same docs.
  // c) Select highlight-only cells -> remove highlight deletes those docs cleanly.
  const applyHighlightToSelection = useCallback(
    async (forceValue?: boolean) => {
      if (activeUnitIds.length !== 1) return;

      const unitId = activeUnitIds[0];
      if (!unitId) return;

      const selectionKeys = Array.from(selectedCellKeys);
      if (selectionKeys.length === 0) return;

      let selectionData;
      try {
        selectionData = computeSelectionTargets();
      } catch (err) {
        if (isDevEnv) {
          console.debug('applyHighlightToSelection dayKey resolution error', err);
        }
        return;
      }

      if (!selectionData) return;

      const {
        targetCells,
        targetShifts,
        existingShiftsByCellKey,
        skippedLegacyOrOtherUnit,
        missingDayKeyErrors,
      } = selectionData;

      if (isDevEnv) {
        console.debug('applyHighlightToSelection', {
          selectionCount: selectionKeys.length,
          targetCells: targetCells.length,
          targetShifts: targetShifts.length,
          skippedLegacyOrOtherUnit,
          missingDayKeyErrors,
          forceValue,
        });
      }

      if (targetCells.length === 0) {
        return;
      }

      const shouldHighlight =
        forceValue !== undefined
          ? forceValue
          : targetShifts.length === 0
            ? true
            : !targetShifts.every(shift => shift.isHighlighted === true);

      let batch = writeBatch(db);
      let writeCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;
      const createdHighlightDocIds: string[] = [];

      for (const cell of targetCells) {
        const cellKey = buildCellTargetKey(unitId, cell.userId, cell.dayKey, viewMode);
        const existingShift = existingShiftsByCellKey.get(cellKey) || null;
        const shiftRef = existingShift ? doc(db, 'shifts', existingShift.id) : null;

        if (shouldHighlight) {
          if (existingShift && shiftRef) {
            const updatePayload: Partial<Shift> = {
              isHighlighted: true,
              status: viewMode,
              dayKey: cell.dayKey,
              unitId,
            };
            batch.update(shiftRef, updatePayload);
            updatedCount += 1;
          } else if (cell.user) {
            const highlightDocId = buildHighlightShiftId(
              unitId,
              viewMode,
              cell.user.id,
              cell.dayKey
            );
            const highlightPayload: Omit<Shift, 'id'> = {
              userId: cell.user.id,
              userName: cell.user.fullName,
              position: cell.user.position || 'N/A',
              unitId,
              status: viewMode,
              isDayOff: false,
              start: null,
              end: null,
              note: '',
              isHighlighted: true,
              dayKey: cell.dayKey,
            };

            batch.set(doc(db, 'shifts', highlightDocId), highlightPayload, {
              merge: true,
            });
            if (createdHighlightDocIds.length < 5) {
              createdHighlightDocIds.push(highlightDocId);
            }
            createdCount += 1;
          }
        } else if (existingShift && shiftRef) {
          if (isHighlightOnlyShift(existingShift)) {
            batch.delete(shiftRef);
            deletedCount += 1;
          } else {
            const updatePayload: Partial<Shift> = {
              isHighlighted: false,
              status: viewMode,
              dayKey: cell.dayKey,
              unitId,
            };
            batch.update(shiftRef, updatePayload);
            updatedCount += 1;
          }
        }

        writeCount += 1;
        if (writeCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          writeCount = 0;
        }
      }

      if (writeCount > 0) {
        await batch.commit();
      }

      if (skippedLegacyOrOtherUnit > 0) {
        console.info('Skipped legacy/other-unit shifts:', skippedLegacyOrOtherUnit);
      }

      if (isDevEnv) {
        console.debug('applyHighlightToSelection summary', {
          selectionCount: selectionKeys.length,
          resolvedCellCount: targetCells.length,
          targetShifts: targetShifts.length,
          createdCount,
          updatedCount,
          deletedCount,
          skippedLegacyOrOtherUnit,
          missingDayKeyErrors,
          createdHighlightDocIds: createdHighlightDocIds.slice(0, 5),
        });
      }
    },
    [
      activeUnitIds,
      buildCellTargetKey,
      buildHighlightShiftId,
      computeSelectionTargets,
      isDevEnv,
      isHighlightOnlyShift,
      selectedCellKeys,
      viewMode,
    ]
  );

  useEffect(() => {
    const shouldHandleShortcuts = isSelectionMode || selectedCellKeys.size > 0;
    if (!shouldHandleShortcuts) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      ) {
        return;
      }

      if (
        isShiftModalOpen ||
        isPublishModalOpen ||
        isHiddenModalOpen ||
        showSettings ||
        bulkTimeModal !== null ||
        isPngExporting
      ) {
        return;
      }

      const metaOrCtrl = event.metaKey || event.ctrlKey;
      const shift = event.shiftKey;

      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (!metaOrCtrl || !shift) return;

      const key = event.key.toLowerCase();

      if (key === 'h') {
        event.preventDefault();
        applyHighlightToSelection();
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        handleBulkDayOff();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handleBulkClearCells();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    applyHighlightToSelection,
    bulkTimeModal,
    clearSelection,
    handleBulkClearCells,
    handleBulkDayOff,
    isHiddenModalOpen,
    isPngExporting,
    isPublishModalOpen,
    isShiftModalOpen,
    isSelectionMode,
    selectedCellKeys.size,
    showSettings,
  ]);

  const handleSaveShift = async (
    shiftData: Partial<Shift> & { id?: string }
  ) => {
    const shiftToSave = {
      ...shiftData,
      unitId: activeUnitIds[0]
    };

    if (shiftToSave.id) {
      const docId = shiftToSave.id;
      const { id, isHighlighted, ...dataToUpdate } = shiftToSave;
      const updatePayload =
        isHighlighted !== undefined
          ? { ...dataToUpdate, isHighlighted }
          : dataToUpdate;
      await updateDoc(doc(db, 'shifts', docId), updatePayload);
    } else {
      const { id, ...dataToAdd } = shiftToSave;
      const isHighlighted = dataToAdd.isHighlighted ?? false;
      const payload = { ...dataToAdd, isHighlighted };
      await addDoc(collection(db, 'shifts'), payload);
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
        const updatedWithUnitId = {
          ...updated,
          unitId: updated.unitId || activeUnitIds[0] || baseSettings.unitId
        };
        if (canManage && activeUnitIds.length === 1) {
          setDoc(doc(db, 'schedule_settings', updatedWithUnitId.id), updatedWithUnitId)
            .catch(error => {
              console.error('Failed to save settings:', error);
            });
        }
        return updatedWithUnitId;
      });
    },
    [canManage, activeUnitIds, weekStartDateStr]
  );

  const waitForExportLayout = useCallback(async () => {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (err) {
        console.warn('Font loading wait skipped:', err);
      }
    }

    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  const waitForCloneLayout = useCallback(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  // --- UPDATED PNG EXPORT FUNCTION (better alignment for text in cells) ---
  const handlePngExport = async (
    hideEmptyUsers: boolean,
    scale: 1 | 2 | 3
  ): Promise<void> => {
    setIsPngExportRenderMode(true);
    setPngHideEmptyUsers(hideEmptyUsers);
    setIsPngExporting(true);

    let exportContainer: HTMLDivElement | null = null;
    let exportInnerWrapper: HTMLDivElement | null = null;
    const SHOW_EXPORT_HEADER = false;

    try {
      await waitForExportLayout();

      if (!exportRef.current) {
        throw new Error('Export container ref not found');
      }

      const existingExportContainer = document.querySelector(
        '[data-export-container="png"]'
      );
      if (existingExportContainer?.parentElement) {
        existingExportContainer.parentElement.removeChild(
          existingExportContainer
        );
      }

      exportContainer = document.createElement('div');
      exportContainer.dataset.exportContainer = 'png';
      Object.assign(exportContainer.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0',
        backgroundColor: '#ffffff',
        padding: '0px',
        display: 'inline-block',
        overflow: 'visible'
      } as CSSStyleDeclaration);

      exportInnerWrapper = document.createElement('div');
      Object.assign(exportInnerWrapper.style, {
        display: 'inline-block',
        backgroundColor: '#ffffff',
        borderRadius: exportSettings.useRoundedCorners
          ? `${exportSettings.borderRadius}px`
          : '0px',
        overflow: exportSettings.useRoundedCorners ? 'hidden' : 'visible'
      } as CSSStyleDeclaration);

      const tableClone =
        exportRef.current.cloneNode(true) as HTMLDivElement;

      tableClone.querySelectorAll('.export-hide').forEach(el => el.remove());

      // Remove comment-only nodes so they cannot alter export sizing (export-only)
      const commentSelectors = ['.handwritten-note', '[data-export-hide="comment"]'];
      tableClone
        .querySelectorAll<HTMLElement>(commentSelectors.join(','))
        .forEach(el => {
          el.remove();
        });

      if (SHOW_EXPORT_HEADER) {
        const exportUnitName =
          activeUnitIds.length === 1
            ? allUnits.find(u => u.id === activeUnitIds[0])?.name ||
              'Ismeretlen egység'
            : 'Több egység';
        const weekRange = `${weekDays[0].toLocaleDateString('hu-HU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })} – ${weekDays[weekDays.length - 1].toLocaleDateString('hu-HU', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })}`;
        const headerTextColor = getContrastingTextColor(
          exportSettings.dayHeaderBgColor
        );
        const exportHeader = document.createElement('div');
        Object.assign(exportHeader.style, {
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '10px 12px',
          background: exportSettings.dayHeaderBgColor,
          color: headerTextColor,
          borderBottom: `${exportSettings.gridThickness}px solid ${exportSettings.gridColor}`
        } as CSSStyleDeclaration);
        const headerRow = document.createElement('div');
        Object.assign(headerRow.style, {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: '800'
        } as CSSStyleDeclaration);
        const headerLeft = document.createElement('div');
        headerLeft.textContent = exportUnitName;
        const headerRight = document.createElement('div');
        headerRight.textContent = weekRange;
        headerRow.appendChild(headerLeft);
        headerRow.appendChild(headerRight);
        const headerSub = document.createElement('div');
        headerSub.textContent =
          viewMode === 'published' ? 'Publikált' : 'Piszkozat';
        headerSub.style.fontWeight = '500';
        exportHeader.appendChild(headerRow);
        exportHeader.appendChild(headerSub);
        exportInnerWrapper.appendChild(exportHeader);
      }
      exportInnerWrapper.appendChild(tableClone);
      exportContainer.appendChild(exportInnerWrapper);
      document.body.appendChild(exportContainer);

      await waitForCloneLayout();

      tableClone
        .querySelectorAll<HTMLElement>('.sticky')
        .forEach(el => {
          el.classList.remove(
            'sticky',
            'left-0',
            'right-0',
            'top-0',
            'top-2',
            'bottom-0'
          );
          el.style.position = 'static';
          el.style.left = 'auto';
          el.style.right = 'auto';
          el.style.top = 'auto';
          el.style.bottom = 'auto';
        });

      tableClone
        .querySelectorAll<HTMLTableCellElement>('tbody td')
        .forEach(td => {
          const txt = (td.textContent || '').trim().toUpperCase();
          if (txt === 'X' || txt === 'SZ' || txt === 'SZABI') {
            td.textContent = '';
          }
        });

      tableClone.querySelectorAll('tr.summary-row').forEach(row => row.remove());
      tableClone
        .querySelectorAll<HTMLTableRowElement>('tbody tr')
        .forEach(row => {
          const rowText = (row.textContent || '').toLowerCase();
          const summaryTokens = [
            'összes',
            'összesen',
            'óra',
            'óraszám',
            'heti',
            'napi'
          ];
          if (summaryTokens.some(token => rowText.includes(token))) {
            row.remove();
          }
        });
      const hoursSelectors = [
        '.hours',
        '.hour-badge',
        '[data-hours]',
        '[data-summary]',
        '.total-hours'
      ];
      tableClone
        .querySelectorAll<HTMLElement>(hoursSelectors.join(','))
        .forEach(el => el.remove());
      tableClone
        .querySelectorAll<HTMLElement>('span, small, div')
        .forEach(el => {
          const text = (el.textContent || '').trim();
          if (!text || text.length > 10) return;
          const isHours =
            /^\d+(\.\d+)?\s*h$/i.test(text) ||
            /^\d+(\.\d+)?\s*óra$/i.test(text);
          if (isHours) {
            el.remove();
          }
        });

      tableClone
        .querySelectorAll<HTMLTableCellElement>('th, td')
        .forEach(cell => {
          cell.style.verticalAlign = 'middle';
        });
      tableClone
        .querySelectorAll<HTMLTableRowElement>('tbody tr')
        .forEach(row => {
          if (row.querySelector('td[colSpan]')) return;
          const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
          cells.slice(1).forEach(cell => {
            if (
              cell.classList.contains('day-off-cell') ||
              cell.classList.contains('leave-cell')
            ) {
              return;
            }
            cell.style.display = 'table-cell';
            if (!/\d{2}:\d{2}/.test(cell.textContent || '')) {
              return;
            }
            const elementChild = cell.firstElementChild as HTMLElement | null;
            if (elementChild) {
              elementChild.style.display = 'flex';
              elementChild.style.alignItems = 'center';
              elementChild.style.justifyContent = 'center';
              elementChild.style.height = '100%';
              return;
            }
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            wrapper.style.height = '100%';
            while (cell.firstChild) {
              wrapper.appendChild(cell.firstChild);
            }
            cell.appendChild(wrapper);
          });
        });

      tableClone.style.width = 'fit-content';
      tableClone.style.maxWidth = 'none';
      tableClone.style.overflow = 'visible';

      tableClone
        .querySelectorAll<HTMLElement>('.overflow-x-auto')
        .forEach(el => {
          el.style.overflowX = 'visible';
          el.style.overflowY = 'visible';
          el.style.maxWidth = 'none';
          el.style.width = 'fit-content';
        });

      const gridNode = tableClone.querySelector<HTMLElement>('.grid');
      if (gridNode) {
        gridNode.style.width = 'fit-content';
        gridNode.style.maxWidth = 'none';
      }

      const paddingPx = 0;
      const borderCompensation = Math.max(
        0,
        exportSettings.gridThickness * 2
      );
      const safetyPadding =
        exportSettings.gridThickness >= 2 ? 2 : 0;
      const rawWidth =
        (gridNode?.scrollWidth || tableClone.scrollWidth || 0) + paddingPx;
      const rawHeight =
        (exportInnerWrapper.scrollHeight ||
          gridNode?.scrollHeight ||
          tableClone.scrollHeight ||
          0) + paddingPx;
      const finalWidth = Math.ceil(
        rawWidth + borderCompensation + safetyPadding
      );
      const finalHeight = Math.ceil(
        rawHeight + borderCompensation + safetyPadding
      );
      exportContainer.style.width = `${finalWidth}px`;
      exportContainer.style.height = `${finalHeight}px`;

      const canvas = await html2canvas(exportContainer, {
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scale,
        windowWidth: finalWidth,
        windowHeight: finalHeight
      });

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
    } catch (err) {
      console.error('PNG export failed:', err);
      alert('Hiba történt a PNG exportálás során.');
      throw err;
    } finally {
      if (exportContainer?.parentElement) {
        exportContainer.parentElement.removeChild(exportContainer);
      }
      setIsPngExporting(false);
      setIsPngExportRenderMode(false);
      setPngHideEmptyUsers(false);
    }
  };

  const closeExportWithGuard = () => {
    setExportConfirmation(null);
    setIsPngExportConfirming(false);
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

  const isSelectionActive = isSelectionMode && selectedCellKeys.size > 0;

  let userRowIndex = 0;

  if (isDataLoading)
    return (
      <div className="relative h-64">
        <LoadingSpinner />
      </div>
    );

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
        @keyframes toast-slide-up {
          from { transform: translateY(18px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .toast-slide-up { animation: toast-slide-up 240ms ease-out forwards; }
        @keyframes toast-slide-down {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(18px); opacity: 0; }
        }
        .toast-slide-down { animation: toast-slide-down 240ms ease-in forwards; }
        .toolbar-scroll { scrollbar-width: none; }
        .toolbar-scroll::-webkit-scrollbar { display: none; }
        `}
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

      {isPublishModalOpen && (
        <PublishWeekModal
          units={unitsWithDrafts}
          onClose={() => setIsPublishModalOpen(false)}
          onConfirm={handleConfirmPublish}
        />
      )}

      <HiddenUsersModal
        isOpen={isHiddenModalOpen}
        onClose={() => setIsHiddenModalOpen(false)}
        hiddenUsers={hiddenUsers}
        onUnhide={handleShowUser}
        layer={LAYERS.modal}
      />

      <div
        className={toolbarWrapperClassName}
        style={{
          zIndex: LAYERS.toolbar,
          position: 'fixed',
          top: topOffsetPx,
          left: 0,
          right: 0,
          pointerEvents: 'none',
        }}
      >
        <GlassOverlay
          className={`w-full ${toolbarDisabledClass} ${isSidebarOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}
          elevation="high"
          radius={18}
          style={{ padding: 12 }}
          interactive={!isSidebarOpen}
        >
          <div className="flex w-full flex-col">
            <div
              className="toolbar-scroll flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto"
              style={{
                touchAction: 'pan-x',
                overscrollBehaviorX: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="flex items-center gap-2 flex-nowrap">
                <button
                  onClick={cycleViewSpan}
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  disabled={isToolbarDisabled}
                >
                  {currentViewLabel}
                </button>
              </div>
              {canManage && (
                <div className="flex items-center gap-2 flex-nowrap">
                  <button
                    onClick={handleToggleEditMode}
                    className={`${toolbarButtonClass(isEditMode)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                    disabled={isToolbarDisabled}
                  >
                    Névsor szerkesztése
                  </button>
                  <button
                    onClick={handleToggleSelectionMode}
                    className={`${toolbarButtonClass(isSelectionMode)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                    disabled={isToolbarDisabled}
                  >
                    Cella kijelölése
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 flex-nowrap">
                <button
                  onClick={() => setIsHiddenModalOpen(true)}
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase} min-w-[76px] h-10 inline-flex items-center justify-center`}
                  disabled={isToolbarDisabled}
                >
                  <span className="inline-flex items-center gap-2 leading-none">
                    <EyeIcon className="h-5 w-5" />
                    <span className="leading-none">({hiddenUsers.length})</span>
                  </span>
                </button>
              </div>
            </div>

            <div
              className={`w-full min-w-0 overflow-hidden transition-all duration-300 ease-out ${
                isSelectionActive
                  ? 'max-h-40 opacity-100'
                  : 'max-h-0 opacity-0'
              }`}
            >
              <div className="mt-2 text-xs text-slate-700 ml-[6px]">
                Kijelölve: {selectedCellKeys.size} cella
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  onClick={() => setBulkTimeModal({ type: 'start', value: '' })}
                  disabled={isToolbarDisabled}
                >
                  Kezdő idő
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  onClick={() => setBulkTimeModal({ type: 'end', value: '' })}
                  disabled={isToolbarDisabled}
                >
                  Vég idő
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  onClick={handleBulkDayOff}
                  disabled={isToolbarDisabled}
                >
                  Szabadnap
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  disabled={
                    isToolbarDisabled ||
                    activeUnitIds.length !== 1 ||
                    selectedCellKeys.size === 0
                  }
                  title={
                    activeUnitIds.length !== 1
                      ? 'Csak egy egység esetén érhető el'
                      : selectedCellKeys.size === 0
                        ? 'Nincs kijelölt cella a kiemeléshez'
                        : undefined
                  }
                  onClick={() => applyHighlightToSelection()}
                >
                  Kiemelés
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  disabled={
                    isToolbarDisabled ||
                    activeUnitIds.length !== 1 ||
                    selectedCellKeys.size === 0
                  }
                  title={
                    activeUnitIds.length !== 1
                      ? 'Csak egy egység esetén érhető el'
                      : selectedCellKeys.size === 0
                        ? 'Nincs kijelölt cella a kiemeléshez'
                        : undefined
                  }
                  onClick={() => applyHighlightToSelection(false)}
                >
                  Kiemelés törlése
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  onClick={handleBulkClearCells}
                  disabled={isToolbarDisabled}
                >
                  Törlés
                </button>
                <button
                  className={`${toolbarButtonClass(false)} ${toolbarButtonDisabledClass} ${toolbarPillBase}`}
                  onClick={clearSelection}
                  disabled={isToolbarDisabled}
                >
                  Kijelölés megszüntetése
                </button>
              </div>
            </div>
          </div>
        </GlassOverlay>
      </div>


      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevWeek}
            className="p-2 rounded-full hover:bg-gray-200"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-center">
            {headerStart?.toLocaleDateString('hu-HU', {
              month: 'long',
              day: 'numeric'
            })}{' '}
            -{' '}
            {headerEnd?.toLocaleDateString('hu-HU', {
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
        <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="flex w-full flex-wrap items-center justify-center gap-3 md:justify-end">
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
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setExportConfirmation({ type: 'PNG' })
                }
                disabled={isPngExporting || isPngExportConfirming}
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
        </div>
      </div>

      {staffWarning && !isAdminUser && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {staffWarning}
        </div>
      )}

      {canManage && showSettings && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: LAYERS.modal }}
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
            <div className="p-4 bg-gray-50 flex justify-between items-center rounded-b-2xl">
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

      <div
        ref={node => {
          tableWrapperRef.current = node;
          exportRef.current = node;
        }}
        className="relative overflow-x-auto rounded-2xl border border-gray-200 shadow-sm"
        style={{
          backgroundColor: 'var(--color-surface-static)',
          color: 'var(--color-text-main)',
          borderColor: 'var(--color-border)',
        }}
      >
        {isSelectionMode && selectionOverlays.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[15]">
            {selectionOverlays.map(overlay => (
              <GlassOverlay
                key={overlay.id}
                interactive={false}
                className="absolute z-[20]"
                style={{
                  position: 'absolute',
                  top: overlay.top,
                  left: overlay.left,
                  width: overlay.width,
                  height: overlay.height,
                }}
              />
            ))}
          </div>
        )}
        <div className={`p-4 grid ${weekBlockGridColumns} gap-4`}>
          {finalWeekBlocksDays.map((week, idx) => renderWeekTable(week, idx))}
        </div>
      </div>

      <BulkTimeModal
        state={bulkTimeModal}
        onClose={() => setBulkTimeModal(null)}
        onApply={handleBulkSetTime}
      />

      {/* Export megerősítő modal */}
      {exportConfirmation && (
        <ExportConfirmationModal
          type={exportConfirmation.type}
          onClose={closeExportWithGuard}
          onExportingChange={isExporting => {
            if (exportConfirmation.type === 'PNG') {
              setIsPngExportConfirming(isExporting);
            }
          }}
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
          pngScale={pngExportScale}
          onScaleChange={setPngExportScale}
          onConfirm={async () => {
            try {
              if (exportConfirmation.type === 'PNG') {
                await handlePngExport(
                  hideEmptyUsersOnExport,
                  pngExportScale
                );
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

      {/* Siker üzenet eltüntetése pár másodperc után */}
      {isToastVisible && successToast && (
        <div
          className={`export-hide fixed bottom-4 right-4 ${isToastExiting ? 'toast-slide-down' : 'toast-slide-up'}`}
          style={{ zIndex: LAYERS.toast }}
        >
          <GlassOverlay
            interactive
            elevation="high"
            className="max-w-xs"
            style={{ padding: 12 }}
          >
            <div className="flex items-start gap-3">
              <span className="text-sm font-semibold text-slate-900">
                {successToast}
              </span>
              <button
                type="button"
                onClick={handleDismissToast}
                className="ml-auto rounded-full p-1 text-slate-600 transition hover:bg-slate-200"
                aria-label="Értesítés bezárása"
              >
                ×
              </button>
            </div>
          </GlassOverlay>
        </div>
      )}
    </div>
  );
};
