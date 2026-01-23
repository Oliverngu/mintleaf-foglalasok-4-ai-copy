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
  DEFAULT_TABLE_GEOMETRY,
  isPlaceholderFloorplanDims,
  normalizeFloorplanDimensions,
  normalizeTableGeometry,
  normalizeTableGeometryToFloorplan,
} from '../../../../core/utils/seatingNormalize';
import { getFloorplanRenderContext } from '../../../../core/utils/seatingFloorplanRender';

type ReservationFloorplanPreviewProps = {
  unitId: string;
  selectedDate: Date;
  bookings: Booking[];
  selectedBookingId?: string | null;
};

type TableStatus = 'occupied' | 'upcoming' | 'free';

type DebugStats = {
  unitId: string;
  resolvedFloorplanId: string | null;
  settingsActiveFloorplanId: string | null;
  storedDims: string;
  refDims: string;
  logicalDims: string;
  logicalDimsSource: string;
  bg: string;
  bgMode: string;
  bgNatural: string;
  container: string;
  transform: string;
  mismatchCount: number;
  effectiveReady: boolean;
};

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

const safeNum = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};


const measureContainer = (node: HTMLDivElement | null) => {
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const width = rect.width || node.clientWidth || 0;
  const height = rect.height || node.clientHeight || 0;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
};

const getFloorplanIdLike = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const candidate =
    record.floorplanId ??
    record.floorplanRefId ??
    record.floorplanUid ??
    record.floorplanUID;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
};

const isDev = process.env.NODE_ENV !== 'production';

const shouldShowDebug = () => {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.has('fpdebug')) return true;
    if (localStorage.getItem('ml_fp_debug') === '1') return true;
  } catch (error) {
    console.warn('Failed to read debug flags for floorplan preview:', error);
  }
  return isDev;
};

const coerceDims = (ref?: { width?: unknown; height?: unknown } | null) => {
  const width = Number(ref?.width);
  const height = Number(ref?.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width >= 10000 ||
    height >= 10000
  ) {
    return null;
  }
  return { width, height };
};

const getMismatchReason = (
  table: Table,
  resolvedFloorplanId: string | null,
  dims: { width: number; height: number }
): 'OK' | 'FLOORPLAN_ID_MISMATCH' | 'DIMS_MISMATCH' => {
  if (!resolvedFloorplanId) {
    return 'OK';
  }
  const tableFloorplanId = getFloorplanIdLike(table);
  if (tableFloorplanId && tableFloorplanId !== resolvedFloorplanId) {
    return 'FLOORPLAN_ID_MISMATCH';
  }
  const floorplanRef = coerceDims(table.floorplanRef);
  if (!floorplanRef) {
    return 'OK';
  }
  if (isPlaceholderFloorplanDims(floorplanRef.width, floorplanRef.height)) {
    return 'OK';
  }
  if (floorplanRef.width !== dims.width || floorplanRef.height !== dims.height) {
    return 'DIMS_MISMATCH';
  }
  return 'OK';
};


/*
 * Root cause: preview used ad-hoc logical dims and a fixed-height container, so its
 * scale diverged from the editor even with a shared wrapper transform. That made
 * table spacing feel off despite correct rescaling of geometry.
 * Fix: mirror editor dims selection, drop fixed-height sizing, and let a single
 * transform wrapper be the only scale. A debug sample logs rescale math if refs
 * mismatch.
 */
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
  const [settingsActiveFloorplanId, setSettingsActiveFloorplanId] = useState<string | null>(null);
  const [resolvedFloorplanId, setResolvedFloorplanId] = useState<string | null>(null);
  const [tablesTotal, setTablesTotal] = useState(0);
  const [zonesTotal, setZonesTotal] = useState(0);
  const [floorplanLoading, setFloorplanLoading] = useState(true);
  const [floorplanError, setFloorplanError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
  const [capacity, setCapacity] = useState<ReservationCapacity | null>(null);
  const [now, setNow] = useState(new Date());
  const [bgNaturalSize, setBgNaturalSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [bgFailed, setBgFailed] = useState(false);
  const [renderMetrics, setRenderMetrics] = useState({
    containerW: 0,
    containerH: 0,
  });
  type RenderContext = {
    ready: boolean;
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  const [renderContext, setRenderContext] = useState<RenderContext>({
    ready: false,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const FP_DEBUG = useMemo(() => shouldShowDebug(), []);
  const showDebug = FP_DEBUG;
  const loggedMismatchRef = useRef(false);
  const loggedPixelSampleIdRef = useRef<string | null>(null);

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

        const targetFloorplanId = settingsData.activeFloorplanId ?? null;
        const resolvedFloorplan =
          floorplansData.find(plan => plan.id === targetFloorplanId) ??
          floorplansData[0] ??
          null;
        setSettingsActiveFloorplanId(targetFloorplanId);
        setResolvedFloorplanId(resolvedFloorplan?.id ?? null);
        setTablesTotal(tablesData.length);
        setZonesTotal(zonesData.length);

        const baseZones = zonesData.filter(zone => zone.isActive !== false);
        const hasZoneFloorplanId = baseZones.some(zone => getFloorplanIdLike(zone));
        const filteredZones =
          resolvedFloorplan && hasZoneFloorplanId
            ? baseZones.filter(zone => getFloorplanIdLike(zone) === resolvedFloorplan.id)
            : baseZones;
        const filteredTables = tablesData;

        setFloorplan(resolvedFloorplan);
        setZones(filteredZones);
        setTables(filteredTables);
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
      setActiveZoneId(null);
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

  useEffect(() => {
    setBgNaturalSize(null);
    setBgFailed(false);
  }, [floorplan?.backgroundImageUrl]);

  const visibleTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => {
      const tableFloorplanId = getFloorplanIdLike(table);
      const matchesFloorplan =
        Boolean(resolvedFloorplanId) && tableFloorplanId === resolvedFloorplanId;
      const matchesZone = activeZoneId ? table.zoneId === activeZoneId : true;
      return matchesFloorplan && matchesZone && table.isActive !== false;
    });
  }, [activeZoneId, floorplan, resolvedFloorplanId, tables]);

  const floorplanTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => {
      const tableFloorplanId = getFloorplanIdLike(table);
      const matchesFloorplan =
        Boolean(resolvedFloorplanId) && tableFloorplanId === resolvedFloorplanId;
      return matchesFloorplan && table.isActive !== false;
    });
  }, [floorplan, resolvedFloorplanId, tables]);

  const displayZones = useMemo(
    () =>
      zones.filter(zone => {
        const name =
          typeof zone.name === 'string' ? zone.name.trim().toLocaleLowerCase('hu-HU') : '';
        return !(zone.id === 'all' || name === 'összes');
      }),
    [zones]
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleTables.map(table => table.id)),
    [visibleTables]
  );

  const refDims = useMemo(() => {
    const counts = new Map<string, { width: number; height: number; count: number }>();
    floorplanTables.forEach(table => {
      const dims = coerceDims(table.floorplanRef);
      if (!dims) return;
      const key = `${dims.width}x${dims.height}`;
      const current = counts.get(key);
      if (current) {
        current.count += 1;
      } else {
        counts.set(key, { width: dims.width, height: dims.height, count: 1 });
      }
    });
    let best: { width: number; height: number; count: number } | null = null;
    counts.forEach(candidate => {
      if (!best) {
        best = candidate;
        return;
      }
      if (candidate.count > best.count) {
        best = candidate;
        return;
      }
      if (candidate.count === best.count) {
        const candidateArea = candidate.width * candidate.height;
        const bestArea = best.width * best.height;
        if (candidateArea > bestArea) {
          best = candidate;
        }
      }
    });
    return best;
  }, [floorplanTables]);

  const geometryStats = useMemo(() => {
    let maxValue = 0;
    visibleTables.forEach(table => {
      const geometry = normalizeTableGeometry(table, DEFAULT_TABLE_GEOMETRY);
      maxValue = Math.max(
        maxValue,
        geometry.x + geometry.w,
        geometry.y + geometry.h
      );
    });
    return { maxValue, count: visibleTables.length };
  }, [visibleTables]);

  const floorplanDimensions = useMemo(() => {
    if (!floorplan) {
      return {
        logicalWidth: 1,
        logicalHeight: 1,
        logicalDimsSource: 'fallback' as const,
      };
    }
    const storedDims = normalizeFloorplanDimensions(floorplan);
    const hasStoredDims = !isPlaceholderFloorplanDims(storedDims.width, storedDims.height);
    const hasImageDims = Boolean(bgNaturalSize?.w && bgNaturalSize?.h);
    if (hasStoredDims) {
      return {
        logicalWidth: storedDims.width,
        logicalHeight: storedDims.height,
        logicalDimsSource: 'stored' as const,
      };
    }
    if (refDims) {
      return {
        logicalWidth: refDims.width,
        logicalHeight: refDims.height,
        logicalDimsSource: 'tableRef' as const,
      };
    }
    if (hasImageDims) {
      return {
        logicalWidth: bgNaturalSize?.w ?? 1,
        logicalHeight: bgNaturalSize?.h ?? 1,
        logicalDimsSource: 'image' as const,
      };
    }
    return { logicalWidth: 1, logicalHeight: 1, logicalDimsSource: 'fallback' as const };
  }, [bgNaturalSize, floorplan, refDims]);

  const logicalWidth = floorplanDimensions.logicalWidth;
  const logicalHeight = floorplanDimensions.logicalHeight;
  const effectiveDims = { width: logicalWidth, height: logicalHeight };
  const bgUrl = floorplan?.backgroundImageUrl ?? null;
  const hasBgUrl = Boolean(bgUrl && !bgFailed);

  useLayoutEffect(() => {
    const measureViewportRect = () => {
      const node = containerRef.current;
      if (!node) return;
      const { width, height } = node.getBoundingClientRect();
      setRenderMetrics(prev =>
        prev.containerW === width && prev.containerH === height
          ? prev
          : { ...prev, containerW: width, containerH: height }
      );
      return { width, height };
    };

    let rafId = 0;
    let retries = 0;
    const maxRetries = 6;
    const retryMeasure = () => {
      const result = measureViewportRect();
      if (
        result &&
        result.width > 0 &&
        result.height > 0
      ) {
        return;
      }
      if (retries < maxRetries) {
        retries += 1;
        rafId = window.requestAnimationFrame(retryMeasure);
      }
    };
    rafId = window.requestAnimationFrame(retryMeasure);
    const handleViewportEvent = () => {
      window.cancelAnimationFrame(rafId);
      retries = 0;
      rafId = window.requestAnimationFrame(retryMeasure);
    };

    window.addEventListener('resize', handleViewportEvent, { passive: true });
    window.addEventListener('scroll', handleViewportEvent, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => handleViewportEvent());
      observer.observe(containerRef.current);
    }
    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined' && containerRef.current) {
      intersectionObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          handleViewportEvent();
        }
      });
      intersectionObserver.observe(containerRef.current);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleViewportEvent);
      window.removeEventListener('scroll', handleViewportEvent);
      observer?.disconnect();
      intersectionObserver?.disconnect();
    };
  }, [floorplan?.id, logicalHeight, logicalWidth]);

  useEffect(() => {
    if (
      renderMetrics.containerW <= 0 ||
      renderMetrics.containerH <= 0 ||
      logicalWidth <= 0 ||
      logicalHeight <= 0
    ) {
      if (renderMetrics.containerW <= 0 || renderMetrics.containerH <= 0) {
        const measured = measureContainer(containerRef.current);
        if (measured) {
          setRenderMetrics(prev =>
            prev.containerW === measured.width && prev.containerH === measured.height
              ? prev
              : { ...prev, containerW: measured.width, containerH: measured.height }
          );
        }
      }
      setRenderContext(prev =>
        !prev.ready && prev.scale === 1 && prev.offsetX === 0 && prev.offsetY === 0
          ? prev
          : { ready: false, scale: 1, offsetX: 0, offsetY: 0 }
      );
      return;
    }
    const transform = getFloorplanRenderContext(
      { width: renderMetrics.containerW, height: renderMetrics.containerH, left: 0, top: 0 },
      logicalWidth,
      logicalHeight
    );
    const scale = transform.scale;
    const offsetX = transform.offsetX;
    const offsetY = transform.offsetY;
    setRenderContext(prev =>
      prev.ready &&
      prev.scale === scale &&
      prev.offsetX === offsetX &&
      prev.offsetY === offsetY
        ? prev
        : { ready: transform.ready, scale, offsetX, offsetY }
    );
  }, [logicalHeight, logicalWidth, renderMetrics.containerH, renderMetrics.containerW]);

  const effectiveRenderContext = useMemo(() => {
    if (renderContext.ready) {
      return { ...renderContext, effectiveReady: true };
    }
    const measured = measureContainer(containerRef.current);
    if (measured && logicalWidth > 0 && logicalHeight > 0) {
      const transform = getFloorplanRenderContext(
        { width: measured.width, height: measured.height, left: 0, top: 0 },
        logicalWidth,
        logicalHeight
      );
      return {
        ready: transform.ready,
        effectiveReady: transform.ready,
        scale: transform.scale,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
      };
    }
    return { ready: false, effectiveReady: false, scale: 1, offsetX: 0, offsetY: 0 };
  }, [logicalHeight, logicalWidth, renderContext]);

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

  const selectedWindow = useMemo(() => {
    if (!selectedBookingId || !selectedBooking) return null;
    const start = resolveBookingDate(selectedBooking.startTime);
    const end = resolveBookingDate(selectedBooking.endTime);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    if (end.getTime() <= start.getTime()) {
      return null;
    }
    return { start, end };
  }, [selectedBooking, selectedBookingId]);

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

  const blockedForSelectedTableIds = useMemo(() => {
    if (!selectedWindow || !selectedBookingId) return new Set<string>();
    const blocked = new Set<string>();
    bookings.forEach(booking => {
      if (booking.id === selectedBookingId) return;
      const start = resolveBookingDate(booking.startTime);
      const end = resolveBookingDate(booking.endTime);
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }
      if (end.getTime() <= start.getTime()) {
        return;
      }
      const overlapsSelectionWindow =
        start.getTime() < selectedWindow.end.getTime() &&
        selectedWindow.start.getTime() < end.getTime();
      if (!overlapsSelectionWindow) return;
      const tableIds = resolveBookingTableIds(booking);
      if (!tableIds.size) return;
      tableIds.forEach(tableId => {
        if (visibleTableIdSet.has(tableId)) {
          blocked.add(tableId);
        }
      });
    });
    return blocked;
  }, [bookings, selectedBookingId, selectedWindow, visibleTableIdSet]);

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

  const logicalDimsSource = floorplanDimensions.logicalDimsSource;
  const mismatchCount = useMemo(() => {
    let count = 0;
    tables.forEach(table => {
      if (table.isActive === false) {
        return;
      }
      const reason = getMismatchReason(table, resolvedFloorplanId, effectiveDims);
      if (reason !== 'OK') {
        count += 1;
      }
    });
    return count;
  }, [effectiveDims.height, effectiveDims.width, resolvedFloorplanId, tables]);
  useEffect(() => {
    if (!showDebug || mismatchCount === 0 || loggedMismatchRef.current) {
      return;
    }
    const sample = tables.find(table => {
      if (table.isActive === false) {
        return false;
      }
      return getMismatchReason(table, resolvedFloorplanId, effectiveDims) !== 'OK';
    });
    if (!sample) {
      return;
    }
    const baseGeometry = normalizeTableGeometry(sample, DEFAULT_TABLE_GEOMETRY);
    const fromDimsRaw = coerceDims(sample.floorplanRef);
    const fromDims =
      fromDimsRaw && !isPlaceholderFloorplanDims(fromDimsRaw.width, fromDimsRaw.height)
        ? fromDimsRaw
        : null;
    const scaleX = fromDims ? effectiveDims.width / fromDims.width : null;
    const scaleY = fromDims ? effectiveDims.height / fromDims.height : null;
    const tableFloorplanId = getFloorplanIdLike(sample);
    const mismatchReason = getMismatchReason(sample, resolvedFloorplanId, effectiveDims);
    const renderGeometry =
      fromDims &&
      (fromDims.width !== effectiveDims.width || fromDims.height !== effectiveDims.height)
        ? normalizeTableGeometryToFloorplan(baseGeometry, fromDims, effectiveDims)
        : baseGeometry;
    try {
      console.debug('[reservations] preview table rescale sample', {
        mismatchReason,
        resolvedFloorplanId,
        tableFloorplanIdLike: tableFloorplanId ?? null,
        tableFloorplanId: sample.floorplanId ?? null,
        tableId: sample.id,
        fromDims,
        toDims: effectiveDims,
        scaleX,
        scaleY,
        baseGeometry,
        renderGeometry,
      });
      loggedMismatchRef.current = true;
    } catch (error) {
      console.warn('[reservations] preview rescale debug failed', error);
    }
  }, [effectiveDims, mismatchCount, resolvedFloorplanId, showDebug, tables]);

  useEffect(() => {
    if (
      !FP_DEBUG ||
      !effectiveRenderContext.effectiveReady ||
      visibleTables.length === 0
    ) {
      return;
    }
    let note = 'fallback:firstTable';
    let sample: Table | undefined;
    let querySampleId: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        const qs = new URLSearchParams(window.location.search);
        const candidate = qs.get('fpsample');
        if (candidate) {
          querySampleId = candidate.trim() || null;
        }
      } catch (error) {
        console.debug('[FP_PREVIEW_PIXEL_SAMPLE] fpsample query read failed', error);
      }
    }
    if (querySampleId) {
      sample = visibleTables.find(table => table.id === querySampleId);
      if (sample) {
        note = 'sample:query';
      }
    }
    if (!sample && typeof window !== 'undefined') {
      const storedSampleId = window.localStorage.getItem('ml_fp_sample_table_id');
      if (storedSampleId) {
        sample = visibleTables.find(table => table.id === storedSampleId) ?? undefined;
        if (sample) {
          note = 'sample:stored';
        }
      }
    }
    if (!sample && typeof window !== 'undefined') {
      const windowSampleId = (window as { __fpSampleTableId?: string }).__fpSampleTableId;
      if (windowSampleId) {
        sample = visibleTables.find(table => table.id === windowSampleId) ?? undefined;
        if (sample) {
          note = 'sample:window';
        }
      }
    }
    if (!sample) {
      sample = visibleTables[0];
    }
    if (!sample) return;
    if (loggedPixelSampleIdRef.current === sample.id) {
      return;
    }
    const baseGeometry = normalizeTableGeometry(sample, DEFAULT_TABLE_GEOMETRY);
    const fromDimsRaw = coerceDims(sample.floorplanRef);
    const fromDims =
      fromDimsRaw && !isPlaceholderFloorplanDims(fromDimsRaw.width, fromDimsRaw.height)
        ? fromDimsRaw
        : null;
    const renderGeometry =
      fromDims &&
      (fromDims.width !== effectiveDims.width || fromDims.height !== effectiveDims.height)
        ? normalizeTableGeometryToFloorplan(baseGeometry, fromDims, effectiveDims)
        : baseGeometry;
    const world = {
      x: Number.isFinite(renderGeometry.x) ? renderGeometry.x : 0,
      y: Number.isFinite(renderGeometry.y) ? renderGeometry.y : 0,
      w: Number.isFinite(renderGeometry.w) ? renderGeometry.w : 0,
      h: Number.isFinite(renderGeometry.h) ? renderGeometry.h : 0,
    };
    const scale = effectiveRenderContext.scale;
    const offsetX = effectiveRenderContext.offsetX;
    const offsetY = effectiveRenderContext.offsetY;
    const pixel = {
      x: world.x * scale + offsetX,
      y: world.y * scale + offsetY,
      w: world.w * scale,
      h: world.h * scale,
    };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ml_fp_sample_table_id', sample.id);
      (window as { __fpSampleTableId?: string }).__fpSampleTableId = sample.id;
    }
    console.debug('[FP_PREVIEW_PIXEL_SAMPLE]', {
      tag: 'FP_PIXEL_SAMPLE',
      view: 'preview',
      tableId: sample.id,
      floorplanIdLike: getFloorplanIdLike(sample),
      resolvedFloorplanId,
      effectiveDims,
      world,
      pixel,
      scale,
      offsetX,
      offsetY,
      container: { w: renderMetrics.containerW, h: renderMetrics.containerH },
      aspectRatio: `${logicalWidth} / ${logicalHeight}`,
      logicalWidth,
      logicalHeight,
      note,
      mismatchReason: getMismatchReason(sample, resolvedFloorplanId, effectiveDims),
    });
    loggedPixelSampleIdRef.current = sample.id;
  }, [
    FP_DEBUG,
    effectiveDims,
    effectiveRenderContext,
    logicalHeight,
    logicalWidth,
    renderMetrics.containerH,
    renderMetrics.containerW,
    visibleTables,
    resolvedFloorplanId,
  ]);
  const debugStats = useMemo<DebugStats>(() => {
    const storedWidth = Number(floorplan?.width);
    const storedHeight = Number(floorplan?.height);
    return {
      unitId,
      resolvedFloorplanId,
      settingsActiveFloorplanId,
      storedDims: `${Number.isFinite(storedWidth) ? storedWidth : 0}×${
        Number.isFinite(storedHeight) ? storedHeight : 0
      }`,
      refDims: refDims ? `${refDims.width}×${refDims.height} (${refDims.count})` : 'n/a',
      logicalDims: `${Math.round(logicalWidth)}×${Math.round(logicalHeight)}`,
      logicalDimsSource,
      bg: bgUrl ? (bgFailed ? 'failed' : bgNaturalSize ? 'loaded' : 'loading') : 'missing',
      bgMode: hasBgUrl ? 'scaled' : 'missing',
      bgNatural: bgNaturalSize ? `${bgNaturalSize.w}×${bgNaturalSize.h}` : 'n/a',
      container: `${Math.round(renderMetrics.containerW)}×${Math.round(renderMetrics.containerH)}`,
      transform: `scale:${effectiveRenderContext.scale.toFixed(4)} ox:${Math.round(
        effectiveRenderContext.offsetX
      )} oy:${Math.round(effectiveRenderContext.offsetY)}`,
      mismatchCount,
      effectiveReady: effectiveRenderContext.effectiveReady,
    };
  }, [
    bgFailed,
    bgNaturalSize,
    bgUrl,
    hasBgUrl,
    effectiveRenderContext.effectiveReady,
    effectiveRenderContext.offsetX,
    effectiveRenderContext.offsetY,
    effectiveRenderContext.scale,
    floorplan?.height,
    floorplan?.width,
    logicalDimsSource,
    logicalHeight,
    logicalWidth,
    mismatchCount,
    refDims,
    renderMetrics.containerH,
    renderMetrics.containerW,
    resolvedFloorplanId,
    settingsActiveFloorplanId,
    unitId,
  ]);
  const debugWarningReasons = useMemo(() => {
    if (!showDebug || renderContext.ready) return [] as string[];
    if (!(tablesTotal > 0 || tables.length > 0)) return [] as string[];
    const reasons: string[] = [];
    if (renderMetrics.containerW <= 0 || renderMetrics.containerH <= 0) {
      reasons.push('viewport rect 0x0');
    }
    if (logicalWidth <= 0 || logicalHeight <= 0) {
      reasons.push('logical dims invalid');
    }
    if (
      renderMetrics.containerW > 0 &&
      renderMetrics.containerH > 0 &&
      logicalWidth > 0 &&
      logicalHeight > 0
    ) {
      const transform = getFloorplanRenderContext(
        { width: renderMetrics.containerW, height: renderMetrics.containerH, left: 0, top: 0 },
        logicalWidth,
        logicalHeight
      );
      if (!Number.isFinite(transform.scale) || transform.scale <= 0) {
        reasons.push('transform scale invalid');
      }
    }
    return reasons;
  }, [
    logicalHeight,
    logicalWidth,
    renderContext.ready,
    renderMetrics.containerH,
    renderMetrics.containerW,
    showDebug,
    tables.length,
    tablesTotal,
  ]);

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
  if (logicalDimsSource === 'fallback' && !bgNaturalSize) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Nincs beállított alaprajz méret. Nyisd meg az Ültetés beállítások / Asztaltérkép
        szerkesztőt és rögzítsd a méretet.
      </div>
    );
  }

  const geometryMode = 'absolute';
  const bgStatus = !bgUrl
    ? 'missing'
    : bgFailed
    ? 'failed'
    : bgNaturalSize
    ? 'loaded'
    : 'missing';
  const contentWidth = effectiveRenderContext.effectiveReady
    ? Math.round(logicalWidth * effectiveRenderContext.scale)
    : 0;
  const contentHeight = effectiveRenderContext.effectiveReady
    ? Math.round(logicalHeight * effectiveRenderContext.scale)
    : 0;
  const stageMaxWidth = 900;

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
          {showDebug && (
            <>
              <p className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                floorplan: {settingsActiveFloorplanId ?? 'n/a'} | selected:{' '}
                {resolvedFloorplanId ?? floorplan?.id ?? 'n/a'} | tables:{' '}
                {tablesTotal}/{visibleTables.length} | zones: {zonesTotal}/{zones.length} | zone:{' '}
                {activeZoneId === null ? 'Összes' : activeZoneId}
              </p>
              <p className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                dims: {logicalWidth}x{logicalHeight} | source: {logicalDimsSource} | img:{' '}
                {bgNaturalSize ? `${bgNaturalSize.w}x${bgNaturalSize.h}` : 'n/a'} | bg:{' '}
                {bgStatus} | mode: {geometryMode} | maxGeom:{' '}
                {geometryStats.maxValue.toFixed(2)} | tables: {geometryStats.count} | rect:{' '}
                {Math.round(renderMetrics.containerW)}x{Math.round(renderMetrics.containerH)} | content:{' '}
                {contentWidth}x{contentHeight} | stageMax:{stageMaxWidth} | ready:{' '}
                {renderContext.ready ? 'yes' : 'no'} off: {renderContext.offsetX.toFixed(1)}/
                {renderContext.offsetY.toFixed(1)} | logical: {logicalWidth}x
                {logicalHeight} | scale: {renderContext.scale.toFixed(3)}
              </p>
            </>
          )}
          {showDebug && debugWarningReasons.length > 0 && (
            <p className="text-[10px] font-mono text-amber-600">
              render warnings: {debugWarningReasons.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end text-sm font-semibold text-[var(--color-text-main)] leading-tight">
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
          {recommendedTableIds.size > 0 && (
            <span className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
              Ajánlott asztalok: szaggatott keret
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            key="all"
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
          {displayZones.map(zone => (
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

      <div className="w-full mx-auto" style={{ maxWidth: stageMaxWidth }}>
        {mismatchCount > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ Eltérő floorplan vagy méret ({mismatchCount}). A preview az editorral egyező
            módon renderel (átméretezve).
          </div>
        )}
        <div
          ref={containerRef}
          className="relative border border-gray-300 rounded-xl bg-white overflow-hidden shadow-sm"
          style={{ width: '100%', aspectRatio: `${logicalWidth} / ${logicalHeight}` }}
        >
          {showDebug && !effectiveRenderContext.effectiveReady && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-amber-600 bg-white/70">
              Render not ready ({Math.round(renderMetrics.containerW)}x
              {Math.round(renderMetrics.containerH)})
            </div>
          )}
          {showDebug && (
            <div className="absolute top-2 left-2 z-50 pointer-events-none">
              <div className="rounded-lg border border-black/20 bg-black/70 text-white text-[11px] font-mono px-3 py-2 whitespace-pre">
                {`fp:${debugStats.resolvedFloorplanId ?? 'n/a'} (settings:${
                  debugStats.settingsActiveFloorplanId ?? 'n/a'
                })
stored:${debugStats.storedDims}  logical:${debugStats.logicalDims} (${debugStats.logicalDimsSource})
refDims:${debugStats.refDims}
bg:${debugStats.bg} (${debugStats.bgMode})  bgNatural:${debugStats.bgNatural}
container:${debugStats.container}
${debugStats.transform}  ready:${debugStats.effectiveReady ? 'yes' : 'no'}
mismatchCount:${debugStats.mismatchCount}
minClamp: OFF
fitToContent: OFF
mode: preview`}
              </div>
            </div>
          )}
          {!effectiveRenderContext.effectiveReady && (tablesTotal > 0 || tables.length > 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-text-secondary)]">
              Asztaltérkép pozicionálása…
            </div>
          )}
          {effectiveRenderContext.effectiveReady && visibleTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-text-secondary)]">
              Nincs megjeleníthető asztal ehhez a floorplanhoz / zónához.
            </div>
          )}
          <div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${effectiveRenderContext.offsetX}px, ${effectiveRenderContext.offsetY}px) scale(${effectiveRenderContext.scale})`,
              transformOrigin: 'top left',
              width: logicalWidth,
              height: logicalHeight,
            }}
          >
            {hasBgUrl && (
              <img
                src={bgUrl ?? ''}
                alt={floorplan.name}
                ref={imageRef}
                onLoad={() => {
                  const image = imageRef.current;
                  if (!image) return;
                  setBgFailed(false);
                  setBgNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
                }}
                onError={() => {
                  setBgFailed(true);
                  setBgNaturalSize(null);
                }}
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  width: logicalWidth,
                  height: logicalHeight,
                }}
              />
            )}
            {(floorplan.obstacles ?? []).map(obstacle => {
              const ox = safeNum(obstacle.x, 0);
              const oy = safeNum(obstacle.y, 0);
              const ow = safeNum(obstacle.w, 0);
              const oh = safeNum(obstacle.h, 0);
              const orot = safeNum(obstacle.rot ?? 0, 0);
              return (
                <div
                  key={obstacle.id}
                  className="absolute border border-dashed border-gray-300 bg-gray-200/30"
                  style={{
                    left: ox,
                    top: oy,
                    width: ow,
                    height: oh,
                    transform: `rotate(${orot}deg)`,
                  }}
                />
              );
            })}
            {visibleTables.map(table => {
              const baseGeometry = normalizeTableGeometry(table, DEFAULT_TABLE_GEOMETRY);
              const fromDimsRaw = coerceDims(table.floorplanRef);
              const fromDims =
                fromDimsRaw && !isPlaceholderFloorplanDims(fromDimsRaw.width, fromDimsRaw.height)
                  ? fromDimsRaw
                  : null;
              const renderGeometry =
                fromDims &&
                (fromDims.width !== effectiveDims.width ||
                  fromDims.height !== effectiveDims.height)
                  ? normalizeTableGeometryToFloorplan(baseGeometry, fromDims, effectiveDims)
                  : baseGeometry;
              const tx = safeNum(renderGeometry.x, 0);
              const ty = safeNum(renderGeometry.y, 0);
              const twRaw = Math.max(0, safeNum(renderGeometry.w, 0));
              const thRaw = Math.max(0, safeNum(renderGeometry.h, 0));
              const trot = safeNum(table.rot, 0);
              const tradius = safeNum(renderGeometry.radius, 0);
              const rotation = trot;
              const circleRadius = tradius || Math.min(twRaw, thRaw) / 2;
              const status = tableStatusById.get(table.id) ?? 'free';
              const isSelected = selectedAssignedTableIds.has(table.id);
              const hasConflict = conflictTableIds.has(table.id);
              const isRecommended = !isSelected && recommendedTableIds.has(table.id);
              const isBlocked =
                blockedForSelectedTableIds.has(table.id) &&
                !isSelected &&
                status !== 'occupied';

              return (
                <div
                  key={table.id}
                  className={`absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 pointer-events-none relative ${
                    isSelected ? 'z-10 ring-2 ring-[var(--color-primary)]' : ''
                  }`}
                  style={{
                    left: tx,
                    top: ty,
                    width: twRaw,
                    height: thRaw,
                    borderRadius: table.shape === 'circle' ? circleRadius : 8,
                    border: '2px solid rgba(148, 163, 184, 0.6)',
                    backgroundColor: renderStatusColor(status),
                    transform: `rotate(${rotation}deg)`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    opacity: isBlocked ? 0.55 : undefined,
                    outline: isRecommended
                      ? '2px dashed rgba(251, 191, 36, 0.9)'
                      : undefined,
                    outlineOffset: isRecommended ? 2 : undefined,
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
  );
};

export default ReservationFloorplanPreview;
