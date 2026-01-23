import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import {
  getSeatingSettings,
  listFloorplans,
} from '../../../../core/services/seatingAdminService';
import { listTables, listZones } from '../../../../core/services/seatingService';
import {
  normalizeFloorplanDimensions,
  normalizeTableGeometry,
} from '../../../../core/utils/seatingNormalize';

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

const GRID_SPACING = 24;
const gridBackgroundStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.45) 1px, transparent 1px)',
  backgroundSize: `${GRID_SPACING}px ${GRID_SPACING}px`,
  backgroundPosition: '0 0',
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
  const floorplanViewportRef = useRef<HTMLDivElement | null>(null);
  const [floorplanViewportRect, setFloorplanViewportRect] = useState({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

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
        const [settingsData, floorplansData, zonesData, tablesData] =
          await Promise.all([
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
        if (isMounted) {
          setFloorplanLoading(false);
        }
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
    if (activeZoneId === null) {
      return;
    }
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

  const measureViewport = useMemo(
    () => () => {
      const rect = floorplanViewportRef.current?.getBoundingClientRect();
      setFloorplanViewportRect({
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
      });
    },
    []
  );

  const floorplanDims = useMemo(() => {
    if (!floorplan) {
      return { width: 1, height: 1 };
    }
    const dims = normalizeFloorplanDimensions(floorplan);
    return {
      width: dims.width > 0 ? dims.width : 1,
      height: dims.height > 0 ? dims.height : 1,
    };
  }, [floorplan]);

  const floorplanRenderTransform = useMemo(() => {
    const w = floorplanDims.width;
    const h = floorplanDims.height;
    const rectWidth = floorplanViewportRect.width ?? 0;
    const rectHeight = floorplanViewportRect.height ?? 0;

    if (rectWidth <= 0 || rectHeight <= 0 || w <= 0 || h <= 0) {
      return {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rectWidth: 0,
        rectHeight: 0,
      };
    }

    const scale = Math.min(rectWidth / w, rectHeight / h);
    return {
      scale,
      offsetX: (rectWidth - w * scale) / 2,
      offsetY: (rectHeight - h * scale) / 2,
      rectWidth,
      rectHeight,
    };
  }, [floorplanDims.height, floorplanDims.width, floorplanViewportRect]);

  useLayoutEffect(() => {
    measureViewport();
  }, [measureViewport]);

  useLayoutEffect(() => {
    const node = floorplanViewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureViewport());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureViewport]);

  const visibleTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => {
      const matchesFloorplan = !table.floorplanId || table.floorplanId === floorplan.id;
      const matchesZone = activeZoneId ? table.zoneId === activeZoneId : true;
      return matchesFloorplan && matchesZone && table.isActive !== false;
    });
  }, [activeZoneId, floorplan, tables]);

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
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }

      const assignedTableIds = new Set<string>([
        ...(booking.assignedTableIds ?? []),
        ...(booking.allocationFinal?.tableIds ?? []),
        ...(booking.allocated?.tableIds ?? []),
      ]);
      if (!assignedTableIds.size) return;

      // Table status calculation:
      // - RED when the reservation overlaps "now" (start <= now < end).
      // - YELLOW when the next reservation starts within upcomingWarningMinutes.
      // - GREEN when neither applies.
      const isActive = start.getTime() <= now.getTime() && now.getTime() < end.getTime();
      const isUpcoming =
        start.getTime() > now.getTime() && start.getTime() <= upcomingCutoff.getTime();

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
        if (!statusMap.has(tableId)) {
          statusMap.set(tableId, 'free');
        }
      });
    });

    return statusMap;
  }, [bookings, now, upcomingWarningMinutes]);

  const resolveBookingDate = (value: unknown) => {
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value === 'object') {
      const maybeDate = value as { toDate?: () => Date };
      if (typeof maybeDate.toDate === 'function') {
        const resolved = maybeDate.toDate();
        return resolved instanceof Date ? resolved : null;
      }
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
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

  const recommendedTableIds = useMemo(() => {
    const recommendations = new Set<string>();
    if (!selectedBooking || selectedBookingHasTables) return recommendations;
    const headcount = resolveBookingHeadcount(selectedBooking);
    const candidates = visibleTables.filter(
      table =>
        tableStatusById.get(table.id) !== 'occupied' &&
        !selectedAssignedTableIds.has(table.id)
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
    const preferred =
      rank1.length > 0
        ? [...rank1, ...rank2]
        : rank2.length > 0
        ? rank2
        : rank3;
    preferred.slice(0, 3).forEach(item => recommendations.add(item.table.id));
    return recommendations;
  }, [
    selectedAssignedTableIds,
    selectedBooking,
    selectedBookingHasTables,
    tableStatusById,
    visibleTables,
  ]);

  const conflictTableIds = useMemo(() => {
    const tableMap = new Map<
      string,
      Array<{ start: Date; end: Date }>
    >();

    bookings.forEach(booking => {
      const start = resolveBookingDate(booking.startTime);
      const end = resolveBookingDate(booking.endTime);
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }
      if (end.getTime() <= start.getTime()) {
        return;
      }
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

  const currentBucketKey = useMemo(
    () => toBucketKey(referenceTime, bucketMinutes),
    [bucketMinutes, referenceTime]
  );

  const capacityUsed = useMemo(() => {
    if (!capacity) return 0;
    if (capacityMode === 'timeWindow') {
      const byTimeBucket = capacity.byTimeBucket ?? {};
      return byTimeBucket[currentBucketKey] ?? 0;
    }
    return capacity.totalCount ?? capacity.count ?? 0;
  }, [capacity, capacityMode, currentBucketKey]);

  const capacityLimit = useMemo(() => {
    if (capacityMode === 'timeWindow') {
      return timeWindowCapacity;
    }
    return capacity?.limit ?? settings?.dailyCapacity ?? null;
  }, [capacity?.limit, capacityMode, settings?.dailyCapacity, timeWindowCapacity]);

  const hasCapacitySettings = Boolean(settings);
  const upcomingWarningLabel =
    typeof settings?.upcomingWarningMinutes === 'number' &&
    Number.isFinite(settings.upcomingWarningMinutes)
      ? `Közelgő figyelmeztetés: ${Math.round(settings.upcomingWarningMinutes)} perc`
      : null;
  const floorplanWidth = floorplanDims.width;
  const floorplanHeight = floorplanDims.height;
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

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
          <h2 className="text-lg font-semibold text-[var(--color-text-main)]">
            Élő asztaltérkép
          </h2>
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
            <span className="text-xs text-[var(--color-text-secondary)]">
              Kapacitás nincs megadva.
            </span>
          )}
        </div>
      </div>

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
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            {upcomingWarningLabel}
          </span>
        )}
      </div>

      <div className="w-full max-w-[min(90vh,100%)] aspect-square mx-auto overflow-hidden min-w-0 min-h-0">
        <div
          ref={floorplanViewportRef}
          className="relative h-full w-full border border-gray-200 rounded-xl bg-white/80"
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${floorplanRenderTransform.offsetX}px, ${floorplanRenderTransform.offsetY}px) scale(${floorplanRenderTransform.scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div
              className="relative"
              style={{ width: floorplanWidth, height: floorplanHeight }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  width: floorplanWidth,
                  height: floorplanHeight,
                  zIndex: 0,
                  ...gridBackgroundStyle,
                }}
              />
              {(floorplan.obstacles ?? []).map(obstacle => (
                <div
                  key={obstacle.id}
                  className="absolute border border-dashed border-gray-300 bg-gray-200/40"
                  style={{
                    left: obstacle.x,
                    top: obstacle.y,
                    width: obstacle.w,
                    height: obstacle.h,
                    transform: `rotate(${obstacle.rot ?? 0}deg)`,
                    zIndex: 1,
                  }}
                />
              ))}
              {visibleTables.map(table => {
                const geometry = normalizeTableGeometry(table);
                const maxX = Math.max(0, floorplanWidth - geometry.w);
                const maxY = Math.max(0, floorplanHeight - geometry.h);
                const left = clamp(geometry.x, 0, maxX);
                const top = clamp(geometry.y, 0, maxY);
                const rotation = geometry.rot;
                const status = tableStatusById.get(table.id) ?? 'free';
                const isSelected = selectedAssignedTableIds.has(table.id);
                const hasConflict = conflictTableIds.has(table.id);
                const isRecommended = !isSelected && recommendedTableIds.has(table.id);

                return (
                  <div
                    key={table.id}
                    className={`absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 pointer-events-none relative ${
                      isSelected ? 'z-10 ring-2 ring-[var(--color-primary)]' : ''
                    }`}
                    style={{
                      left,
                      top,
                      width: geometry.w,
                      height: geometry.h,
                      borderRadius: geometry.shape === 'circle' ? geometry.radius : 8,
                      border: '2px solid rgba(148, 163, 184, 0.6)',
                      backgroundColor: renderStatusColor(status),
                      transform: `rotate(${rotation}deg)`,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      outline: isRecommended
                        ? '2px dashed rgba(251, 191, 36, 0.9)'
                        : undefined,
                      outlineOffset: isRecommended ? 2 : undefined,
                      zIndex: 2,
                    }}
                  >
                    <span>{table.name}</span>
                    {table.capacityMax && (
                      <span className="text-[9px] text-gray-500">
                        max {table.capacityMax}
                      </span>
                    )}
                    {hasConflict && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white text-[8px] text-white flex items-center justify-center">
                        !
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationFloorplanPreview;
