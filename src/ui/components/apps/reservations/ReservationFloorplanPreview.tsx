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

const ReservationFloorplanPreview: React.FC<ReservationFloorplanPreviewProps> = ({
  unitId,
  selectedDate,
  bookings,
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
    if (!activeZoneId || !zones.some(zone => zone.id === activeZoneId)) {
      setActiveZoneId(zones[0].id);
    }
  }, [activeZoneId, zones]);

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

  const { width: floorplanWidth, height: floorplanHeight } =
    normalizeFloorplanDimensions(floorplan);
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

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
            </>
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)]">
              Kapacitás nincs megadva.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="overflow-auto">
        <div
          className="relative border border-gray-200 rounded-xl bg-white/80"
          style={{ width: floorplanWidth, height: floorplanHeight }}
        >
          {floorplan.backgroundImageUrl && (
            <img
              src={floorplan.backgroundImageUrl}
              alt={floorplan.name}
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}
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

            return (
              <div
                key={table.id}
                className="absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 pointer-events-none"
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
                }}
              >
                <span>{table.name}</span>
                {table.capacityMax && (
                  <span className="text-[9px] text-gray-500">
                    max {table.capacityMax}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReservationFloorplanPreview;
