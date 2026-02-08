import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Booking,
  ReservationSetting,
  SeatingSettings,
  Table,
  TableCombination,
  User,
  Unit,
  Zone,
} from '../../../core/models/data';
import { db, Timestamp, serverTimestamp } from '../../../core/firebase/config';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  limit,
} from 'firebase/firestore';
import BookingIcon from '../../../../components/icons/BookingIcon';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import AddBookingModal from './AddBookingModal';
import PlusIcon from '../../../../components/icons/PlusIcon';
import SettingsIcon from '../../../../components/icons/SettingsIcon';
import ReservationSettingsModal from './ReservationSettingsModal';
import TrashIcon from '../../../../components/icons/TrashIcon';
import { listTables, listZones, updateReservationSeating } from '../../../core/services/seatingService';
import { getSeatingSettings, listCombinations } from '../../../core/services/seatingAdminService';
import { suggestAllocation } from '../../../core/services/allocation/tableAllocation';
import { suggestSeating } from '../../../core/services/seatingSuggestionService';
import SeatingSettingsModal from './SeatingSettingsModal';
import { recalcReservationCapacityDay } from '../../../core/services/adminCapacityApiService';
import {
  triggerAutoAllocateDay,
  type AutoAllocateDayResult,
} from '../../../core/services/adminAllocationApiService';
import FloorplanViewer from './seating/FloorplanViewer';
import ReservationFloorplanPreview from './reservations/ReservationFloorplanPreview';
import {
  clearOverride,
  getOverride,
  setOverride,
} from '../../../core/services/seating/reservationOverridesService';
import { formatTimeSlot } from '../../utils/timeSlot';

// --- LOG TÍPUS HELYBEN (ha van központi, lehet oda áttenni) ---
type BookingLogType =
  | 'created'
  | 'cancelled'
  | 'updated'
  | 'guest_created'
  | 'guest_cancelled'
  | 'capacity_override'
  | 'admin_seating_updated'
  | 'capacity_recalc'
  | 'allocation_override_set';

interface BookingLog {
  id: string;
  bookingId?: string;
  unitId: string;
  type: BookingLogType;
  createdAt: Timestamp | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  source?: 'internal' | 'guest' | 'admin';
  message: string;
}

type DebugErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  source: 'error-boundary' | 'window:error' | 'window:unhandledrejection';
  time: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  reason?: unknown;
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDebugError(info: DebugErrorInfo) {
  try {
    return [
      `name: ${info.name || 'Error'}`,
      `message: ${info.message || 'Unknown error'}`,
      `source: ${info.source}`,
      `time: ${info.time}`,
      `url: ${info.url}`,
      info.filename ? `file: ${info.filename}` : '',
      typeof info.lineno === 'number' ? `line: ${info.lineno}` : '',
      typeof info.colno === 'number' ? `col: ${info.colno}` : '',
      info.stack ? `stack:\n${info.stack}` : '',
      info.componentStack ? `componentStack:\n${info.componentStack}` : '',
      typeof info.reason !== 'undefined' ? `reason:\n${safeStringify(info.reason)}` : '',
      'hint: open with ?fpdebug=1 and reproduce the issue, then copy this log.',
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return 'Failed to format debug error.';
  }
}

const resolveAllocationReasonLabel = (reason?: string | null) => {
  if (!reason) return 'Nincs elérhető magyarázat.';
  switch (reason) {
    case 'ALLOCATION_DISABLED':
      return 'Az automatikus asztal-kiosztás ki van kapcsolva.';
    case 'NO_FIT':
      return 'Nem találtunk megfelelő szabad asztalt vagy kombinációt.';
    case 'INVALID_PARTY_SIZE':
      return 'Érvénytelen létszám (0 vagy negatív).';
    case 'EMERGENCY_ZONE':
      return 'Vészhelyzeti zóna lett kiválasztva, hogy biztosítsuk a helyet.';
    case 'STALE_ENTITY':
      return 'A korábban kiválasztott asztal vagy zóna már nem elérhető.';
    default:
      return 'A rendszer automatikus döntést hozott a rendelkezésre álló adatok alapján.';
  }
};

interface FoglalasokAppProps {
  currentUser: User;
  canAddBookings: boolean;
  allUnits: Unit[];
  activeUnitIds: string[];
}

class SeatingSettingsErrorBoundary extends React.Component<
  { onError: (info: DebugErrorInfo) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      this.props.onError({
        name: error.name || 'Error',
        message: error.message || 'Unknown error',
        stack: error.stack,
        componentStack: info.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        source: 'error-boundary',
        time: new Date().toISOString(),
      });
    } catch {
      // no-op
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const DeleteConfirmationModal: React.FC<{
  booking: Booking;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ booking, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-md"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">Foglalás törlése</h2>
        </div>
        <div className="p-6 space-y-4">
          <p>
            Biztosan törlöd a(z) <span className="font-bold">{booking.name}</span> nevű
            foglalást erre a napra:{' '}
            <span className="font-bold">
              {booking.startTime.toDate().toLocaleDateString('hu-HU')}
            </span>
            ? A művelet nem vonható vissza.
          </p>
          <div>
            <label
              htmlFor="cancelReason"
              className="text-sm font-medium text-[var(--color-text-main)]"
            >
              Indoklás (opcionális)
            </label>
            <textarea
              id="cancelReason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full mt-1 p-2 border rounded-lg"
              placeholder="Pl. vendég lemondta, dupla foglalás..."
            />
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
            type="button"
            onClick={() => onConfirm(reason)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700"
          >
            Törlés
          </button>
        </div>
      </div>
    </div>
  );
};

const BookingSeatingEditor: React.FC<{
  booking: Booking;
  unitId: string;
  zones: Zone[];
  tables: Table[];
  onSeatingSaved: (update: {
    zoneId: string | null;
    assignedTableIds: string[];
    seatingSource: 'manual';
  }) => void;
}> = ({ booking, unitId, zones, tables, onSeatingSaved }) => {
  const [selectedZoneId, setSelectedZoneId] = useState<string>(booking.zoneId ?? '');
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(
    booking.assignedTableIds ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestSuccess, setSuggestSuccess] = useState<string | null>(null);

  useEffect(() => {
    setSelectedZoneId(booking.zoneId ?? '');
    setSelectedTableIds(booking.assignedTableIds ?? []);
  }, [booking.assignedTableIds, booking.zoneId]);

  const availableTables = useMemo(
    () => tables.filter(table => table.zoneId === selectedZoneId && table.isActive),
    [tables, selectedZoneId]
  );

  const handleZoneChange = (value: string) => {
    setSelectedZoneId(value);
    setSelectedTableIds([]);
  };

  const toggleTable = (tableId: string) => {
    setSelectedTableIds(current =>
      current.includes(tableId)
        ? current.filter(id => id !== tableId)
        : [...current, tableId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await updateReservationSeating(unitId, booking.id, {
        zoneId: selectedZoneId || null,
        assignedTableIds: selectedTableIds,
      });
      onSeatingSaved({
        zoneId: selectedZoneId || null,
        assignedTableIds: selectedTableIds,
        seatingSource: 'manual',
      });
      setSaveSuccess('Ültetés mentve.');
    } catch (err) {
      console.error('Error updating seating:', err);
      setSaveError('Nem sikerült menteni az ültetést.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setSuggestError(null);
    setSuggestSuccess(null);
    try {
      const result = await suggestSeating({
        unitId,
        startTime: booking.startTime.toDate(),
        endTime: booking.endTime.toDate(),
        headcount: booking.headcount,
        bookingId: booking.id,
      });
      if (result.tableIds.length) {
        setSelectedZoneId(result.zoneId ?? '');
        setSelectedTableIds(result.tableIds);
        setSuggestSuccess('Javaslat betöltve.');
      } else {
        setSuggestError('Nincs megfelelő ültetés javaslat.');
      }
    } catch (err) {
      console.error('Error suggesting seating:', err);
      setSuggestError('Nem sikerült ültetést javasolni.');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-3 space-y-3">
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Zóna</label>
        <select
          className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
          value={selectedZoneId}
          onChange={event => handleZoneChange(event.target.value)}
        >
          <option value="">Nincs beállítva</option>
          {zones.map(zone => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)]">Asztalok</label>
        <div className="mt-2 space-y-2">
          {!selectedZoneId && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Előbb válassz zónát.
            </p>
          )}
          {selectedZoneId && !availableTables.length && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Ebben a zónában nincs aktív asztal.
            </p>
          )}
          {selectedZoneId &&
            availableTables.map(table => {
              const minCapacity = table.minCapacity ?? 1;
              const maxCapacity = table.capacityMax ?? 2;

              return (
                <label key={table.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTableIds.includes(table.id)}
                    onChange={() => toggleTable(table.id)}
                    className="h-4 w-4"
                  />
                  <span>
                    {table.name} (min {minCapacity} – max {maxCapacity} fő)
                  </span>
                </label>
              );
            })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--color-primary)] text-white disabled:opacity-60"
        >
          {isSaving ? 'Mentés...' : 'Mentés'}
        </button>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={isSuggesting}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-[var(--color-text-main)] disabled:opacity-60"
        >
          {isSuggesting ? 'Javaslat...' : 'Javaslat'}
        </button>
        {saveSuccess && <span className="text-xs text-green-600">{saveSuccess}</span>}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
        {suggestSuccess && <span className="text-xs text-green-600">{suggestSuccess}</span>}
        {suggestError && <span className="text-xs text-red-600">{suggestError}</span>}
      </div>
    </div>
  );
};

const resolveSeatingPreferenceLabel = (value?: Booking['seatingPreference']) => {
  if (!value || value === 'any') return 'Nincs megadva';
  if (value === 'bar') return 'Bár';
  if (value === 'table') return 'Asztal';
  if (value === 'outdoor') return 'Terasz';
  return 'Nincs megadva';
};

const TIME_SLOT_LOCALE = 'hu' as const;

type AllocationConflict = {
  bookingId: string;
  bookingName: string;
  overlapLabel: string;
  tableIds: string[];
};

const computeAllocationConflicts = (
  targetBooking: Booking,
  candidateTableIds: string[],
  dayBookings: Booking[],
  bufferMinutes: number
): AllocationConflict[] => {
  if (!candidateTableIds.length) {
    return [];
  }

  const targetStart = targetBooking.startTime?.toDate?.() ?? null;
  const targetEnd = targetBooking.endTime?.toDate?.() ?? null;
  if (!targetStart || !targetEnd) {
    return [];
  }

  const bufferMs = bufferMinutes * 60 * 1000;
  const candidateSet = new Set(candidateTableIds);
  const conflicts: Array<AllocationConflict & { sortTime: number }> = [];

  dayBookings.forEach(other => {
    if (other.id === targetBooking.id) {
      return;
    }
    const otherTableIds = other.assignedTableIds ?? [];
    if (!otherTableIds.length) {
      return;
    }
    const otherStart = other.startTime?.toDate?.() ?? null;
    const otherEnd = other.endTime?.toDate?.() ?? null;
    if (!otherStart || !otherEnd) {
      return;
    }
    const otherStartAdj = new Date(otherStart.getTime() - bufferMs);
    const otherEndAdj = new Date(otherEnd.getTime() + bufferMs);
    if (!(targetStart < otherEndAdj && targetEnd > otherStartAdj)) {
      return;
    }
    const overlapTables = otherTableIds.filter(tableId => candidateSet.has(tableId));
    if (!overlapTables.length) {
      return;
    }
    const overlapLabel = `${otherStart.toLocaleTimeString('hu-HU', {
      hour: '2-digit',
      minute: '2-digit',
    })}–${otherEnd.toLocaleTimeString('hu-HU', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    conflicts.push({
      bookingId: other.id,
      bookingName: other.name,
      overlapLabel,
      tableIds: overlapTables,
      sortTime: otherStart.getTime(),
    });
  });

  return conflicts
    .sort((a, b) => {
      if (a.sortTime !== b.sortTime) {
        return a.sortTime - b.sortTime;
      }
      return a.bookingName.localeCompare(b.bookingName);
    })
    .map(({ sortTime, ...rest }) => rest);
};

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const AllocationPanel: React.FC<{
  booking: Booking;
  unitId: string;
  zones: Zone[];
  tables: Table[];
  combinations: TableCombination[];
  seatingSettings: SeatingSettings;
  dayBookings: Booking[];
  onClose?: () => void;
}> = ({
  booking,
  unitId,
  zones,
  tables,
  combinations,
  seatingSettings,
  dayBookings,
  onClose,
}) => {
  const [zoneId, setZoneId] = useState<string>('');
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [note, setNote] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [confirmSaveOnConflict, setConfirmSaveOnConflict] = useState(false);
  const [isFloorplanOverride, setIsFloorplanOverride] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setSaveError(null);
    getOverride(unitId, booking.id)
      .then(data => {
        if (!isMounted) return;
        setZoneId(data?.forcedZoneId ?? '');
        setTableIds(data?.forcedTableIds ?? []);
        setNote(data?.note ?? '');
      })
      .catch(err => {
        console.error('Error loading allocation override:', err);
        if (isMounted) {
          setSaveError('Nem sikerült betölteni az override adatokat.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [booking.id, unitId]);

  const availableTables = useMemo(
    () => tables.filter(table => table.zoneId === zoneId && table.isActive),
    [tables, zoneId]
  );
  const tableIdsByZone = useMemo(() => {
    const map = new Map<string, Set<string>>();
    tables.forEach(table => {
      if (!table.isActive) {
        return;
      }
      if (!map.has(table.zoneId)) {
        map.set(table.zoneId, new Set());
      }
      map.get(table.zoneId)!.add(table.id);
    });
    return map;
  }, [tables]);

  const tableNameById = useMemo(
    () => new Map(tables.map(table => [table.id, table.name ?? table.id])),
    [tables]
  );
  const zoneNameById = useMemo(
    () => new Map(zones.map(zone => [zone.id, zone.name ?? zone.id])),
    [zones]
  );

  const suggestion = useMemo(() => {
    const bookingDate =
      booking.startTime && typeof booking.startTime.toDate === 'function'
        ? booking.startTime.toDate()
        : undefined;
    return suggestAllocation({
      partySize: booking.headcount,
      bookingDate,
      seatingSettings,
      zones,
      tables,
      tableCombinations: combinations,
      override: {
        forcedZoneId: zoneId || undefined,
        forcedTableIds: tableIds.length ? tableIds : undefined,
      },
    });
  }, [
    booking.headcount,
    booking.startTime,
    seatingSettings,
    zones,
    tables,
    combinations,
    zoneId,
    tableIds,
  ]);
  const bufferMinutes = seatingSettings.bufferMinutes ?? 15;
  const suggestionConflicts = useMemo(
    () =>
      suggestion.tableIds.length
        ? computeAllocationConflicts(booking, suggestion.tableIds, dayBookings, bufferMinutes)
        : [],
    [
      booking.id,
      booking.startTime,
      booking.endTime,
      suggestion.tableIds,
      dayBookings,
      bufferMinutes,
    ]
  );
  const selectionConflicts = useMemo(
    () =>
      tableIds.length
        ? computeAllocationConflicts(booking, tableIds, dayBookings, bufferMinutes)
        : [],
    [
      booking.id,
      booking.startTime,
      booking.endTime,
      tableIds,
      dayBookings,
      bufferMinutes,
    ]
  );

  const toggleTable = (tableId: string) => {
    setSaveError(null);
    setSaveSuccess(null);
    setConfirmSaveOnConflict(false);
    setTableIds(current =>
      current.includes(tableId)
        ? current.filter(id => id !== tableId)
        : [...current, tableId]
    );
  };

  const handleZonePick = (nextZoneId: string) => {
    setSaveError(null);
    setSaveSuccess(null);
    setConfirmSaveOnConflict(false);
    setZoneId(nextZoneId);
    if (!nextZoneId) {
      setTableIds([]);
      return;
    }
    const allowedTableIds = tableIdsByZone.get(nextZoneId) ?? new Set();
    setTableIds(current => current.filter(tableId => allowedTableIds.has(tableId)));
  };

  const handleTablePick = (table: Table) => {
    setSaveError(null);
    setSaveSuccess(null);
    setConfirmSaveOnConflict(false);
    if (!table.isActive) {
      return;
    }
    if (zoneId && table.zoneId !== zoneId) {
      setZoneId(table.zoneId);
      setTableIds([table.id]);
      return;
    }
    if (!zoneId) {
      setZoneId(table.zoneId);
      setTableIds([table.id]);
      return;
    }
    setTableIds(current =>
      current.includes(table.id)
        ? current.filter(id => id !== table.id)
        : [...current, table.id]
    );
  };

  const handleClear = async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setConfirmSaveOnConflict(false);
    try {
      await clearOverride(unitId, booking.id);
      setZoneId('');
      setTableIds([]);
      setNote('');
      setSaveSuccess('Allocation override törölve.');
      onClose?.();
    } catch (err) {
      console.error('Error clearing allocation override:', err);
      setSaveError('Nem sikerült törölni az allocation override-ot.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleForceSave = async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    if (tableIds.length > 0 && !zoneId) {
      setIsSaving(false);
      setSaveError('Asztalokhoz zóna megadása kötelező.');
      setConfirmSaveOnConflict(false);
      return;
    }
    if (zoneId && tableIds.length > 0) {
      const allowedTableIds = tableIdsByZone.get(zoneId) ?? new Set();
      const invalidTableIds = tableIds.filter(tableId => !allowedTableIds.has(tableId));
      if (invalidTableIds.length > 0) {
        setIsSaving(false);
        setSaveError('A kiválasztott asztalok nem tartoznak a megadott zónához.');
        setConfirmSaveOnConflict(false);
        return;
      }
    }
    if (!zoneId && tableIds.length === 0 && !note.trim()) {
      setIsSaving(false);
      setSaveError('Adj meg legalább egy mezőt az override-hoz.');
      setConfirmSaveOnConflict(false);
      return;
    }
    try {
      await setOverride(unitId, booking.id, {
        forcedZoneId: zoneId || undefined,
        forcedTableIds: tableIds.length ? tableIds : undefined,
        note: note.trim() || undefined,
      });
      setSaveSuccess('Allocation override mentve.');
      setConfirmSaveOnConflict(false);
      onClose?.();
    } catch (err) {
      console.error('Error saving allocation override:', err);
      setSaveError('Nem sikerült menteni az allocation override-ot.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) {
      return;
    }
    if (selectionConflicts.length > 0 && !confirmSaveOnConflict) {
      setConfirmSaveOnConflict(true);
      return;
    }
    await handleForceSave();
  };

  const suggestionZoneLabel = suggestion.zoneId
    ? zoneNameById.get(suggestion.zoneId) ?? suggestion.zoneId
    : '—';
  const suggestionTableLabels =
    suggestion.tableIds.length > 0
      ? suggestion.tableIds.map(id => tableNameById.get(id) ?? id).join(', ')
      : '—';

  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-3 space-y-3">
      <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">Javaslat:</span>{' '}
          {suggestionZoneLabel} • {suggestionTableLabels}
        </div>
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">Indoklás:</span>{' '}
          {suggestion.reason} • {Math.round(suggestion.confidence * 100)}%
        </div>
        {suggestionConflicts.length > 0 && (
          <div className="text-amber-600 space-y-1">
            <div className="font-semibold">⚠️ Javaslat ütközik</div>
            <ul className="list-disc list-inside space-y-0.5">
              {suggestionConflicts.map(conflict => (
                <li
                  key={`${conflict.bookingId}-${conflict.overlapLabel}-${conflict.tableIds.join(
                    ','
                  )}`}
                >
                  {conflict.bookingName} ({conflict.overlapLabel}) –{' '}
                  {conflict.tableIds
                    .map(tableId => tableNameById.get(tableId) ?? tableId)
                    .join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:underline"
          onClick={() => {
            setSaveError(null);
            setSaveSuccess(null);
            setConfirmSaveOnConflict(false);
            if (!suggestion.zoneId) {
              if (suggestion.tableIds.length > 0) {
                setSaveError('A javaslat nem tartalmaz zónát.');
                return;
              }
              setSaveError('Nincs alkalmazható javaslat.');
              return;
            }
            const allowedTableIds = tableIdsByZone.get(suggestion.zoneId) ?? new Set();
            const filteredTableIds = suggestion.tableIds.filter(tableId =>
              allowedTableIds.has(tableId)
            );
            if (!filteredTableIds.length) {
              setSaveError('Nincs alkalmazható javaslat.');
              return;
            }
            handleZonePick(suggestion.zoneId);
            setTableIds(filteredTableIds);
          }}
        >
          Javaslat alkalmazása
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white/70">
        <button
          type="button"
          className="w-full text-left px-3 py-2 text-xs font-semibold"
          onClick={() => setIsFloorplanOverride(current => !current)}
        >
          {isFloorplanOverride ? 'Térképes kijelölés bezárása' : 'Térképes kijelölés'}
        </button>
        {isFloorplanOverride && (
          <div className="px-3 pb-3">
            <FloorplanViewer
              unitId={unitId}
              highlightTableIds={tableIds}
              highlightZoneId={zoneId || null}
              onZoneClick={handleZonePick}
              onTableClick={handleTablePick}
            />
          </div>
        )}
      </div>
      {selectionConflicts.length > 0 && (
        <div className="text-xs text-amber-600 space-y-1">
          <div className="font-semibold">⚠️ Kiválasztott asztalok ütköznek</div>
          <ul className="list-disc list-inside space-y-0.5">
            {selectionConflicts.map(conflict => (
              <li
                key={`${conflict.bookingId}-${conflict.overlapLabel}-${conflict.tableIds.join(
                  ','
                )}`}
              >
                {conflict.bookingName} ({conflict.overlapLabel}) –{' '}
                {conflict.tableIds
                  .map(tableId => tableNameById.get(tableId) ?? tableId)
                  .join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Zóna
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
            value={zoneId}
            onChange={event => {
              setSaveError(null);
              setSaveSuccess(null);
              setConfirmSaveOnConflict(false);
              handleZonePick(event.target.value);
            }}
            disabled={isLoading}
          >
            <option value="">Nincs beállítva</option>
            {zones.map(zone => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Megjegyzés
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm"
            value={note}
            onChange={event => {
              setSaveError(null);
              setSaveSuccess(null);
              setConfirmSaveOnConflict(false);
              setNote(event.target.value);
            }}
            placeholder="Override megjegyzés"
            disabled={isLoading}
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-[var(--color-text-secondary)]">
          Asztalok
        </label>
        <div className="mt-2 space-y-2">
          {!zoneId && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Előbb válassz zónát.
            </p>
          )}
          {zoneId && availableTables.length === 0 && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Ebben a zónában nincs aktív asztal.
            </p>
          )}
          {zoneId &&
            availableTables.map(table => (
              <label key={table.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tableIds.includes(table.id)}
                  onChange={() => toggleTable(table.id)}
                  disabled={isLoading}
                />
                <span>{table.name}</span>
              </label>
            ))}
        </div>
      </div>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {saveSuccess && <p className="text-xs text-green-600">{saveSuccess}</p>}
      {confirmSaveOnConflict && (
        <div className="text-xs text-amber-600 space-y-2">
          <div className="font-semibold">⚠️ Ütközés van. Biztosan mented?</div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white disabled:opacity-50"
              onClick={() => void handleForceSave()}
              disabled={isSaving || isLoading}
            >
              Mentés mégis
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-[var(--color-text-main)] disabled:opacity-50"
              onClick={() => setConfirmSaveOnConflict(false)}
              disabled={isSaving || isLoading}
            >
              Mégse
            </button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
          disabled={isSaving || isLoading}
        >
          {isSaving ? 'Mentés...' : 'Mentés'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-[var(--color-text-main)] disabled:opacity-50"
          disabled={isSaving || isLoading}
        >
          Törlés
        </button>
      </div>
    </div>
  );
};

const SectionCard: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, actions, children }) => (
  <div
    className="rounded-xl border border-gray-100 p-3 space-y-2"
    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text-main)]">{title}</h3>
        {description && (
          <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const CollapsibleSection: React.FC<{
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, description, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-xl border border-gray-100 p-3 space-y-2"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
    >
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="w-full text-left flex items-center justify-between gap-2"
      >
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-main)]">{title}</h3>
          {description && (
            <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-secondary)]">
          {open ? 'Bezár' : 'Megnyit'}
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
};

type BookingDetailSection = 'summary' | 'allocation' | 'seating' | 'capacity' | 'logs';

const BookingDetailTabs: React.FC<{
  active: BookingDetailSection;
  onChange: (section: BookingDetailSection) => void;
  isAdmin: boolean;
}> = ({ active, onChange, isAdmin }) => {
  const tabs: { id: BookingDetailSection; label: string }[] = [
    { id: 'summary', label: 'Összefoglaló' },
    { id: 'allocation', label: 'Allokáció' },
    { id: 'seating', label: 'Ültetés' },
    { id: 'capacity', label: 'Kapacitás' },
    { id: 'logs', label: 'Napló' },
  ];

  const visibleTabs = tabs.filter(tab => isAdmin || !['seating', 'capacity'].includes(tab.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleTabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border"
          style={{
            backgroundColor:
              active === tab.id ? 'var(--color-primary)' : 'var(--color-surface)',
            color:
              active === tab.id ? 'var(--color-surface)' : 'var(--color-text-secondary)',
            borderColor:
              active === tab.id ? 'var(--color-primary)' : 'var(--color-border, #e5e7eb)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

const BookingHeaderMini: React.FC<{ booking: Booking }> = ({ booking }) => (
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-sm font-semibold text-[var(--color-text-main)]">
        {booking.name} ({booking.headcount} fő)
      </p>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {booking.startTime
          .toDate()
          .toLocaleTimeString('hu-HU', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
        -{' '}
        {booking.endTime.toDate().toLocaleTimeString('hu-HU', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
    <div className="flex items-center gap-2">
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-gray-100 text-gray-600">
        {booking.status || '—'}
      </span>
      {booking.allocationOverride?.enabled && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-amber-100 text-amber-800">
          OVERRIDE
        </span>
      )}
      {booking.allocationFinal?.locked && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-gray-200 text-gray-700">
          ZÁROLT
        </span>
      )}
    </div>
  </div>
);

const BookingSummaryCard: React.FC<{
  booking: Booking;
  resolveSeatingPreferenceLabel: (value?: Booking['seatingPreference']) => string;
}> = ({ booking, resolveSeatingPreferenceLabel }) => (
  <SectionCard title="Összefoglaló">
    <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
      <div className="grid gap-1 md:grid-cols-2">
        <p>Alkalom: {booking.occasion || '—'}</p>
        <p>Forrás: {booking.source || '—'}</p>
      </div>
      {booking.notes && <p>Megjegyzés: {booking.notes}</p>}
      <div className="grid gap-1 md:grid-cols-2">
        <p>
          Preferált idősáv: {booking.preferredTimeSlot || 'Nincs megadva'}
        </p>
        <p>
          Ülés preferencia: {resolveSeatingPreferenceLabel(booking.seatingPreference)}
        </p>
      </div>
    </div>
  </SectionCard>
);

const AllocationDecisionChain: React.FC<{
  booking: Booking;
  resolveZoneName: (zoneId?: string | null) => string;
  resolveTableNames: (tableIds?: string[]) => string;
}> = ({ booking, resolveZoneName, resolveTableNames }) => {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const intentLabel =
    booking.allocationIntent?.timeSlot ||
    booking.allocationIntent?.zoneId ||
    booking.allocationIntent?.tableGroup
      ? `timeSlot=${formatTimeSlot(booking.allocationIntent?.timeSlot, {
          mode: 'raw+label',
          locale: TIME_SLOT_LOCALE,
        })}, zoneId=${booking.allocationIntent?.zoneId || '—'}, tableGroup=${
          booking.allocationIntent?.tableGroup || '—'
        }`
      : 'Nincs adat';
  const overrideLabel = booking.allocationOverride?.enabled
    ? `zoneId=${booking.allocationOverride.zoneId || '—'}, tableIds=${
        booking.allocationOverride.tableIds?.length
          ? booking.allocationOverride.tableIds.join(', ')
          : '—'
      }, note=${booking.allocationOverride.note || '—'}`
    : 'Nincs override';
  const allocationReason =
    booking.allocated?.diagnosticsSummary ||
    booking.allocationDiagnostics?.reasons?.[0] ||
    null;
  const allocationReasonLabel = resolveAllocationReasonLabel(allocationReason);
  const finalLabel = booking.allocationFinal
    ? `source=${booking.allocationFinal.source || '—'}, timeSlot=${formatTimeSlot(
        booking.allocationFinal.timeSlot,
        {
          mode: 'raw+label',
          locale: TIME_SLOT_LOCALE,
        }
      )}, zoneId=${booking.allocationFinal.zoneId || '—'}, tableGroup=${
        booking.allocationFinal.tableGroup || '—'
      }, tableIds=${
        booking.allocationFinal.tableIds?.length
          ? booking.allocationFinal.tableIds.join(', ')
          : '—'
      }`
    : 'Nincs adat';

  return (
    <SectionCard
      title="Allokáció döntési lánc"
      description="Intent → override → final → allocated"
    >
      {(booking.allocationFinal?.locked || booking.allocationOverride?.enabled) && (
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase text-[var(--color-text-secondary)]">
          {booking.allocationFinal?.locked && (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-700">
              Zárolt
            </span>
          )}
          {booking.allocationOverride?.enabled && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              Override aktív
            </span>
          )}
        </div>
      )}
      <div className="grid gap-2 text-xs text-[var(--color-text-secondary)]">
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">
            Intent:
          </span>{' '}
          {intentLabel}
        </div>
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">
            Override:
          </span>{' '}
          {overrideLabel}
        </div>
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">
            Final:
          </span>{' '}
          {finalLabel}
        </div>
        {booking.allocated ? (
          <div>
            <span className="font-semibold text-[var(--color-text-main)]">
              Allocated:
            </span>{' '}
            {`zone=${resolveZoneName(
              booking.allocated.zoneId
            )}, tables=${resolveTableNames(
              booking.allocated.tableIds
            )}, strategy=${booking.allocated.strategy || '—'}`}
          </div>
        ) : (
          <div>
            <span className="font-semibold text-[var(--color-text-main)]">
              Allocated:
            </span>{' '}
            Nincs adat
          </div>
        )}
        <div>
          <span className="font-semibold text-[var(--color-text-main)]">
            Miért itt?
          </span>{' '}
          {allocationReason ? `${allocationReason} — ${allocationReasonLabel}` : allocationReasonLabel}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDiagnosticsOpen(current => !current)}
        className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
      >
        {diagnosticsOpen ? 'Diagnosztika elrejtése' : 'Diagnosztika megnyitása'}
      </button>
      {diagnosticsOpen && (
        <div className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">
          <div>
            <span className="font-semibold text-[var(--color-text-main)]">
              Diagnostics:
            </span>{' '}
            {booking.allocationDiagnostics
              ? `quality=${booking.allocationDiagnostics.intentQuality || '—'}, reasons=${
                  booking.allocationDiagnostics.reasons?.length
                    ? booking.allocationDiagnostics.reasons.join(', ')
                    : '—'
                }, warnings=${
                  booking.allocationDiagnostics.warnings?.length
                    ? booking.allocationDiagnostics.warnings.join(', ')
                    : '—'
                }`
              : 'Nincs adat'}
          </div>
          {booking.allocated?.diagnosticsSummary && (
            <div>
              <span className="font-semibold text-[var(--color-text-main)]">
                Summary:
              </span>{' '}
              {booking.allocated.diagnosticsSummary}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
};

const BookingSeatingPanel: React.FC<{
  booking: Booking;
  unitId: string;
  zones: Zone[];
  tables: Table[];
  highlightTableIds: string[];
  highlightZoneId: string | null;
  isFloorplanOpen: boolean;
  onToggleFloorplan: () => void;
  onSeatingSaved: (update: {
    zoneId: string | null;
    assignedTableIds: string[];
    seatingSource: 'manual';
  }) => void;
}> = ({
  booking,
  unitId,
  zones,
  tables,
  highlightTableIds,
  highlightZoneId,
  isFloorplanOpen,
  onToggleFloorplan,
  onSeatingSaved,
}) => (
  <SectionCard
    title="Ültetés"
    description="Asztalok kiosztása és ellenőrzés az asztaltérképen."
  >
    <div className="rounded-lg border border-gray-200 bg-white/70">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          onToggleFloorplan();
        }}
        className="w-full text-left px-3 py-2 text-sm font-semibold"
      >
        {isFloorplanOpen ? 'Asztaltérkép bezárása' : 'Asztaltérkép'}
      </button>
      {isFloorplanOpen && (
        <div className="px-3 pb-3">
          <FloorplanViewer
            unitId={unitId}
            highlightTableIds={highlightTableIds}
            highlightZoneId={highlightZoneId}
          />
        </div>
      )}
    </div>
    <BookingSeatingEditor
      booking={booking}
      unitId={unitId}
      zones={zones}
      tables={tables}
      onSeatingSaved={onSeatingSaved}
    />
  </SectionCard>
);

const BookingDetailsModal: React.FC<{
  selectedDate: Date;
  bookings: Booking[];
  onClose: () => void;
  onSelectBooking?: (bookingId: string | null) => void;
  isAdmin: boolean;
  onDelete: (booking: Booking) => void;
  unitId: string;
  zones: Zone[];
  tables: Table[];
  combinations: TableCombination[];
  seatingSettings: SeatingSettings | null;
  onSeatingSaved: (bookingId: string, update: {
    zoneId: string | null;
    assignedTableIds: string[];
    seatingSource: 'manual';
  }) => void;
}> = ({
  selectedDate,
  bookings,
  onClose,
  onSelectBooking,
  isAdmin,
  onDelete,
  unitId,
  zones,
  tables,
  combinations,
  seatingSettings,
  onSeatingSaved,
}) => {
  const [isRecalcRunning, setIsRecalcRunning] = useState(false);
  const [recalcMessage, setRecalcMessage] = useState<string | null>(null);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [dayLogs, setDayLogs] = useState<BookingLog[]>([]);
  const [dayLogsLoading, setDayLogsLoading] = useState(true);
  const [openAllocationId, setOpenAllocationId] = useState<string | null>(null);
  const [openFloorplanBookingId, setOpenFloorplanBookingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<BookingDetailSection>('summary');
  const zoneNameById = useMemo(
    () => new Map(zones.map(zone => [zone.id, zone.name || zone.id])),
    [zones]
  );
  const tableNameById = useMemo(
    () => new Map(tables.map(table => [table.id, table.name || table.id])),
    [tables]
  );
  const resolveZoneName = (zoneId?: string | null) =>
    zoneId ? zoneNameById.get(zoneId) ?? zoneId : '—';
  const resolveTableNames = (tableIds?: string[]) =>
    tableIds?.length
      ? tableIds.map(id => tableNameById.get(id) ?? id).join(', ')
      : '—';

  const dateKey = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, [selectedDate]);

  useEffect(() => {
    setOpenAllocationId(null);
    setOpenFloorplanBookingId(null);
    setActiveSection('summary');
  }, [dateKey]);

  const handleClose = useCallback(() => {
    setOpenAllocationId(null);
    setOpenFloorplanBookingId(null);
    setActiveSection('summary');
    onSelectBooking?.(null);
    onClose();
  }, [onClose, onSelectBooking]);

  const handleRecalcCapacity = async () => {
    if (!unitId || !dateKey) {
      setRecalcError('Hiányzó egység vagy dátum.');
      return;
    }
    setIsRecalcRunning(true);
    setRecalcMessage(null);
    setRecalcError(null);
    try {
      await recalcReservationCapacityDay(unitId, dateKey);
      setRecalcMessage('Napi kapacitás újraszámolva.');
    } catch (err) {
      console.error('Error recalculating capacity:', err);
      setRecalcError('Nem sikerült újraszámolni a kapacitást.');
    } finally {
      setIsRecalcRunning(false);
    }
  };

  useEffect(() => {
    if (!unitId) {
      setDayLogs([]);
      setDayLogsLoading(false);
      return;
    }

    setDayLogsLoading(true);
    const logsRef = collection(db, 'units', unitId, 'reservation_logs');
    const allowedTypes: BookingLogType[] = [
      'created',
      'cancelled',
      'updated',
      'guest_created',
      'guest_cancelled',
      'capacity_override',
      'admin_seating_updated',
      'capacity_recalc',
      'allocation_override_set',
    ];

    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    const mapLogs = (snapshot: { docs: { id: string; data: () => any }[] }) =>
      snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          bookingId: typeof data.bookingId === 'string' ? data.bookingId : undefined,
          unitId: typeof data.unitId === 'string' ? data.unitId : unitId,
          type: allowedTypes.includes(data.type) ? data.type : 'updated',
          createdAt: data.createdAt ?? null,
          createdByUserId: data.createdByUserId ?? null,
          createdByName: data.createdByName ?? null,
          source: data.source,
          message: typeof data.message === 'string' ? data.message : '',
        } as BookingLog;
      });

    let unsub = () => {};

    const qDayLogs = query(
      logsRef,
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    unsub = onSnapshot(
      qDayLogs,
      snapshot => {
        setDayLogs(mapLogs(snapshot));
        setDayLogsLoading(false);
      },
      err => {
        console.error('Error fetching day logs:', err);
        setDayLogsLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, [dateKey, selectedDate, unitId]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">
            {selectedDate.toLocaleDateString('hu-HU', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-200"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          <SectionCard
            title="Foglalás részletek"
            description="Összefoglaló, allokáció, ültetés, kapacitás és napló."
          >
            <BookingDetailTabs
              active={activeSection}
              onChange={setActiveSection}
              isAdmin={isAdmin}
            />
          </SectionCard>
          {activeSection === 'capacity' && isAdmin && (
            <SectionCard title="Kapacitás" description="Napi kapacitás műveletek">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRecalcCapacity}
                  disabled={isRecalcRunning}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-[var(--color-text-main)] hover:bg-gray-300 disabled:opacity-60"
                >
                  {isRecalcRunning ? 'Újraszámolás...' : 'Napi kapacitás újraszámolása'}
                </button>
                {recalcMessage && (
                  <span className="text-xs text-green-600">{recalcMessage}</span>
                )}
                {recalcError && (
                  <span className="text-xs text-red-600">{recalcError}</span>
                )}
              </div>
            </SectionCard>
          )}
          {activeSection === 'logs' && (
            <SectionCard title="Napi napló" description="Az adott naphoz tartozó események">
              {dayLogsLoading ? (
                <div className="text-xs text-[var(--color-text-secondary)]">Betöltés...</div>
              ) : dayLogs.length ? (
                <div className="space-y-2 text-xs max-h-40 overflow-y-auto">
                  {dayLogs.map(log => {
                    const createdDate =
                      typeof log.createdAt?.toDate === 'function'
                        ? log.createdAt.toDate()
                        : log.createdAt instanceof Date
                        ? log.createdAt
                        : null;
                    const created = createdDate
                      ? createdDate.toLocaleString('hu-HU', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—';

                    const dotClass =
                      log.type === 'cancelled' || log.type === 'guest_cancelled'
                        ? 'bg-red-500'
                        : log.type === 'guest_created'
                        ? 'bg-green-500'
                        : log.type === 'capacity_override'
                        ? 'bg-blue-500'
                        : log.type === 'admin_seating_updated'
                        ? 'bg-blue-500'
                        : log.type === 'capacity_recalc'
                        ? 'bg-purple-500'
                        : 'bg-blue-500';

                    const message =
                      log.message ||
                      (log.type === 'capacity_override'
                        ? 'Napi limit módosítva.'
                        : 'Ismeretlen naplóbejegyzés');

                    return (
                      <div
                        key={log.id}
                        className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`inline-block w-2 h-2 rounded-full mt-1 ${dotClass}`}
                          />
                          <div className="space-y-0.5">
                            <div className="text-[var(--color-text-main)]">{message}</div>
                            {log.createdByName && (
                              <div className="text-[11px] text-[var(--color-text-secondary)]">
                                {log.createdByName} ({log.source === 'guest' ? 'vendég' : 'belső'})
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
                          {created}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-[var(--color-text-secondary)]">
                  Nincsenek naplóbejegyzések erre a napra.
                </div>
              )}
            </SectionCard>
          )}
          {bookings.length > 0 ? (
            bookings
              .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis())
              .map(booking => {
                const highlightTableIds = booking.assignedTableIds ?? [];
                const highlightZoneId = booking.zoneId ?? null;
                const isFloorplanOpen = openFloorplanBookingId === booking.id;

                return (
                  <div
                    key={booking.id}
                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative group"
                    style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                    onClick={() => onSelectBooking?.(booking.id)}
                  >
                    <div className="space-y-4">
                      <BookingHeaderMini booking={booking} />
                      {activeSection === 'summary' && (
                        <BookingSummaryCard
                          booking={booking}
                          resolveSeatingPreferenceLabel={resolveSeatingPreferenceLabel}
                        />
                      )}
                      {activeSection === 'allocation' && (
                        <>
                          <AllocationDecisionChain
                            booking={booking}
                            resolveZoneName={resolveZoneName}
                            resolveTableNames={resolveTableNames}
                          />
                          {isAdmin && seatingSettings?.allocationEnabled && (
                            <SectionCard title="Allokáció override">
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  setOpenAllocationId(current =>
                                    current === booking.id ? null : booking.id
                                  );
                                }}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-[var(--color-text-main)]"
                              >
                                {openAllocationId === booking.id
                                  ? 'Allokáció bezárása'
                                  : 'Allokáció'}
                              </button>
                              {openAllocationId === booking.id && seatingSettings && (
                                <AllocationPanel
                                  booking={booking}
                                  unitId={unitId}
                                  zones={zones}
                                  tables={tables}
                                  combinations={combinations}
                                  seatingSettings={seatingSettings}
                                  dayBookings={bookings}
                                  onClose={() => setOpenAllocationId(null)}
                                />
                              )}
                            </SectionCard>
                          )}
                        </>
                      )}
                      {activeSection === 'seating' &&
                        (isAdmin ? (
                          <BookingSeatingPanel
                            booking={booking}
                            unitId={unitId}
                            zones={zones}
                            tables={tables}
                            highlightTableIds={highlightTableIds}
                            highlightZoneId={highlightZoneId}
                            isFloorplanOpen={isFloorplanOpen}
                            onToggleFloorplan={() =>
                              setOpenFloorplanBookingId(current =>
                                current === booking.id ? null : booking.id
                              )
                            }
                            onSeatingSaved={update => onSeatingSaved(booking.id, update)}
                          />
                        ) : (
                          <SectionCard title="Ültetés">
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              Ültetés szerkesztéséhez admin hozzáférés szükséges.
                            </p>
                          </SectionCard>
                        ))}
                    </div>
                  {isAdmin && (
                    <button
                      onClick={event => {
                        event.stopPropagation();
                        onDelete(booking);
                      }}
                      className="absolute top-3 right-3 p-2 text-gray-400 rounded-full opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-secondary)',
                        opacity: 0.85,
                      }}
                      title="Foglalás törlése"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
                );
              })
          ) : (
            <p className="text-[var(--color-text-secondary)]">Erre a napra nincsenek foglalások.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- LOG LISTA KOMPONENS ---
const LogsPanel: React.FC<{ logs: BookingLog[] }> = ({ logs }) => {
  if (!logs.length) {
    return (
      <div
        className="mt-6 rounded-2xl shadow border border-gray-100 p-4 text-sm"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
      >
        Nincsenek még naplóbejegyzések.
      </div>
    );
  }

  const getDotClass = (log: BookingLog) => {
    if (log.type === 'cancelled' || log.type === 'guest_cancelled') {
      // piros – törlés / lemondás
      return 'bg-red-500';
    }
    if (log.type === 'guest_created') {
      // zöld – vendég foglalta
      return 'bg-green-500';
    }
    if (log.type === 'capacity_override') {
      return 'bg-blue-500';
    }
    if (log.type === 'admin_seating_updated') {
      return 'bg-blue-500';
    }
    if (log.type === 'capacity_recalc') {
      return 'bg-purple-500';
    }
    if (log.type === 'allocation_override_set') {
      return 'bg-purple-500';
    }
    // kék – admin / belső
    return 'bg-blue-500';
  };

  return (
    <div
      className="mt-6 rounded-2xl shadow border border-gray-100 p-4"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
    >
      <h2 className="text-lg font-bold text-[var(--color-text-main)] mb-3">Foglalási napló</h2>
      <div className="space-y-2 max-h-72 overflow-y-auto text-sm">
        {logs.map(log => {
          const createdDate =
            typeof log.createdAt?.toDate === 'function'
              ? log.createdAt.toDate()
              : log.createdAt instanceof Date
              ? log.createdAt
              : null;
          const created = createdDate
            ? createdDate.toLocaleString('hu-HU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—';

          const dotClass = getDotClass(log);

          const message =
            log.message ||
            (log.type === 'capacity_override'
              ? 'Napi limit módosítva.'
              : 'Ismeretlen naplóbejegyzés');

          return (
            <div
              key={log.id}
              className="flex flex-col border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
            >
              <div className="flex justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`}
                  />
                  <span className="font-medium text-[var(--color-text-main)]">
                    {message}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
                  {created}
                </span>
              </div>
              {log.createdByName && (
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {log.createdByName} ({log.source === 'guest' ? 'vendég' : 'belső'})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FoglalasokApp: React.FC<FoglalasokAppProps> = ({
  currentUser,
  canAddBookings,
  allUnits,
  activeUnitIds,
}) => {
  // Manual allocation state machine & booking focus flow:
  // - Booking click focuses selection + programmatic timeline jump.
  // - Manual mode locks navigation, stages table selection, confirms via override API.
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logs, setLogs] = useState<BookingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableCombinations, setTableCombinations] = useState<TableCombination[]>([]);
  const [seatingSettings, setSeatingSettings] = useState<SeatingSettings | null>(null);
  const [reservationSettings, setReservationSettings] =
    useState<ReservationSetting | null>(null);
  const [detailsDate, setDetailsDate] = useState<Date | null>(null);
  const [overviewDate, setOverviewDate] = useState(new Date());
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSeatingSettingsOpen, setIsSeatingSettingsOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const [windowStartMinutes, setWindowStartMinutes] = useState(0);
  const [autoAllocateDryRun, setAutoAllocateDryRun] = useState(true);
  const [autoAllocateRunning, setAutoAllocateRunning] = useState(false);
  const [autoAllocateSummary, setAutoAllocateSummary] =
    useState<AutoAllocateDayResult | null>(null);
  const [autoAllocateError, setAutoAllocateError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState<{
    active: boolean;
    bookingId: string | null;
    stagedTableIds: string[];
  }>({
    active: false,
    bookingId: null,
    stagedTableIds: [],
  });
  const prevSeatingSettingsOpenRef = useRef(isSeatingSettingsOpen);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineRafRef = useRef<number | null>(null);
  const timelineProgrammaticRef = useRef(false);
  const timelineProgrammaticTimeoutRef = useRef<number | null>(null);
  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('fpdebug') === '1') return true;
    try {
      return window.localStorage.getItem('ml_fp_debug') === '1';
    } catch {
      return false;
    }
  }, []);
  const [debugError, setDebugError] = useState<DebugErrorInfo | null>(null);
  useEffect(() => {
    if (!debugEnabled) return;
    const handleWindowError = (event: ErrorEvent) => {
      try {
        const error =
          event.error instanceof Error
            ? event.error
            : new Error(event.message || 'Unknown error');
        setDebugError({
          name: error.name || 'Error',
          message: error.message || 'Unknown error',
          stack: error.stack,
          componentStack: undefined,
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          source: 'window:error',
          time: new Date().toISOString(),
        });
      } catch {
        // no-op
      }
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        const error =
          reason instanceof Error
            ? reason
            : new Error(typeof reason === 'string' ? reason : 'Unhandled rejection');
        setDebugError({
          name: error.name || 'Error',
          message: error.message || 'Unknown error',
          stack: error.stack,
          componentStack: undefined,
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
          reason,
          source: 'window:unhandledrejection',
          time: new Date().toISOString(),
        });
      } catch {
        // no-op
      }
    };
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [debugEnabled]);

  const activeUnitId = activeUnitIds.length === 1 ? activeUnitIds[0] : null;
  const isAdmin =
    currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

  const zoneNameById = useMemo(
    () => new Map(zones.map(zone => [zone.id, zone.name || zone.id])),
    [zones]
  );
  const tableNameById = useMemo(
    () => new Map(tables.map(table => [table.id, table.name || table.id])),
    [tables]
  );
  const resolveZoneName = (zoneId?: string | null) =>
    zoneId ? zoneNameById.get(zoneId) ?? zoneId : '—';
  const resolveTableNames = (tableIds?: string[]) =>
    tableIds?.length
      ? tableIds.map(id => tableNameById.get(id) ?? id).join(', ')
      : '—';

  const reloadSeatingData = useCallback(async () => {
    if (!activeUnitId || !isAdmin) {
      setZones([]);
      setTables([]);
      setTableCombinations([]);
      setSeatingSettings(null);
      return;
    }
    try {
      const [zonesData, tablesData, combinationsData, settingsData] = await Promise.all([
        listZones(activeUnitId),
        listTables(activeUnitId),
        listCombinations(activeUnitId),
        getSeatingSettings(activeUnitId, { createIfMissing: false }),
      ]);
      setZones(zonesData);
      setTables(tablesData);
      setTableCombinations(combinationsData);
      setSeatingSettings(settingsData);
    } catch (err) {
      console.error('Error fetching seating data:', err);
      setZones([]);
      setTables([]);
      setTableCombinations([]);
      setSeatingSettings(null);
    }
  }, [activeUnitId, isAdmin]);

  useEffect(() => {
    void reloadSeatingData();
  }, [reloadSeatingData]);

  useEffect(() => {
    const wasOpen = prevSeatingSettingsOpenRef.current;
    if (wasOpen && !isSeatingSettingsOpen) {
      void reloadSeatingData();
    }
    prevSeatingSettingsOpenRef.current = isSeatingSettingsOpen;
  }, [isSeatingSettingsOpen, reloadSeatingData]);

  useEffect(() => {
    if (!activeUnitId) {
      setBookings([]);
      setLoading(false);
      setReservationSettings(null);
      return;
    }
    setLoading(true);

    const startOfMonth = new Date(
      overviewDate.getFullYear(),
      overviewDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      overviewDate.getFullYear(),
      overviewDate.getMonth() + 1,
      0
    );

    const qBookings = query(
      collection(db, 'units', activeUnitId, 'reservations'),
      where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
      where('startTime', '<=', Timestamp.fromDate(endOfMonth)),
      orderBy('startTime', 'asc')
    );

    const unsubscribeBookings = onSnapshot(
      qBookings,
      snapshot => {
        const fetchedBookings = snapshot.docs.map(
          d => ({ id: d.id, ...d.data() } as Booking)
        );
        setBookings(fetchedBookings);
        setLoading(false);
      },
      err => {
        console.error('Error fetching bookings:', err);
        setError('Hiba a foglalások lekérésekor.');
        setLoading(false);
      }
    );

    return () => unsubscribeBookings();
  }, [activeUnitId, overviewDate]);

  useEffect(() => {
    if (!activeUnitId) {
      setReservationSettings(null);
      return;
    }
    const settingsRef = doc(db, 'reservation_settings', activeUnitId);
    const unsubscribe = onSnapshot(
      settingsRef,
      snapshot => {
        setReservationSettings(
          snapshot.exists() ? (snapshot.data() as ReservationSetting) : null
        );
      },
      err => {
        console.error('Error fetching reservation settings:', err);
        setReservationSettings(null);
      }
    );
    return () => unsubscribe();
  }, [activeUnitId]);

  // --- LOGOK FELIRATKOZÁS ---
  useEffect(() => {
    if (!activeUnitId) {
      setLogs([]);
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);

    const logsRef = collection(db, 'units', activeUnitId, 'reservation_logs');
    const qLogs = query(logsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubLogs = onSnapshot(
      qLogs,
      snapshot => {
        const fetchedLogs = snapshot.docs.map(d => {
          const data = d.data();
          const allowedTypes: BookingLogType[] = [
            'created',
            'cancelled',
            'updated',
            'guest_created',
            'guest_cancelled',
            'capacity_override',
            'admin_seating_updated',
            'capacity_recalc',
            'allocation_override_set',
          ];
          return {
            id: d.id,
            bookingId: typeof data.bookingId === 'string' ? data.bookingId : undefined,
            unitId: typeof data.unitId === 'string' ? data.unitId : activeUnitId,
            type: allowedTypes.includes(data.type) ? data.type : 'updated',
            createdAt: data.createdAt ?? null,
            createdByUserId: data.createdByUserId ?? null,
            createdByName: data.createdByName ?? null,
            source: data.source,
            message: typeof data.message === 'string' ? data.message : '',
          } as BookingLog;
        });
        setLogs(fetchedLogs);
        setLogsLoading(false);
      },
      err => {
        console.error('Error fetching reservation logs:', err);
        setLogsLoading(false);
      }
    );

    return () => unsubLogs();
  }, [activeUnitId]);

  const toLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseTimeToMinutes = (timeValue: string) => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const formatMinutes = (minutes: number) => {
    const safe = Math.max(0, minutes);
    const hours = String(Math.floor(safe / 60)).padStart(2, '0');
    const mins = String(safe % 60).padStart(2, '0');
    return `${hours}:${mins}`;
  };
  const clampDayInMonth = (year: number, month: number, day: number) => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    return Math.min(Math.max(day, 1), maxDay);
  };
  const clampWindowStart = (minutes: number, min: number, max: number) =>
    Math.min(Math.max(minutes, min), max);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings
      .filter(b => b.status !== 'cancelled')
      .forEach(booking => {
        const key = toLocalDateKey(booking.startTime.toDate());
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)!.push(booking);
      });
    return map;
  }, [bookings]);

  const overviewDateKey = toLocalDateKey(overviewDate);
  const overviewBookings = bookingsByDate.get(overviewDateKey) || [];
  const previewDate = overviewDate;

  const bookingWindow = reservationSettings?.bookableWindow || {
    from: '00:00',
    to: '23:59',
  };
  const monthLabels = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) =>
        new Date(2024, idx, 1).toLocaleDateString('hu-HU', { month: 'short' })
      ),
    []
  );
  const daysInMonth = useMemo(
    () =>
      new Date(overviewDate.getFullYear(), overviewDate.getMonth() + 1, 0).getDate(),
    [overviewDate]
  );
  const openingMinutes = parseTimeToMinutes(bookingWindow.from) ?? 0;
  const closingMinutes = parseTimeToMinutes(bookingWindow.to) ?? 24 * 60;
  const maxWindowStart = Math.max(openingMinutes, closingMinutes - 120);
  const stepMinutes = 15;
  const stepWidth = 12;
  const timelinePadding = 24;
  const totalSteps = Math.floor((maxWindowStart - openingMinutes) / stepMinutes) + 1;
  const totalWidth = totalSteps * stepWidth;

  useEffect(() => {
    setWindowStartMinutes(openingMinutes);
  }, [openingMinutes, overviewDateKey]);

  const windowStart = useMemo(() => {
    const date = new Date(overviewDate);
    date.setHours(0, 0, 0, 0);
    date.setMinutes(windowStartMinutes);
    return date;
  }, [overviewDate, windowStartMinutes]);

  const windowEnd = useMemo(() => {
    const date = new Date(windowStart);
    date.setMinutes(windowStart.getMinutes() + 120);
    return date;
  }, [windowStart]);

  const windowBookings = useMemo(() => {
    return overviewBookings.filter(booking => {
      const start = booking.startTime?.toDate?.() ?? null;
      const end = booking.endTime?.toDate?.() ?? null;
      if (!start || !end) return false;
      return start < windowEnd && end > windowStart;
    });
  }, [overviewBookings, windowEnd, windowStart]);

  const sortedWindowBookings = useMemo(() => {
    return [...windowBookings].sort((a, b) => {
      const aTime = a.startTime?.toDate?.()?.getTime?.() ?? 0;
      const bTime = b.startTime?.toDate?.()?.getTime?.() ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
  }, [windowBookings]);

  const windowTableIds = useMemo(() => {
    const tableIds = new Set<string>();
    windowBookings.forEach(booking => {
      (booking.assignedTableIds ?? []).forEach(id => tableIds.add(id));
      (booking.allocationFinal?.tableIds ?? []).forEach(id => tableIds.add(id));
      (booking.allocated?.tableIds ?? []).forEach(id => tableIds.add(id));
    });
    return tableIds;
  }, [windowBookings]);

  const windowConflictedBookingIds = useMemo(() => {
    const tableMap = new Map<string, Array<{ bookingId: string; start: number; end: number }>>();
    windowBookings.forEach(booking => {
      const start = booking.startTime?.toDate?.();
      const end = booking.endTime?.toDate?.();
      if (!start || !end) return;
      const tableIds = new Set<string>([
        ...(booking.assignedTableIds ?? []),
        ...(booking.allocationFinal?.tableIds ?? []),
        ...(booking.allocated?.tableIds ?? []),
      ]);
      tableIds.forEach(tableId => {
        const entries = tableMap.get(tableId) ?? [];
        entries.push({ bookingId: booking.id, start: start.getTime(), end: end.getTime() });
        tableMap.set(tableId, entries);
      });
    });
    const conflicted = new Set<string>();
    tableMap.forEach(entries => {
      if (entries.length < 2) return;
      const sorted = [...entries].sort((a, b) => a.start - b.start);
      let latestEnd = sorted[0].end;
      for (let i = 1; i < sorted.length; i += 1) {
        const entry = sorted[i];
        if (entry.start < latestEnd) {
          conflicted.add(entry.bookingId);
          conflicted.add(sorted[i - 1].bookingId);
        }
        latestEnd = Math.max(latestEnd, entry.end);
      }
    });
    return conflicted;
  }, [windowBookings]);

  const windowNoFitCount = useMemo(
    () =>
      windowBookings.filter(
        booking => booking.allocated?.diagnosticsSummary === 'NO_FIT'
      ).length,
    [windowBookings]
  );

  const windowLockedCount = useMemo(
    () => windowBookings.filter(booking => booking.allocationFinal?.locked).length,
    [windowBookings]
  );

  const windowOverrideCount = useMemo(
    () => windowBookings.filter(booking => booking.allocationOverride?.enabled).length,
    [windowBookings]
  );

  const sortedOverviewBookings = useMemo(() => {
    return [...overviewBookings].sort((a, b) => {
      const aTime = a.startTime?.toDate?.()?.getTime?.() ?? 0;
      const bTime = b.startTime?.toDate?.()?.getTime?.() ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.id.localeCompare(b.id);
    });
  }, [overviewBookings]);

  const dayConflictedBookingIds = useMemo(() => {
    const tableMap = new Map<string, Array<{ bookingId: string; start: number; end: number }>>();
    overviewBookings.forEach(booking => {
      const start = booking.startTime?.toDate?.();
      const end = booking.endTime?.toDate?.();
      if (!start || !end) return;
      const tableIds = new Set<string>([
        ...(booking.assignedTableIds ?? []),
        ...(booking.allocationFinal?.tableIds ?? []),
        ...(booking.allocated?.tableIds ?? []),
      ]);
      tableIds.forEach(tableId => {
        const entries = tableMap.get(tableId) ?? [];
        entries.push({ bookingId: booking.id, start: start.getTime(), end: end.getTime() });
        tableMap.set(tableId, entries);
      });
    });
    const conflicted = new Set<string>();
    tableMap.forEach(entries => {
      if (entries.length < 2) return;
      const sorted = [...entries].sort((a, b) => a.start - b.start);
      let latestEnd = sorted[0].end;
      for (let i = 1; i < sorted.length; i += 1) {
        const entry = sorted[i];
        if (entry.start < latestEnd) {
          conflicted.add(entry.bookingId);
          conflicted.add(sorted[i - 1].bookingId);
        }
        latestEnd = Math.max(latestEnd, entry.end);
      }
    });
    return conflicted;
  }, [overviewBookings]);

  const timelineBucketMetrics = useMemo(() => {
    const dayStart = new Date(overviewDate);
    dayStart.setHours(0, 0, 0, 0);
    const bookingSpans = overviewBookings
      .map(booking => {
        const start = booking.startTime?.toDate?.() ?? null;
        const end = booking.endTime?.toDate?.() ?? null;
        if (!start || !end) return null;
        const startMinutes = Math.floor((start.getTime() - dayStart.getTime()) / 60000);
        const endMinutes = Math.floor((end.getTime() - dayStart.getTime()) / 60000);
        if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
        const tableIds = new Set<string>([
          ...(booking.assignedTableIds ?? []),
          ...(booking.allocationFinal?.tableIds ?? []),
          ...(booking.allocated?.tableIds ?? []),
        ]);
        return { startMinutes, endMinutes, tableIds };
      })
      .filter(Boolean) as Array<{
      startMinutes: number;
      endMinutes: number;
      tableIds: Set<string>;
    }>;

    const tableMap = new Map<string, Array<{ start: number; end: number }>>();
    bookingSpans.forEach(span => {
      span.tableIds.forEach(tableId => {
        const entries = tableMap.get(tableId) ?? [];
        entries.push({ start: span.startMinutes, end: span.endMinutes });
        tableMap.set(tableId, entries);
      });
    });

    const conflictRangesByTable = new Map<string, Array<{ start: number; end: number }>>();
    tableMap.forEach((entries, tableId) => {
      if (entries.length < 2) return;
      const sorted = [...entries].sort((a, b) => a.start - b.start);
      let latestEnd = sorted[0].end;
      const ranges: Array<{ start: number; end: number }> = [];
      for (let i = 1; i < sorted.length; i += 1) {
        const entry = sorted[i];
        if (entry.start < latestEnd) {
          ranges.push({
            start: entry.start,
            end: Math.min(entry.end, latestEnd),
          });
        }
        latestEnd = Math.max(latestEnd, entry.end);
      }
      if (ranges.length > 0) {
        conflictRangesByTable.set(tableId, ranges);
      }
    });

    return Array.from({ length: totalSteps }, (_, idx) => {
      const bucketStart = openingMinutes + idx * stepMinutes;
      const bucketEnd = bucketStart + stepMinutes;
      const bookingCount = bookingSpans.reduce((count, span) => {
        if (span.startMinutes < bucketEnd && span.endMinutes > bucketStart) {
          return count + 1;
        }
        return count;
      }, 0);
      let conflictCount = 0;
      conflictRangesByTable.forEach(ranges => {
        const hasConflict = ranges.some(range => range.start < bucketEnd && range.end > bucketStart);
        if (hasConflict) {
          conflictCount += 1;
        }
      });
      return { bucketStart, bookingCount, conflictCount };
    });
  }, [openingMinutes, overviewBookings, overviewDate, stepMinutes, totalSteps]);

  const manualBooking = useMemo(() => {
    if (!manualMode.bookingId) return null;
    return (
      overviewBookings.find(booking => booking.id === manualMode.bookingId) ??
      bookings.find(booking => booking.id === manualMode.bookingId) ??
      null
    );
  }, [bookings, manualMode.bookingId, overviewBookings]);

  const manualSelectionConflicts = useMemo(() => {
    if (!manualBooking || manualMode.stagedTableIds.length === 0) return [];
    const bufferMinutes = reservationSettings?.bufferMinutes ?? 15;
    return computeAllocationConflicts(
      manualBooking,
      manualMode.stagedTableIds,
      overviewBookings,
      bufferMinutes
    );
  }, [manualBooking, manualMode.stagedTableIds, overviewBookings, reservationSettings?.bufferMinutes]);

  const resolveManualZoneId = useCallback(
    (tableIds: string[]) => {
      if (!tableIds.length) return null;
      const tableById = new Map(tables.map(table => [table.id, table]));
      const firstTable = tableById.get(tableIds[0]);
      return firstTable?.zoneId ?? null;
    },
    [tables]
  );

  const isNavLocked = manualMode.active;

  const handleBookingFocus = useCallback(
    (booking: Booking) => {
      if (manualMode.active) return;
      const start = booking.startTime?.toDate?.() ?? null;
      const end = booking.endTime?.toDate?.() ?? null;
      if (!start || !end) {
        setSelectedBookingId(booking.id);
        return;
      }
      const dayStart = new Date(overviewDate);
      dayStart.setHours(0, 0, 0, 0);
      const startMinutes = Math.floor((start.getTime() - dayStart.getTime()) / 60000);
      const endMinutes = Math.floor((end.getTime() - dayStart.getTime()) / 60000);
      const midpointMinutes = Math.round((startMinutes + endMinutes) / 2);
      const desiredStart = midpointMinutes - 60;
      const snappedStart = Math.round(desiredStart / stepMinutes) * stepMinutes;
      const clampedStart = clampValue(snappedStart, openingMinutes, maxWindowStart);
      setSelectedBookingId(booking.id);
      setWindowStartMinutes(clampedStart);
    },
    [manualMode.active, maxWindowStart, openingMinutes, overviewDate, stepMinutes]
  );

  const autoAllocateProblemItems = useMemo(() => {
    if (!autoAllocateSummary?.items) return [];
    return autoAllocateSummary.items.filter(item =>
      ['error', 'skipped_invalid'].includes(item.status) ||
      item.diagnostics?.conflict ||
      item.diagnostics?.noFit
    ).slice(0, 10);
  }, [autoAllocateSummary]);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    const clampedStart = clampWindowStart(windowStartMinutes, openingMinutes, maxWindowStart);
    const startIndex = Math.round((clampedStart - openingMinutes) / stepMinutes);
    const targetLeft = Math.max(
      0,
      startIndex * stepWidth - container.clientWidth / 2 + timelinePadding
    );
    timelineProgrammaticRef.current = true;
    if (timelineProgrammaticTimeoutRef.current !== null) {
      window.clearTimeout(timelineProgrammaticTimeoutRef.current);
    }
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
    timelineProgrammaticTimeoutRef.current = window.setTimeout(() => {
      timelineProgrammaticRef.current = false;
    }, 200);
  }, [openingMinutes, maxWindowStart, stepMinutes, stepWidth, timelinePadding, windowStartMinutes]);

  useEffect(
    () => () => {
      if (timelineRafRef.current !== null) {
        cancelAnimationFrame(timelineRafRef.current);
      }
      if (timelineProgrammaticTimeoutRef.current !== null) {
        window.clearTimeout(timelineProgrammaticTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setSelectedBookingId(null);
  }, [overviewDateKey]);

  if (!activeUnitId) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <div>
          <BookingIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--color-text-main)]">
            A funkció használatához válassz egy egységet
          </h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            A foglalási rendszer megtekintéséhez és kezeléséhez, kérjük, válassz ki
            pontosan egy egységet a fejlécben.
          </p>
        </div>
      </div>
    );
  }

  const writeLog = async (
    unitId: string,
    booking: { id: string; name: string; headcount?: number; startTime?: Timestamp },
    type: BookingLogType,
    extraMessage?: string
  ) => {
    void unitId;
    void booking;
    void type;
    void extraMessage;
  };

  const handleAddBooking = async (bookingData: Omit<Booking, 'id'>) => {
    if (!activeUnitId) return;
    const ref = await addDoc(
      collection(db, 'units', activeUnitId, 'reservations'),
      bookingData
    );
    // LOG: user által létrehozott foglalás
    await writeLog(
      activeUnitId,
      {
        id: ref.id,
        name: bookingData.name,
        headcount: bookingData.headcount,
        startTime: bookingData.startTime,
      },
      'created'
    );
    setIsAddModalOpen(false);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!bookingToDelete || !activeUnitId) return;
    try {
      await updateDoc(
        doc(db, 'units', activeUnitId, 'reservations', bookingToDelete.id),
        {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelReason: reason || '',
          cancelledBy: 'admin',
        }
      );

      // LOG: foglalás törlés
      await writeLog(
        activeUnitId,
        {
          id: bookingToDelete.id,
          name: bookingToDelete.name,
          headcount: bookingToDelete.headcount,
          startTime: bookingToDelete.startTime,
        },
        'cancelled',
        reason ? `Indoklás: ${reason}` : undefined
      );

      setBookingToDelete(null);
    } catch (err) {
      console.error('Error deleting booking:', err);
      alert('Hiba a foglalás törlésekor.');
    }
  };

  const openGuestPage = () => {
    window.open(`/reserve?unit=${activeUnitId}`, '_blank');
  };

  const handleAutoAllocateDay = async () => {
    if (!activeUnitId) return;
    setAutoAllocateRunning(true);
    setAutoAllocateError(null);
    try {
      const result = await triggerAutoAllocateDay({
        unitId: activeUnitId,
        dateKey: overviewDateKey,
        mode: autoAllocateDryRun ? 'dryRun' : 'apply',
      });
      setAutoAllocateSummary(result);
    } catch (err) {
      console.error('Auto-allocate failed', err);
      setAutoAllocateError('Nem sikerült lefuttatni az automatikus ültetést.');
    } finally {
      setAutoAllocateRunning(false);
    }
  };

  const handleManualStart = (bookingId: string) => {
    const targetBooking =
      overviewBookings.find(booking => booking.id === bookingId) ??
      bookings.find(booking => booking.id === bookingId);
    if (targetBooking) {
      const start = targetBooking.startTime?.toDate?.() ?? null;
      const end = targetBooking.endTime?.toDate?.() ?? null;
      if (start && end) {
        const dayStart = new Date(overviewDate);
        dayStart.setHours(0, 0, 0, 0);
        const startMinutes = Math.floor((start.getTime() - dayStart.getTime()) / 60000);
        const endMinutes = Math.floor((end.getTime() - dayStart.getTime()) / 60000);
        const midpointMinutes = Math.round((startMinutes + endMinutes) / 2);
        const desiredStart = midpointMinutes - 60;
        const snappedStart = Math.round(desiredStart / stepMinutes) * stepMinutes;
        const clampedStart = clampWindowStart(snappedStart, openingMinutes, maxWindowStart);
        setWindowStartMinutes(clampedStart);
      }
    }
    setSelectedBookingId(bookingId);
    setManualMode({
      active: true,
      bookingId,
      stagedTableIds: [],
    });
  };

  const handleManualCancel = () => {
    setManualMode({
      active: false,
      bookingId: null,
      stagedTableIds: [],
    });
  };

  const handleManualToggleTable = (table: Table) => {
    if (!manualMode.active) return;
    setManualMode(current => ({
      ...current,
      stagedTableIds: current.stagedTableIds.includes(table.id)
        ? current.stagedTableIds.filter(id => id !== table.id)
        : [...current.stagedTableIds, table.id],
    }));
  };

  const handleManualConfirm = async () => {
    if (!manualMode.active || !activeUnitId || !manualMode.bookingId) return;
    if (manualMode.stagedTableIds.length === 0) return;
    try {
      const zoneId = resolveManualZoneId(manualMode.stagedTableIds);
      await setOverride(activeUnitId, manualMode.bookingId, {
        forcedZoneId: zoneId ?? null,
        forcedTableIds: manualMode.stagedTableIds,
      });
      handleManualCancel();
    } catch (err) {
      console.error('Error saving manual allocation override:', err);
      alert('Nem sikerült menteni a manuális ültetést.');
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-[var(--color-text-main)]">Foglalások</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={openGuestPage}
            className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            Vendégoldal megnyitása
          </button>
          {canAddBookings && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              Új foglalás
            </button>
          )}
          {isAdmin && activeUnitId && (
            <>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-full bg-gray-200 text-[var(--color-text-main)] hover:bg-gray-300"
                title="Foglalási beállítások"
              >
                <SettingsIcon className="h-6 w-6" />
              </button>
              <button
                onClick={() => setIsSeatingSettingsOpen(true)}
                className="px-3 py-2 rounded-lg bg-gray-200 text-[var(--color-text-main)] hover:bg-gray-300 text-sm font-semibold"
              >
                Ültetés beállítások
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="relative h-64">
          <LoadingSpinner />
        </div>
      )}
      {error && (
        <div
          className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg"
          role="alert"
        >
          <p className="font-bold">Hiba történt</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-4 space-y-6">
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <div className="text-4xl md:text-5xl font-semibold text-[var(--color-text-main)] leading-none">
                    {overviewDate.getFullYear()}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                    Admin Central · Reservation & Allocation Portal
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {monthLabels.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    disabled={isNavLocked}
                    onClick={() => {
                      const nextDate = new Date(overviewDate);
                      const nextDay = clampDayInMonth(
                        nextDate.getFullYear(),
                        idx,
                        nextDate.getDate()
                      );
                      nextDate.setMonth(idx);
                      nextDate.setDate(nextDay);
                      setOverviewDate(nextDate);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition min-h-[28px] ${
                      overviewDate.getMonth() === idx
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm scale-[1.03]'
                        : 'border-gray-200 text-[var(--color-text-secondary)] hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {Array.from({ length: daysInMonth }, (_, idx) => idx + 1).map(day => (
                  <button
                    key={day}
                    type="button"
                    disabled={isNavLocked}
                    onClick={() => {
                      const nextDate = new Date(overviewDate);
                      nextDate.setDate(day);
                      setOverviewDate(nextDate);
                    }}
                    className={`h-9 w-9 flex items-center justify-center rounded-full border text-xs font-semibold transition ${
                      overviewDate.getDate() === day
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm scale-[1.05] -translate-y-[1px]'
                        : 'border-gray-200 text-[var(--color-text-secondary)] hover:bg-gray-50'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-2xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                      Mai foglalások
                    </div>
                    {manualMode.active && (
                      <span className="text-[10px] font-semibold uppercase text-amber-700">
                        Manual mód aktív
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {sortedOverviewBookings.map(booking => {
                      const start = booking.startTime?.toDate?.();
                      const end = booking.endTime?.toDate?.();
                      const isFocused = selectedBookingId === booking.id;
                      const isLocked = Boolean(booking.allocationFinal?.locked);
                      const isOverride = Boolean(booking.allocationOverride?.enabled);
                      const isNoFit = booking.allocated?.diagnosticsSummary === 'NO_FIT';
                      const isConflict = dayConflictedBookingIds.has(booking.id);
                      const hasAllocation =
                        (booking.assignedTableIds?.length ?? 0) > 0 ||
                        (booking.allocationFinal?.tableIds?.length ?? 0) > 0 ||
                        (booking.allocated?.tableIds?.length ?? 0) > 0;
                      return (
                        <div
                          key={booking.id}
                          className={`rounded-lg border px-3 py-2 text-xs transition ${
                            isFocused
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                            <button
                              type="button"
                              disabled={isNavLocked}
                              onClick={() => handleBookingFocus(booking)}
                              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-left md:items-center md:grid-cols-[1.4fr_0.9fr_0.6fr_0.8fr_0.8fr] rounded-md px-2 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                                manualMode.active ? '' : 'hover:bg-gray-50'
                              }`}
                            >
                              <span className="text-sm font-semibold text-[var(--color-text-main)]">
                                {booking.name}
                              </span>
                              <span className="text-[var(--color-text-secondary)]">
                                {start && end
                                  ? `${start.toLocaleTimeString('hu-HU', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}–${end.toLocaleTimeString('hu-HU', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`
                                  : '—'}
                              </span>
                              <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1 md:contents">
                                <span className="text-[var(--color-text-secondary)]">
                                  {booking.headcount} fő
                                </span>
                                <span
                                  className={`inline-flex min-w-[72px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    booking.status === 'confirmed'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {booking.status}
                                </span>
                                <span
                                  className={`inline-flex min-w-[80px] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    hasAllocation
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {hasAllocation ? 'ALLOCATED' : 'NO_ALLOC'}
                                </span>
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                              {isLocked && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  LOCKED
                                </span>
                              )}
                              {isOverride && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  OVERRIDE
                                </span>
                              )}
                              {isNoFit && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                  NO_FIT
                                </span>
                              )}
                              {isConflict && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                  CONFLICT
                                </span>
                              )}
                              <div className="flex items-center gap-2 md:ml-auto">
                                <button
                                  type="button"
                                  className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-text-secondary)]"
                                  disabled
                                >
                                  Auto
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-emerald-300 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 disabled:opacity-50"
                                  onClick={() => handleManualStart(booking.id)}
                                  disabled={manualMode.active}
                                >
                                  Manual
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!sortedOverviewBookings.length && (
                      <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-[var(--color-text-secondary)]">
                        Nincs foglalás erre a napra.
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm font-semibold text-[var(--color-text-main)]">
                      {formatMinutes(windowStartMinutes)}–{formatMinutes(windowStartMinutes + 120)}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailsDate(overviewDate)}
                        disabled={isNavLocked}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-[var(--color-text-main)]"
                      >
                        Napi lista
                      </button>
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                        <input
                          type="checkbox"
                          checked={autoAllocateDryRun}
                          onChange={event => setAutoAllocateDryRun(event.target.checked)}
                        />
                        Dry-run
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoAllocateDay}
                        disabled={autoAllocateRunning || isNavLocked}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {autoAllocateRunning ? 'Futtatás...' : 'Auto-allocate nap'}
                      </button>
                    </div>
                  </div>
                  <div className="relative rounded-2xl border border-emerald-200 bg-white px-3 py-3 shadow-sm">
                    <div
                      ref={timelineRef}
                      className="relative overflow-x-auto"
                      style={{ paddingLeft: timelinePadding, paddingRight: timelinePadding }}
                      onScroll={event => {
                        if (manualMode.active) return;
                        if (timelineProgrammaticRef.current) return;
                        const target = event.currentTarget;
                        if (timelineRafRef.current !== null) {
                          cancelAnimationFrame(timelineRafRef.current);
                        }
                        timelineRafRef.current = requestAnimationFrame(() => {
                          const paddedScrollLeft = Math.max(0, target.scrollLeft - timelinePadding);
                          const index = Math.max(
                            0,
                            Math.min(
                              totalSteps - 1,
                              Math.round(paddedScrollLeft / stepWidth)
                            )
                          );
                          const nextMinutes = clampWindowStart(
                            openingMinutes + index * stepMinutes,
                            openingMinutes,
                            maxWindowStart
                          );
                          if (nextMinutes !== windowStartMinutes) {
                            setWindowStartMinutes(nextMinutes);
                          }
                        });
                      }}
                    >
                      <div className="relative h-9" style={{ width: totalWidth }}>
                        <div className="absolute inset-0 z-0">
                          {timelineBucketMetrics.map((bucket, idx) => {
                            if (bucket.bookingCount === 0 && bucket.conflictCount === 0) {
                              return null;
                            }
                            const tintClass =
                              bucket.conflictCount > 0
                                ? 'bg-amber-200/70'
                                : 'bg-emerald-100/70';
                            return (
                              <div
                                key={bucket.bucketStart}
                                className={`absolute top-0 h-full ${tintClass}`}
                                style={{ left: idx * stepWidth, width: stepWidth }}
                              />
                            );
                          })}
                        </div>
                        <div
                          className="absolute top-1 z-10 h-6 rounded-full border border-emerald-300 bg-emerald-50"
                          style={{
                            left:
                              ((windowStartMinutes - openingMinutes) / stepMinutes) * stepWidth,
                            width: (120 / stepMinutes) * stepWidth,
                          }}
                        />
                        {Array.from({ length: totalSteps }, (_, idx) => {
                          const minutes = openingMinutes + idx * stepMinutes;
                          const isHour = minutes % 60 === 0;
                          const bucketData = timelineBucketMetrics[idx];
                          return (
                            <button
                              key={minutes}
                              type="button"
                              disabled={manualMode.active}
                              onClick={() =>
                                setWindowStartMinutes(
                                  clampWindowStart(minutes, openingMinutes, maxWindowStart)
                                )
                              }
                              className="absolute top-0 z-20 h-full flex flex-col items-center justify-end"
                              style={{ left: idx * stepWidth }}
                            >
                              {isHour &&
                                bucketData &&
                                (bucketData.bookingCount > 0 || bucketData.conflictCount > 0) && (
                                  <span className="absolute -top-1 flex items-center gap-1">
                                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                                      {bucketData.bookingCount}
                                    </span>
                                    {bucketData.conflictCount > 0 && (
                                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                                        !
                                      </span>
                                    )}
                                  </span>
                                )}
                              <span
                                className={`block w-px ${
                                  isHour ? 'h-3.5 bg-gray-400' : 'h-2 bg-gray-300'
                                }`}
                              />
                              {isHour && (
                                <span className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                                  {formatMinutes(minutes)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {manualMode.active && (
              <div className="fixed inset-0 pointer-events-none bg-black/10 backdrop-blur-[1px] z-20" />
            )}
            {autoAllocateError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {autoAllocateError}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Idősáv foglalások</div>
                <div className="text-lg font-semibold">{windowBookings.length}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Foglalt asztalok</div>
                <div className="text-lg font-semibold">{windowTableIds.size}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Konfliktus</div>
                <div className="text-lg font-semibold">{windowConflictedBookingIds.size}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">NO_FIT</div>
                <div className="text-lg font-semibold">{windowNoFitCount}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Zárolt/Override</div>
                <div className="text-lg font-semibold">
                  {windowLockedCount + windowOverrideCount}
                </div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-[var(--color-text-main)]">
                  Foglalások ({formatMinutes(windowStartMinutes)}–{formatMinutes(windowStartMinutes + 120)})
                </h2>
                <div className="space-y-2">
                  {sortedWindowBookings.map(booking => {
                    const start = booking.startTime?.toDate?.();
                    const end = booking.endTime?.toDate?.();
                    const timeLabel =
                      start && end
                        ? `${start.toLocaleTimeString('hu-HU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}–${end.toLocaleTimeString('hu-HU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : '—';
                    const isConflict = windowConflictedBookingIds.has(booking.id);
                    const isNoFit = booking.allocated?.diagnosticsSummary === 'NO_FIT';
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => {
                          setSelectedBookingId(booking.id);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                          selectedBookingId === booking.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-[var(--color-text-main)]">
                            {booking.name} · {booking.headcount} fő
                          </div>
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {timeLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase text-[var(--color-text-secondary)]">
                          {booking.allocationFinal?.locked && (
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-700">
                              ZÁROLT
                            </span>
                          )}
                          {booking.allocationOverride?.enabled && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                              OVERRIDE
                            </span>
                          )}
                          {isNoFit && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                              NO_FIT
                            </span>
                          )}
                          {isConflict && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                              CONFLICT
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={event => {
                              event.stopPropagation();
                              setDetailsDate(overviewDate);
                            }}
                            className="ml-auto rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--color-text-secondary)] hover:bg-gray-100"
                          >
                            Részletek
                          </button>
                        </div>
                      </button>
                    );
                  })}
                  {!sortedWindowBookings.length && (
                    <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[var(--color-text-secondary)]">
                      Nincs foglalás ebben az idősávban.
                    </div>
                  )}
                </div>
              </div>
              <div>
                {manualMode.active && manualBooking ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      Manuális ültetés aktív: kattints asztalokra a kijelöléshez.
                    </div>
                    <FloorplanViewer
                      unitId={activeUnitId}
                      highlightTableIds={manualMode.stagedTableIds}
                      highlightZoneId={manualBooking.zoneId ?? null}
                      onTableClick={handleManualToggleTable}
                    />
                    <div className="sticky bottom-4 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[var(--color-text-main)]">
                            Kijelölt asztalok: {manualMode.stagedTableIds.length}
                          </div>
                          {manualSelectionConflicts.length > 0 && (
                            <div className="text-amber-700">
                              ⚠️ Ütközés lehetséges a kijelölt asztalokkal.
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleManualCancel}
                            className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-[var(--color-text-main)]"
                          >
                            Mégse
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleManualConfirm()}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                            disabled={manualMode.stagedTableIds.length === 0}
                          >
                            Jóváhagyás
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ReservationFloorplanPreview
                    unitId={activeUnitId}
                    selectedDate={previewDate}
                    bookings={windowBookings}
                    selectedBookingId={selectedBookingId}
                  />
                )}
              </div>
            </div>
          </div>
          {logsLoading ? (
            <div className="mt-6">
              <LoadingSpinner />
            </div>
          ) : (
            <LogsPanel logs={logs} />
          )}
        </>
      )}

      {detailsDate && activeUnitId && (
        <BookingDetailsModal
          selectedDate={detailsDate}
          bookings={bookingsByDate.get(toLocalDateKey(detailsDate)) || []}
          onClose={() => {
            setDetailsDate(null);
          }}
          onSelectBooking={bookingId => {
            if (bookingId) {
              setSelectedBookingId(bookingId);
            }
          }}
          isAdmin={isAdmin}
          onDelete={setBookingToDelete}
          unitId={activeUnitId}
          zones={zones}
          tables={tables}
          combinations={tableCombinations}
          seatingSettings={seatingSettings}
          onSeatingSaved={(bookingId, update) => {
            setBookings(current =>
              current.map(booking =>
                booking.id === bookingId
                  ? {
                      ...booking,
                      zoneId: update.zoneId ?? undefined,
                      assignedTableIds: update.assignedTableIds,
                      seatingSource: update.seatingSource,
                    }
                  : booking
              )
            );
          }}
        />
      )}
      {isAddModalOpen && (
        <AddBookingModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddBooking={handleAddBooking}
          unitId={activeUnitId}
        />
      )}
      {isSettingsOpen && activeUnitId && (
        <ReservationSettingsModal
          unitId={activeUnitId}
          currentUser={currentUser}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {isSeatingSettingsOpen && activeUnitId && (
        <SeatingSettingsErrorBoundary
          onError={info => {
            if (debugEnabled) {
              setDebugError(info);
            }
          }}
        >
          <SeatingSettingsModal
            unitId={activeUnitId}
            onClose={() => setIsSeatingSettingsOpen(false)}
          />
        </SeatingSettingsErrorBoundary>
      )}
      {autoAllocateSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text-main)]">
                  Auto-allocate összegzés
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {autoAllocateSummary.dateKey} · {autoAllocateSummary.mode === 'apply' ? 'Apply' : 'Dry-run'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoAllocateSummary(null)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-sm"
              >
                Bezárás
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-[var(--color-text-secondary)]">Feldolgozott</div>
                <div className="text-lg font-semibold">{autoAllocateSummary.totals.processed}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-[var(--color-text-secondary)]">Frissített</div>
                <div className="text-lg font-semibold">{autoAllocateSummary.totals.updated}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-[var(--color-text-secondary)]">Skip</div>
                <div className="text-lg font-semibold">{autoAllocateSummary.totals.skipped}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-[var(--color-text-secondary)]">NO_FIT</div>
                <div className="text-lg font-semibold">{autoAllocateSummary.totals.noFit}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-[var(--color-text-secondary)]">Konfliktus</div>
                <div className="text-lg font-semibold">{autoAllocateSummary.totals.conflicts}</div>
              </div>
            </div>
            {autoAllocateProblemItems.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">
                  Problémás foglalások (top 10)
                </h3>
                <ul className="mt-2 space-y-2 text-xs">
                  {autoAllocateProblemItems.map(item => (
                    <li key={item.bookingId} className="rounded-lg border border-gray-200 p-2">
                      <div className="font-semibold">{item.bookingId}</div>
                      <div className="text-[var(--color-text-secondary)]">
                        {item.status}
                        {item.reason ? ` · ${item.reason}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      {bookingToDelete && (
        <DeleteConfirmationModal
          booking={bookingToDelete}
          onClose={() => setBookingToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
      {debugEnabled && debugError && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="max-w-2xl w-full rounded-xl bg-white shadow-xl border border-gray-200">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-900">Seating debug error</div>
              <div className="text-xs text-gray-500">fpdebug=1</div>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-600">
                Open with <code>?fpdebug=1</code>, reproduce, copy text.
              </div>
              <pre className="text-xs whitespace-pre-wrap max-h-[60vh] overflow-auto rounded bg-gray-100 p-3">
                {formatDebugError(debugError)}
              </pre>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDebugError(null)}
                  className="px-3 py-1.5 rounded bg-gray-200 text-gray-800 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FoglalasokApp;
