import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Booking,
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

interface FoglalasokAppProps {
  currentUser: User;
  canAddBookings: boolean;
  allUnits: Unit[];
  activeUnitIds: string[];
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
      {booking.allocationFinal?.locked && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-gray-100 text-gray-600">
          LOCKED
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logs, setLogs] = useState<BookingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tableCombinations, setTableCombinations] = useState<TableCombination[]>([]);
  const [seatingSettings, setSeatingSettings] = useState<SeatingSettings | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSeatingSettingsOpen, setIsSeatingSettingsOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);
  const prevSeatingSettingsOpenRef = useRef(isSeatingSettingsOpen);

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
      return;
    }
    setLoading(true);

    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
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
  }, [activeUnitId, currentDate]);

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

  const previewDate = selectedDate ?? new Date();
  const previewBookings = bookingsByDate.get(toLocalDateKey(previewDate)) || [];

  useEffect(() => {
    setSelectedBookingId(null);
  }, [selectedDate]);

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

  const renderCalendar = () => {
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;

    for (let i = 0; i < startDayOfWeek; i++) {
      const day = new Date(startOfMonth);
      day.setDate(day.getDate() - (startDayOfWeek - i));
      days.push({ date: day, isCurrentMonth: false });
    }
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      const day = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      days.push({ date: day, isCurrentMonth: true });
    }
    const totalDays = days.length;
    const remainingCells = (totalDays > 35 ? 42 : 35) - totalDays;
    for (let i = 1; i <= remainingCells; i++) {
      const day = new Date(endOfMonth);
      day.setDate(day.getDate() + i);
      days.push({ date: day, isCurrentMonth: false });
    }

    const todayKey = toLocalDateKey(new Date());

    return (
      <div
        className="p-6 rounded-2xl shadow-lg border border-gray-100"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
              )
            }
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Previous month"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] capitalize">
            {currentDate.toLocaleDateString('hu-HU', {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
              )
            }
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[var(--color-text-secondary)] text-sm mb-2">
          {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, isCurrentMonth }, index) => {
            const dateKey = toLocalDateKey(date);
            const dailyBookings = bookingsByDate.get(dateKey) || [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={index}
                onClick={() => isCurrentMonth && setSelectedDate(date)}
                className={`
                  h-24 p-2 flex flex-col items-start rounded-lg transition-colors
                  ${
                    isCurrentMonth
                      ? 'cursor-pointer hover:bg-gray-100'
                      : 'text-gray-300'
                  }
                  ${isToday ? 'border-2 border-green-500' : 'border border-gray-200'}
                `}
              >
                <span
                  className={`font-bold ${
                    isToday ? 'text-green-600' : 'text-[var(--color-text-main)]'
                  }`}
                >
                  {date.getDate()}
                </span>
                {isCurrentMonth && dailyBookings.length > 0 && (
                  <div className="mt-auto w-full text-left">
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                      {dailyBookings.length} foglalás
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
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
          {renderCalendar()}
          <div className="mt-6">
            <ReservationFloorplanPreview
              unitId={activeUnitId}
              selectedDate={previewDate}
              bookings={previewBookings}
              selectedBookingId={selectedBookingId}
            />
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

      {selectedDate && activeUnitId && (
        <BookingDetailsModal
          selectedDate={selectedDate}
          bookings={bookingsByDate.get(toLocalDateKey(selectedDate)) || []}
          onClose={() => {
            setSelectedBookingId(null);
            setSelectedDate(null);
          }}
          onSelectBooking={setSelectedBookingId}
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
        <SeatingSettingsModal
          unitId={activeUnitId}
          onClose={() => setIsSeatingSettingsOpen(false)}
        />
      )}
      {bookingToDelete && (
        <DeleteConfirmationModal
          booking={bookingToDelete}
          onClose={() => setBookingToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};

export default FoglalasokApp;
