import React, { useEffect, useMemo, useState } from 'react';
import {
  Booking,
  Floorplan,
  ReservationCapacity,
  ReservationSetting,
  Table,
  Zone,
} from '../../../../core/models/data';
import { db } from '../../../../core/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { getSeatingSettings, listFloorplans } from '../../../../core/services/seatingAdminService';
import { listTables, listZones } from '../../../../core/services/seatingService';
import { normalizeTableGeometry } from '../../../../core/utils/seatingNormalize';
import { looksNormalized, resolveCanonicalFloorplanDims } from '../../../../core/utils/seatingFloorplanRender';
import FloorplanViewportCanvas from '../seating/FloorplanViewportCanvas';
import FloorplanWorldLayer from '../seating/FloorplanWorldLayer';

type ReservationFloorplanPreviewProps = {
  unitId: string;
  selectedDate: Date;
  bookings: Booking[];
  selectedBookingId?: string | null;
};

type TableStatus = 'occupied' | 'upcoming' | 'free';

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toBucketKey = (date: Date, bucketMinutes: number) => {
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  const currentMs = date.getTime();
  const bucketStartMs = Math.floor(currentMs / bucketMs) * bucketMs;
  const bucketDate = new Date(bucketStartMs);
  const hours = String(bucketDate.getHours()).padStart(2, '0');
  const minutes = String(bucketDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const TABLE_GEOMETRY_DEFAULTS = {
  rectWidth: 80,
  rectHeight: 60,
  circleRadius: 40,
};

const ReservationFloorplanPreview: React.FC<ReservationFloorplanPreviewProps> = ({
  unitId,
  selectedDate,
  bookings,
  selectedBookingId,
}) => {
  const [floorplan, setFloorplan] = useState<Floorplan | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [floorplanLoading, setFloorplanLoading] = useState(true);
  const [floorplanError, setFloorplanError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
  const [capacity, setCapacity] = useState<ReservationCapacity | null>(null);
  const [now, setNow] = useState(new Date());

  const debugEnabled = useMemo(() => {
    const isDev =
      typeof import.meta !== 'undefined' &&
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.MODE !== 'production';

    if (typeof window === 'undefined') return isDev;

    const params = new URLSearchParams(window.location.search);
    if (params.get('fpdebug') === '1') return true;

    try {
      return window.localStorage.getItem('ml_fp_debug') === '1' || isDev;
    } catch {
      return isDev;
    }
  }, []);

  const dateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!unitId) {
      setSettings(null);
      return;
    }

    const settingsRef = doc(db, 'reservation_settings', unitId);
    const unsubscribe = onSnapshot(
      settingsRef,
      snapshot => {
        setSettings(snapshot.exists() ? (snapshot.data() as ReservationSetting) : null);
      },
      err => {
        console.error('Error fetching reservation settings:', err);
        setSettings(null);
      }
    );

    return () => unsubscribe();
  }, [unitId]);

  useEffect(() => {
    if (!unitId || !dateKey) {
      setCapacity(null);
      return;
    }

    const capacityRef = doc(db, 'units', unitId, 'reservation_capacity', dateKey);
    const unsubscribe = onSnapshot(
      capacityRef,
      snapshot => {
        setCapacity(snapshot.exists() ? (snapshot.data() as ReservationCapacity) : null);
      },
      err => {
        console.error('Error fetching reservation capacity:', err);
        setCapacity(null);
      }
    );

    return () => unsubscribe();
  }, [dateKey, unitId]);

  useEffect(() => {
    if (!unitId) {
      setFloorplan(null);
      setTables([]);
      setZones([]);
      setFloorplanLoading(false);
      return;
    }

    let isMounted = true;

    const loadFloorplan = async () => {
      setFloorplanLoading(true);
      setFloorplanError(null);

      try {
        const [settingsData, floorplansData, zonesData, tablesData] = await Promise.all([
          getSeatingSettings(unitId, { createIfMissing: false }),
          listFloorplans(unitId),
          listZones(unitId),
          listTables(unitId),
        ]);

        if (!isMounted) return;

        const targetFloorplanId = settingsData.activeFloorplanId;
        const resolvedFloorplan =
          floorplansData.find(plan => plan.id === targetFloorplanId) ??
          floorplansData.find(plan => plan.isActive) ??
          null;

        setFloorplan(resolvedFloorplan);
        setZones(zonesData.filter(zone => zone.isActive !== false));
        setTables(tablesData);
      } catch (err) {
        console.error('Error loading floorplan preview data:', err);
        if (isMounted) {
          setFloorplanError('Nem sikerült betölteni az asztaltérképet.');
          setFloorplan(null);
          setZones([]);
          setTables([]);
        }
      } finally {
        if (isMounted) setFloorplanLoading(false);
      }
    };

    void loadFloorplan();

    return () => {
      isMounted = false;
    };
  }, [unitId]);

  useEffect(() => {
    if (!zones.length) {
      setActiveZoneId(null);
      return;
    }
    if (activeZoneId === null) return;
    if (!zones.some(zone => zone.id === activeZoneId)) {
      setActiveZoneId(zones[0].id);
    }
  }, [activeZoneId, zones]);

  useEffect(() => {
    if (!selectedBookingId) return;
    const booking = bookings.find(item => item.id === selectedBookingId);
    if (!booking?.zoneId) return;
    if (!zones.some(zone => zone.id === booking.zoneId)) return;
    if (booking.zoneId === activeZoneId) return;
    setActiveZoneId(booking.zoneId);
  }, [activeZoneId, bookings, selectedBookingId, zones]);

  const floorplanTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => {
      const matchesFloorplan = !table.floorplanId || table.floorplanId === floorplan.id;
      return matchesFloorplan && table.isActive !== false;
    });
  }, [floorplan, tables]);

  const floorplanDims = useMemo(() => resolveCanonicalFloorplanDims(floorplan, floorplanTables), [
    floorplan,
    floorplanTables,
  ]);

  const visibleTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => {
      const matchesFloorplan = !table.floorplanId || table.floorplanId === floorplan.id;
      const matchesZone = activeZoneId ? table.zoneId === activeZoneId : true;
      return matchesFloorplan && matchesZone && table.isActive !== false;
    });
  }, [activeZoneId, floorplan, tables]);

  const debugRawGeometry = useMemo(() => {
    const table = visibleTables[0];
    if (!table) return null;
    const geometry = normalizeTableGeometry(table);
    return {
      id: table.id,
      x: geometry.x,
      y: geometry.y,
      w: geometry.w,
      h: geometry.h,
      rot: geometry.rot,
    };
  }, [visibleTables]);

  const normalizedDetected = useMemo(
    () => (debugRawGeometry ? looksNormalized(debugRawGeometry, floorplanDims) : false),
    [debugRawGeometry, floorplanDims]
  );

  const upcomingWarningMinutes = useMemo(() => {
    if (
      typeof settings?.upcomingWarningMinutes === 'number' &&
      Number.isFinite(settings.upcomingWarningMinutes) &&
      settings.upcomingWarningMinutes > 0
    ) {
      return Math.round(settings.upcomingWarningMinutes);
    }
    return 30;
  }, [settings?.upcomingWarningMinutes]);

  const tableStatusById = useMemo(() => {
    const statusMap = new Map<string, TableStatus>();
    const upcomingCutoff = new Date(now.getTime() + upcomingWarningMinutes * 60 * 1000);

    bookings.forEach(booking => {
      const start = booking.startTime?.toDate?.() ?? null;
      const end = booking.endTime?.toDate?.() ?? null;
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

      const assignedTableIds = new Set<string>([
        ...(booking.assignedTableIds ?? []),
        ...(booking.allocationFinal?.tableIds ?? []),
        ...(booking.allocated?.tableIds ?? []),
      ]);
      if (!assignedTableIds.size) return;

      const isActive = start.getTime() <= now.getTime() && now.getTime() < end.getTime();
      const isUpcoming = start.getTime() > now.getTime() && start.getTime() <= upcomingCutoff.getTime();

      assignedTableIds.forEach(tableId => {
        const current = statusMap.get(tableId) ?? 'free';
        if (isActive) {
          statusMap.set(tableId, 'occupied');
          return;
        }
        if (isUpcoming && current !== 'occupied') {
          statusMap.set(tableId, 'upcoming');
          return;
        }
        if (!statusMap.has(tableId)) statusMap.set(tableId, 'free');
      });
    });

    return statusMap;
  }, [bookings, now, upcomingWarningMinutes]);

  const resolveBookingDate = (value: unknown) => {
    if (value instanceof Date) return value;

    if (value && typeof value === 'object') {
      const maybeDate = value as { toDate?: () => Date };
      if (typeof maybeDate.toDate === 'function') {
        const resolved = maybeDate.toDate();
        return resolved instanceof Date ? resolved : null;
      }
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  };

  const resolveBookingTableIds = (booking: Booking) =>
    new Set<string>([
      ...(booking.assignedTableIds ?? []),
      ...(booking.allocationFinal?.tableIds ?? []),
      ...(booking.allocated?.tableIds ?? []),
    ]);

  const resolveBookingHeadcount = (booking: Booking) => {
    const count = Number(booking.headcount);
    if (!Number.isFinite(count) || count <= 0) return null;
    return count;
  };

  const selectedBooking = useMemo(
    () => bookings.find(booking => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  );

  const selectedAssignedTableIds = useMemo(() => {
    if (!selectedBooking) return new Set<string>();
    return resolveBookingTableIds(selectedBooking);
  }, [selectedBooking]);

  const selectedBookingHasTables = useMemo(
    () => selectedAssignedTableIds.size > 0,
    [selectedAssignedTableIds]
  );
  const selectedBookingReason = selectedBooking?.allocated?.diagnosticsSummary ?? null;
  const selectedBookingHasNoFit =
    Boolean(selectedBooking) && !selectedBookingHasTables && selectedBookingReason === 'NO_FIT';

  const recommendedTableIds = useMemo(() => {
    const recommendations = new Set<string>();
    if (!selectedBooking || selectedBookingHasTables) return recommendations;

    const headcount = resolveBookingHeadcount(selectedBooking);
    const candidates = visibleTables.filter(
      table => tableStatusById.get(table.id) !== 'occupied' && !selectedAssignedTableIds.has(table.id)
    );
    if (!candidates.length) return recommendations;

    const ranked = candidates.map(table => {
      const capacityMax =
        typeof table.capacityMax === 'number' && Number.isFinite(table.capacityMax)
          ? table.capacityMax
          : null;

      let rank = 2;
      if (headcount !== null && capacityMax !== null) {
        rank = capacityMax >= headcount ? 1 : 3;
      }
      return { table, rank };
    });

    const rank1 = ranked.filter(item => item.rank === 1);
    const rank2 = ranked.filter(item => item.rank === 2);
    const rank3 = ranked.filter(item => item.rank === 3);

    const preferred = rank1.length > 0 ? [...rank1, ...rank2] : rank2.length > 0 ? rank2 : rank3;

    preferred.slice(0, 3).forEach(item => recommendations.add(item.table.id));
    return recommendations;
  }, [selectedAssignedTableIds, selectedBooking, selectedBookingHasTables, tableStatusById, visibleTables]);

  const conflictTableIds = useMemo(() => {
    const tableMap = new Map<string, Array<{ start: Date; end: Date }>>();

    bookings.forEach(booking => {
      const start = resolveBookingDate(booking.startTime);
      const end = resolveBookingDate(booking.endTime);
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      if (end.getTime() <= start.getTime()) return;

      const tableIds = resolveBookingTableIds(booking);
      if (!tableIds.size) return;

      tableIds.forEach(tableId => {
        const entries = tableMap.get(tableId) ?? [];
        entries.push({ start, end });
        tableMap.set(tableId, entries);
      });
    });

    const conflicts = new Set<string>();
    tableMap.forEach((entries, tableId) => {
      if (entries.length < 2) return;
      const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime());
      let latestEnd = sorted[0].end.getTime();

      for (let i = 1; i < sorted.length; i += 1) {
        const entry = sorted[i];
        if (entry.start.getTime() < latestEnd) {
          conflicts.add(tableId);
          break;
        }
        latestEnd = Math.max(latestEnd, entry.end.getTime());
      }
    });

    return conflicts;
  }, [bookings]);

  const selectedBookingHasConflict = useMemo(() => {
    if (!selectedAssignedTableIds.size) return false;
    return Array.from(selectedAssignedTableIds).some(tableId => conflictTableIds.has(tableId));
  }, [conflictTableIds, selectedAssignedTableIds]);

  const capacityMode = settings?.capacityMode ?? 'daily';
  const timeWindowCapacity =
    typeof settings?.timeWindowCapacity === 'number' && settings.timeWindowCapacity > 0
      ? settings.timeWindowCapacity
      : null;

  const bucketMinutes =
    typeof settings?.bucketMinutes === 'number' && settings.bucketMinutes > 0
      ? Math.round(settings.bucketMinutes)
      : 15;

  const referenceTime = useMemo(() => {
    const reference = new Date(selectedDate);
    reference.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return reference;
  }, [now, selectedDate]);

  const currentBucketKey = useMemo(() => toBucketKey(referenceTime, bucketMinutes), [bucketMinutes, referenceTime]);

  const capacityUsed = useMemo(() => {
    if (!capacity) return 0;
    if (capacityMode === 'timeWindow') {
      const byTimeBucket = capacity.byTimeBucket ?? {};
      return byTimeBucket[currentBucketKey] ?? 0;
    }
    return capacity.totalCount ?? capacity.count ?? 0;
  }, [capacity, capacityMode, currentBucketKey]);

  const capacityLimit = useMemo(() => {
    if (capacityMode === 'timeWindow') return timeWindowCapacity;
    return capacity?.limit ?? settings?.dailyCapacity ?? null;
  }, [capacity?.limit, capacityMode, settings?.dailyCapacity, timeWindowCapacity]);

  const hasCapacitySettings = Boolean(settings);

  const upcomingWarningLabel =
    typeof settings?.upcomingWarningMinutes === 'number' && Number.isFinite(settings.upcomingWarningMinutes)
      ? `Közelgő figyelmeztetés: ${Math.round(settings.upcomingWarningMinutes)} perc`
      : null;

  if (floorplanLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4 text-sm text-[var(--color-text-secondary)]">
        Betöltés...
      </div>
    );
  }

  if (floorplanError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {floorplanError}
      </div>
    );
  }

  if (!floorplan || !hasCapacitySettings) {
    return (
      <div className="rounded-2xl border border-gray-200 p-4 text-sm text-[var(--color-text-secondary)]">
        Nincs elérhető asztaltérkép vagy kapacitás beállítás ehhez a naphoz.
      </div>
    );
  }

  const renderStatusColor = (status: TableStatus) => {
    switch (status) {
      case 'occupied':
        return 'color-mix(in srgb, var(--color-danger) 22%, transparent)';
      case 'upcoming':
        return 'color-mix(in srgb, #f59e0b 22%, transparent)';
      case 'free':
      default:
        return 'color-mix(in srgb, var(--color-success) 18%, transparent)';
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-main)]">Élő asztaltérkép</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {selectedDate.toLocaleDateString('hu-HU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="text-sm font-semibold text-[var(--color-text-main)]">
          {capacityLimit !== null ? (
            <>
              {capacityUsed} / {capacityLimit}{' '}
              <span className="text-xs text-[var(--color-text-secondary)]">
                {capacityMode === 'timeWindow' ? 'aktuális idősáv' : 'napi kapacitás'}
              </span>
              {recommendedTableIds.size > 0 && (
                <div className="text-[11px] text-[var(--color-text-secondary)]">
                  Ajánlott asztalok: szaggatott keret
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)]">Kapacitás nincs megadva.</span>
          )}
        </div>
      </div>

      {selectedBooking && (
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase text-[var(--color-text-secondary)]">
          {selectedBookingHasNoFit && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
              NO_FIT – nincs megfelelő asztal
            </span>
          )}
          {selectedBookingHasConflict && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
              Konfliktus – átfedő foglalás
            </span>
          )}
          {selectedBookingReason && !selectedBookingHasNoFit && !selectedBookingHasConflict && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
              {selectedBookingReason}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveZoneId(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              activeZoneId === null
                ? 'bg-[var(--color-primary)] text-white border-transparent'
                : 'bg-white/70 text-[var(--color-text-secondary)] border-gray-200'
            }`}
          >
            Összes
          </button>

          {zones.map(zone => (
            <button
              key={zone.id}
              type="button"
              onClick={() => setActiveZoneId(zone.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                activeZoneId === zone.id
                  ? 'bg-[var(--color-primary)] text-white border-transparent'
                  : 'bg-white/70 text-[var(--color-text-secondary)] border-gray-200'
              }`}
            >
              {zone.name}
            </button>
          ))}
        </div>

        {upcomingWarningLabel && (
          <span className="text-[11px] text-[var(--color-text-secondary)]">{upcomingWarningLabel}</span>
        )}
      </div>

      <div className="w-full mx-auto relative">
        <FloorplanViewportCanvas
          floorplanDims={floorplanDims}
          debugEnabled={debugEnabled}
          viewportDeps={[floorplan.id]}
          debugOverlay={context => (
            <div className="absolute left-2 top-2 z-20 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 max-w-[260px]">
              <div>
                dims: {Math.round(context.floorplanDims.width)}×{Math.round(context.floorplanDims.height)} (
                {context.floorplanDims.source})
              </div>
              <div>
                viewport: {Math.round(context.viewportRect.width)}×{Math.round(context.viewportRect.height)}
              </div>
              <div>
                scale: {context.transform.scale.toFixed(3)} | offset: {context.transform.offsetX.toFixed(1)},
                {context.transform.offsetY.toFixed(1)} | ready: {context.transform.ready ? 'yes' : 'no'}
              </div>
              <div>normalizedDetected: {normalizedDetected ? 'yes' : 'no'}</div>
              {debugRawGeometry && (
                <div>
                  raw: {debugRawGeometry.x.toFixed(1)},{debugRawGeometry.y.toFixed(1)} {debugRawGeometry.w.toFixed(1)}×
                  {debugRawGeometry.h.toFixed(1)} r{debugRawGeometry.rot.toFixed(1)}
                </div>
              )}
            </div>
          )}
          renderWorld={() => (
            <FloorplanWorldLayer
              tables={visibleTables}
              obstacles={floorplan.obstacles ?? []}
              floorplanDims={floorplanDims}
              tableDefaults={TABLE_GEOMETRY_DEFAULTS}
              appearance={{
                getStatus: table => tableStatusById.get(table.id) ?? 'free',
                renderStatusColor,
                isSelected: table => selectedAssignedTableIds.has(table.id),
                isRecommended: table =>
                  !selectedAssignedTableIds.has(table.id) && recommendedTableIds.has(table.id),
                hasConflict: table => conflictTableIds.has(table.id),
                showCapacity: true,
              }}
            />
          )}
        />
      </div>
    </div>
  );
};

export default ReservationFloorplanPreview;
