import { FirebaseError } from 'firebase/app';
import { collection, deleteField, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { auth, db, functions } from '../../../core/firebase/config';
import {
  Floorplan,
  FloorplanObstacle,
  SeatingSettings,
  Table,
  TableCombination,
  Zone,
} from '../../../core/models/data';
import {
  createFloorplan,
  createCombination,
  createTable,
  createZone,
  deleteFloorplan,
  deleteCombination,
  deleteTable,
  deleteZone,
  ensureDefaultFloorplan,
  getSeatingSettings,
  listFloorplans,
  listCombinations,
  listZones,
  updateFloorplan,
  updateCombination,
  updateSeatingSettings,
  updateTable,
  updateZone,
} from '../../../core/services/seatingAdminService';
import { listTables } from '../../../core/services/seatingService';
import { normalizeTableGeometry } from '../../../core/utils/seatingNormalize';
import {
  computeTransformFromViewportRect,
  looksNormalized,
  resolveCanonicalFloorplanDims,
  resolveTableGeometryInFloorplanSpace,
  resolveTableRenderPosition,
} from '../../../core/utils/seatingFloorplanRender';
import ModalShell from '../common/ModalShell';
import PillPanelLayout from '../common/PillPanelLayout';
import { getTableVisualState, isRectIntersecting as isRectIntersectingFn } from './seating/floorplanUtils';
import FloorplanViewportCanvas, {
  FloorplanViewportHandle,
} from './seating/FloorplanViewportCanvas';
import { useViewportRect } from '../../hooks/useViewportRect';
import FloorplanWorldLayer from './seating/FloorplanWorldLayer';

const COLLISION_EPS = 0.5;
const GRID_SPACING = 24;
const TABLE_GEOMETRY_DEFAULTS = {
  rectWidth: 80,
  rectHeight: 60,
  circleRadius: 40,
};
const gridBackgroundStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.45) 1px, transparent 1px)',
  backgroundSize: `${GRID_SPACING}px ${GRID_SPACING}px`,
  backgroundPosition: '0 0',
};

function rectIntersectEps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  eps = COLLISION_EPS
) {
  return (
    a.x + a.w > b.x + eps &&
    a.x < b.x + b.w - eps &&
    a.y + a.h > b.y + eps &&
    a.y < b.y + b.h - eps
  );
}

function rotatedAabb(x: number, y: number, w: number, h: number, rotDeg: number) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hx = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
  const hy = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
  return {
    x: centerX - hx,
    y: centerY - hy,
    w: hx * 2,
    h: hy * 2,
  };
}

interface SeatingSettingsModalProps {
  unitId: string;
  onClose: () => void;
}

const weekdays = [
  { value: 0, label: 'Vasárnap' },
  { value: 1, label: 'Hétfő' },
  { value: 2, label: 'Kedd' },
  { value: 3, label: 'Szerda' },
  { value: 4, label: 'Csütörtök' },
  { value: 5, label: 'Péntek' },
  { value: 6, label: 'Szombat' },
];

type RuntimeErrorSnapshot = {
  message: string;
  stack?: string;
  source?: string;
  time: string;
};

const useRuntimeErrorOverlay = (enabled: boolean) => {
  const [snapshot, setSnapshot] = useState<RuntimeErrorSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const handleError = (event: ErrorEvent) => {
      const err = event.error as Error | undefined;
      setSnapshot({
        message: event.message || err?.message || 'Unknown error',
        stack: err?.stack,
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
        time: new Date().toISOString(),
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      let message = 'Unhandled rejection';
      let stack: string | undefined;
      if (event.reason instanceof Error) {
        message = event.reason.message || message;
        stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        message = event.reason;
      } else {
        try {
          message = JSON.stringify(event.reason);
        } catch {
          message = String(event.reason);
        }
      }
      setSnapshot({
        message,
        stack,
        time: new Date().toISOString(),
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [enabled]);

  return snapshot;
};

const RuntimeErrorOverlay: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const snapshot = useRuntimeErrorOverlay(enabled);

  if (!enabled || !snapshot) {
    return null;
  }

  const details = [
    snapshot.message,
    snapshot.source ? `Source: ${snapshot.source}` : null,
    snapshot.stack ? `Stack:\n${snapshot.stack}` : null,
    `Time: ${snapshot.time}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-[min(90vw,420px)] rounded-lg border border-red-200 bg-red-50/95 p-3 text-xs text-red-900 shadow-lg">
      <div className="mb-2 font-semibold">Runtime error</div>
      <textarea
        readOnly
        value={details}
        className="w-full resize-none rounded border border-red-200 bg-white/90 p-2 text-[11px] leading-snug text-red-900"
        rows={8}
        onFocus={event => event.currentTarget.select()}
      />
    </div>
  );
};

const SeatingSettingsModal: React.FC<SeatingSettingsModalProps> = ({ unitId, onClose }) => {
  const [settings, setSettings] = useState<SeatingSettings | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [combos, setCombos] = useState<TableCombination[]>([]);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const lastSavedSettingsRef = useRef<SeatingSettings | null>(null);
  const viewportCanvasRef = useRef<FloorplanViewportHandle | null>(null);
  const normalizedSettingsRef = useRef<SeatingSettings | null>(null);
  const [actionSaving, setActionSaving] = useState<Record<string, boolean>>({});
  const actionSavingRef = useRef<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<
    'overview' | 'zones' | 'tables' | 'combinations' | 'floorplans'
  >('overview');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  const isPermissionDenied = useCallback((err: unknown): err is FirebaseError => {
    const code = (err as { code?: string } | null)?.code;
    const name = (err as { name?: string } | null)?.name;
    return name === 'FirebaseError' && code === 'permission-denied';
  }, []);

  const isAbortError = useCallback(
    (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError',
    []
  );
  const normalizeOptionalString = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const sortSnapshotKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sortSnapshotKeys);
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortSnapshotKeys((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };
  const ensureSettings = (prev: SeatingSettings | null): SeatingSettings => ({
    ...(prev ?? {}),
    bufferMinutes: prev?.bufferMinutes ?? 15,
    defaultDurationMinutes: prev?.defaultDurationMinutes ?? 120,
    holdTableMinutesOnLate: prev?.holdTableMinutesOnLate ?? 15,
    vipEnabled: prev?.vipEnabled ?? true,
    allocationEnabled: prev?.allocationEnabled ?? false,
    allocationMode: prev?.allocationMode ?? 'capacity',
    allocationStrategy: prev?.allocationStrategy ?? 'bestFit',
    defaultZoneId: prev?.defaultZoneId ?? '',
    zonePriority: prev?.zonePriority ?? [],
    overflowZones: prev?.overflowZones ?? [],
    allowCrossZoneCombinations: prev?.allowCrossZoneCombinations ?? false,
    emergencyZones: {
      enabled: prev?.emergencyZones?.enabled ?? false,
      zoneIds: prev?.emergencyZones?.zoneIds ?? [],
      activeRule: prev?.emergencyZones?.activeRule ?? 'always',
      weekdays: prev?.emergencyZones?.weekdays ?? [],
    },
  });
  const createSettingsSnapshot = (value: SeatingSettings | null) => {
    const base = ensureSettings(value);
    const snapshot = {
      bufferMinutes: base.bufferMinutes,
      defaultDurationMinutes: base.defaultDurationMinutes,
      holdTableMinutesOnLate: base.holdTableMinutesOnLate,
      vipEnabled: base.vipEnabled,
      allocationEnabled: base.allocationEnabled,
      allocationMode: base.allocationMode,
      allocationStrategy: base.allocationStrategy,
      defaultZoneId: normalizeOptionalString(base.defaultZoneId ?? ''),
      zonePriority: base.zonePriority,
      overflowZones: base.overflowZones,
      allowCrossZoneCombinations: base.allowCrossZoneCombinations,
      emergencyZones: {
        enabled: base.emergencyZones?.enabled,
        zoneIds: base.emergencyZones?.zoneIds,
        activeRule: base.emergencyZones?.activeRule,
        weekdays: base.emergencyZones?.weekdays,
      },
      activeFloorplanId: base.activeFloorplanId,
    };
    return JSON.stringify(sortSnapshotKeys(snapshot));
  };
  const isDev = process.env.NODE_ENV !== 'production';
  const debugSeating =
    isDev ||
    (typeof window !== 'undefined' &&
      window.localStorage.getItem('mintleaf_debug_seating') === '1');
  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') {
      return isDev;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('fpdebug') === '1') {
      return true;
    }
    try {
      return window.localStorage.getItem('ml_fp_debug') === '1' || isDev;
    } catch {
      return isDev;
    }
  }, [isDev]);
  const errorOverlayEnabled = useMemo(() => {
    if (typeof window === 'undefined') {
      return isDev;
    }
    const params = new URLSearchParams(window.location.search);
    return isDev || params.get('fpdebug') === '1';
  }, [isDev]);
  const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [probeSummary, setProbeSummary] = useState<string | null>(null);
  const [probeRunning, setProbeRunning] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const [floorplanMode, setFloorplanMode] = useState<'view' | 'edit'>('view');
  const isEditMode = floorplanMode === 'edit';
  const [viewportMode, setViewportMode] = useState<'auto' | 'selected' | 'fit'>('auto');
  const prevSelectedTableIdRef = useRef<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [precisionEnabled, setPrecisionEnabled] = useState(false);
  const [showObstacleDebug, setShowObstacleDebug] = useState(false);
  const snapEnabledRef = useRef(snapEnabled);
  const precisionEnabledRef = useRef(precisionEnabled);
  const viewportZeroLogRef = useRef(false);
  const lastDragComputedBoundsRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const gridLayerRef = useRef<HTMLDivElement | null>(null);
  const dragBoundsChangeLogRef = useRef(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  // Order matters to avoid TDZ issues in minified builds.
  const canEditFloorplan = useMemo(
    () => userRole === 'Admin' || userRole === 'Unit Admin',
    [userRole]
  );
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const [draftRotations, setDraftRotations] = useState<Record<string, number>>({});
  const draftRotationsRef = useRef(draftRotations);
  const [draftObstacles, setDraftObstacles] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [lastSavedById, setLastSavedById] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const lastSavedByIdRef = useRef<Record<string, { x: number; y: number }>>({});
  const [lastSavedRotById, setLastSavedRotById] = useState<Record<string, number>>({});
  const lastSavedRotByIdRef = useRef<Record<string, number>>({});
  type FloorplanTransform = {
    scale: number;
    offsetX: number;
    offsetY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
  };
  type PointerTransform = {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  type DragViewportRect = {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  const [dragState, setDragState] = useState<{
    tableId: string;
    pointerId: number;
    pointerTarget: HTMLElement | null;
    pointerStartClientX: number;
    pointerStartClientY: number;
    pointerStartFloorX: number;
    pointerStartFloorY: number;
    dragStartTransform: PointerTransform;
    dragStartRect: DragViewportRect;
    dragStartScale: number;
    tableStartX: number;
    tableStartY: number;
    width: number;
    height: number;
    boundW: number;
    boundH: number;
    mode: 'move' | 'rotate';
    tableStartRot: number;
    rotStartAngleDeg: number;
    rotCenterX: number;
    rotCenterY: number;
    floorplanWidth: number;
    floorplanHeight: number;
    gridSize: number;
    snapToGrid: boolean;
  } | null>(null);
  const isDragging = Boolean(dragState);
  const [obstacleDrag, setObstacleDrag] = useState<{
    obstacleId: string;
    pointerId: number;
    pointerTarget: HTMLElement | null;
    pointerStartClientX: number;
    pointerStartClientY: number;
    dragStartTransform: FloorplanTransform;
    dragStartRect: DragViewportRect;
    dragStartScale: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    mode: 'move' | 'resize';
  } | null>(null);
  const dragStateRef = useRef<typeof dragState>(null);
  const obstacleDragRef = useRef<typeof obstacleDrag>(null);
  const lastValidTablePosRef = useRef<{ x: number; y: number } | null>(null);
  const finalizeDragRef = useRef<
    (tableId: string, x: number, y: number) => Promise<void>
  >(async () => {});
  const finalizeRotationRef = useRef<
    (tableId: string, rot: number, prevRot: number) => Promise<void>
  >(async () => {});
  const finalizeObstacleUpdateRef = useRef<
    (obstacleId: string, next: { x: number; y: number; w: number; h: number }) => Promise<void>
  >(async () => {});
  const dragMoveDebugRef = useRef(0);
  const dragClampDebugRef = useRef(0);
  const dragRecenterLogRef = useRef(0);
  const obstacleMoveDebugRef = useRef(0);
  const rotatedBoundsLogRef = useRef(0);
  const [lastDragBlockReason, setLastDragBlockReason] = useState<string | null>(null);
  const [debugTick, setDebugTick] = useState(0);
  const lastDragBlockReasonRef = useRef<string | null>(null);
  const debugRafIdRef = useRef<number | null>(null);
  const lastDragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const lastDragSnapRef = useRef<{ shouldSnap: boolean; gridSize: number } | null>(null);
  const windowDragListenersActiveRef = useRef(false);
  const windowDragHandlersRef = useRef<null | {
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
    cancel: (event: PointerEvent) => void;
  }>(null);
  const unregisterWindowTableDragListenersRef = useRef<() => void>(() => {});
  const handleTablePointerMoveCoreRef = useRef<
    (args: {
      clientX: number;
      clientY: number;
      pointerId: number;
      shiftKey: boolean;
      altKey: boolean;
    }) => void
  >(() => {});
  const handleTablePointerUpCoreRef = useRef<
    (args: {
      clientX: number;
      clientY: number;
      pointerId: number;
      shiftKey: boolean;
      altKey: boolean;
    }) => void
  >(() => {});
  const floorplanModeRef = useRef(floorplanMode);
  const lastRotateActionRef = useRef<{ t: number } | null>(null);
  const rafPosId = useRef<number | null>(null);
  const rafRotId = useRef<number | null>(null);
  const recenterRafIdRef = useRef<number | null>(null);
  const dragRecenterRafIdRef = useRef<number | null>(null);
  const scheduleRecenterSelectedTableRef = useRef<(scaleOverride?: number) => void>(() => {});
  const pendingDragRecenterRef = useRef<{
    position: { x: number; y: number };
    size: { w: number; h: number };
    scaleOverride?: number;
    source: string;
  } | null>(null);
  const [undoTick, setUndoTick] = useState(0);
  const floorplanViewportRef = useRef<HTMLDivElement | null>(null);
  const lastActionRef = useRef<null | {
    tableId: string;
    kind: 'move' | 'rotate';
    prev: { x: number; y: number; rot: number };
    next: { x: number; y: number; rot: number };
    ts: number;
  }>(null);
  const prevActiveFloorplanIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const [zoneForm, setZoneForm] = useState<{
    id?: string;
    name: string;
    priority: number;
    isActive: boolean;
    isEmergency: boolean;
  }>({ name: '', priority: 1, isActive: true, isEmergency: false });

  const [tableForm, setTableForm] = useState<{
    id?: string;
    name: string;
    zoneId: string;
    minCapacity: number;
    capacityMax: number;
    isActive: boolean;
    canSeatSolo: boolean;
    floorplanId: string;
    shape: 'rect' | 'circle';
    w: number;
    h: number;
    radius: number;
    x: number;
    y: number;
    rot: number;
    snapToGrid: boolean;
    locked: boolean;
  }>({
    name: '',
    zoneId: '',
    minCapacity: 1,
    capacityMax: 2,
    isActive: true,
    canSeatSolo: false,
    floorplanId: '',
    shape: 'rect',
    w: 80,
    h: 60,
    radius: 40,
    x: 0,
    y: 0,
    rot: 0,
    snapToGrid: true,
    locked: false,
  });

  const [selectedTableDraft, setSelectedTableDraft] = useState<{
    id: string;
    shape?: Table['shape'];
    capacityTotal: number;
    sideCapacities: { north: number; east: number; south: number; west: number };
    combinableWithIds: string[];
    seatLayout?: Table['seatLayout'];
  } | null>(null);
  const [baseComboSelection, setBaseComboSelection] = useState<string[]>([]);

  const [comboSelection, setComboSelection] = useState<string[]>([]);
  const [floorplanForm, setFloorplanForm] = useState<{
    id?: string;
    name: string;
    width: number;
    height: number;
    gridSize: number;
    backgroundImageUrl: string;
    isActive: boolean;
  }>({
    name: '',
    width: 1000,
    height: 600,
    gridSize: 20,
    backgroundImageUrl: '',
    isActive: true,
  });
  const [zonePriorityAdd, setZonePriorityAdd] = useState('');
  const handleDebugAllocationLog = useCallback(async () => {
    if (!debugSeating) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const callable = httpsCallable(functions, 'logAllocationEvent');
      await callable({
        unitId,
        bookingId: 'debug',
        startTimeISO: new Date().toISOString(),
        endTimeISO: new Date(Date.now() + 30 * 60000).toISOString(),
        partySize: 2,
        zoneId: null,
        tableIds: [],
        reason: 'DEBUG',
        allocationMode: 'debug',
        allocationStrategy: 'debug',
        snapshot: {
          overflowZonesCount: 0,
          zonePriorityCount: 0,
          emergencyZonesCount: 0,
        },
      });
      if (isMountedRef.current) {
        setSuccess('Debug allocation log létrehozva.');
      }
      console.debug('[seating] debug allocation log success', { unitId });
    } catch (error) {
      if (isMountedRef.current) {
        setError('Nem sikerült létrehozni a debug allocation logot.');
      }
      console.warn('[seating] debug allocation log failed', error);
    }
  }, [debugSeating, unitId]);

  const defaultSideCapacities = useCallback((capacityTotal: number) => {
    const north = Math.ceil(capacityTotal / 2);
    const south = Math.max(0, capacityTotal - north);
    return { north, east: 0, south, west: 0 };
  }, []);
  const deriveSideCapacitiesFromSeatLayout = useCallback(
    (
      seatLayout: Table['seatLayout'] | undefined,
      fallback: { north: number; east: number; south: number; west: number }
    ) => {
      if (!seatLayout) return fallback;
      if (seatLayout.kind === 'rect') {
        const sides = seatLayout.sides ?? {};
        return {
          north: Math.max(0, sides.north ?? 0),
          east: Math.max(0, sides.east ?? 0),
          south: Math.max(0, sides.south ?? 0),
          west: Math.max(0, sides.west ?? 0),
        };
      }
      if (seatLayout.kind === 'circle') {
        const count = Math.max(0, seatLayout.count ?? 0);
        // Keep circle side caps aligned to the total count to avoid mismatched UI warnings.
        return defaultSideCapacities(count);
      }
      return fallback;
    },
    [defaultSideCapacities]
  );
  const isSeatLayoutEmpty = (seatLayout?: Table['seatLayout']) => {
    if (!seatLayout) return true;
    if (seatLayout.kind === 'circle') {
      return (seatLayout.count ?? 0) <= 0;
    }
    if (seatLayout.kind === 'rect') {
      const sides = seatLayout.sides ?? {};
      return (
        (sides.north ?? 0) <= 0 &&
        (sides.east ?? 0) <= 0 &&
        (sides.south ?? 0) <= 0 &&
        (sides.west ?? 0) <= 0
      );
    }
    return true;
  };
  const computeSeatCountFromSeatLayout = (seatLayout?: Table['seatLayout']) => {
    if (!seatLayout) return 0;
    if (seatLayout.kind === 'circle') {
      return Math.max(0, seatLayout.count ?? 0);
    }
    if (seatLayout.kind === 'rect') {
      const sides = seatLayout.sides ?? {};
      return (
        Math.max(0, sides.north ?? 0) +
        Math.max(0, sides.east ?? 0) +
        Math.max(0, sides.south ?? 0) +
        Math.max(0, sides.west ?? 0)
      );
    }
    return 0;
  };
  const formatSeatLayoutSummary = (seatLayout?: Table['seatLayout']) => {
    if (!seatLayout) return 'Seat layout: n/a';
    if (seatLayout.kind === 'circle') {
      return `Seat layout: circle (${seatLayout.count ?? 0})`;
    }
    if (seatLayout.kind === 'rect') {
      return `Seat layout: rect N${seatLayout.sides?.north ?? 0} E${
        seatLayout.sides?.east ?? 0
      } S${seatLayout.sides?.south ?? 0} W${seatLayout.sides?.west ?? 0}`;
    }
    return 'Seat layout: n/a';
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);

  useEffect(() => {
    precisionEnabledRef.current = precisionEnabled;
  }, [precisionEnabled]);

  useEffect(() => {
    draftRotationsRef.current = draftRotations;
  }, [draftRotations]);

  useEffect(() => {
    if (!isDev) return;
    if (floorplans.length === 0 && tables.length === 0) return;
    const debugFloorplanDims = resolveCanonicalFloorplanDims(floorplans[0], tables);
    const normalizedFloorplans = floorplans.map(plan => {
      const width = Number(plan.width);
      const height = Number(plan.height);
      return {
        id: plan.id,
        width: Number.isFinite(width) && width > 0 ? width : 1,
        height: Number.isFinite(height) && height > 0 ? height : 1,
      };
    });
    const normalizedTables = tables.slice(0, 3).map(table => ({
      id: table.id,
      ...resolveTableGeometryInFloorplanSpace(
        table,
        debugFloorplanDims,
        TABLE_GEOMETRY_DEFAULTS
      ),
    }));
    console.debug('[seating] normalized geometry snapshot', {
      floorplans: normalizedFloorplans,
      tables: normalizedTables,
    });
  }, [floorplans, isDev, tables]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      let permissionDeniedShown = false;
      const safeSetError = (msg: string) => {
        if (isMounted) {
          setError(msg);
        }
      };
      const runPermissionProbe = async () => {
        if (!isDev) {
          return;
        }
        const user = auth.currentUser;
        console.debug('[seating-debug] init', {
          uid: user?.uid ?? 'unknown',
          unitId,
        });
        const summary: string[] = [];
        if (user?.uid) {
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
              const data = userSnap.data() as { role?: string; unitIds?: string[]; unitIDs?: string[] };
              const unitIds = data.unitIds ?? data.unitIDs ?? [];
              summary.push(`user role=${data.role ?? 'unknown'}, unitIds=${Array.isArray(unitIds) ? unitIds.length : 0}`);
              console.debug('[seating-debug] user permissions', {
                role: data.role ?? 'unknown',
                unitIdsCount: Array.isArray(unitIds) ? unitIds.length : 0,
              });
            }
          } catch (err) {
            if (!isAbortError(err)) {
              console.debug('[seating-debug] failed to read user profile', err);
            }
          }
        }
        try {
          await getDoc(doc(db, 'units', unitId));
          summary.push('units/{unitId}: ok');
        } catch (err) {
          if (isPermissionDenied(err)) {
            summary.push('units/{unitId}: permission-denied');
            console.warn(
              `[seating-debug] permission-denied on units/${unitId} (project mismatch or missing unit permission).`
            );
          }
        }
        try {
          await getDoc(doc(db, 'units', unitId, 'seating_settings', 'default'));
          summary.push('seating_settings/default: ok');
        } catch (err) {
          if (isPermissionDenied(err)) {
            summary.push('seating_settings/default: permission-denied');
            console.warn(
              `[seating-debug] permission-denied on units/${unitId}/seating_settings/default (project mismatch or missing unit permission).`
            );
          }
        }
        if (isMounted) {
          setProbeSummary(summary.join(' | '));
        }
      };
      try {
        void runPermissionProbe();
        const user = auth.currentUser;
        if (user?.uid) {
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
              const data = userSnap.data() as { role?: string | null };
              if (isMounted) {
                setUserRole(data.role ?? null);
              }
            } else if (isMounted) {
              setUserRole(null);
            }
          } catch (err) {
            if (debugSeating) {
              console.debug('[seating] failed to load user role', err);
            }
          }
        } else if (isMounted) {
          setUserRole(null);
        }
        try {
          await ensureDefaultFloorplan(unitId);
        } catch (err) {
          if (isAbortError(err)) {
            return;
          }
          if (isPermissionDenied(err)) {
            permissionDeniedShown = true;
            safeSetError('Nincs jogosultság az ültetés beállításokhoz ennél az egységnél.');
            if (isMounted) {
              setSettings(null);
              setZones([]);
              setTables([]);
              setCombos([]);
              setFloorplans([]);
            }
            return;
          }
          console.error('Error ensuring default floorplan:', err);
        }
        let settingsData;
        let zonesData;
        let tablesData;
        let combosData;
        let floorplansData;
        try {
          [settingsData, zonesData, tablesData, combosData, floorplansData] = await Promise.all([
            getSeatingSettings(unitId),
            listZones(unitId),
            listTables(unitId),
            listCombinations(unitId),
            listFloorplans(unitId),
          ]);
        } catch (err) {
          if (isAbortError(err)) {
            return;
          }
          if (isPermissionDenied(err)) {
            permissionDeniedShown = true;
            safeSetError('Nincs jogosultság az ültetés beállításokhoz ennél az egységnél.');
            if (isMounted) {
              setSettings(null);
              setZones([]);
              setTables([]);
              setCombos([]);
              setFloorplans([]);
            }
            return;
          }
          throw err;
        }
        if (!isMounted) return;
        const tableIds = new Set(tablesData.map(table => table.id));
        const prunedTables = tablesData.map(table => {
          const prunedCombinable = (table.combinableWithIds ?? []).filter(
            id => tableIds.has(id) && id !== table.id
          );
          if (prunedCombinable.length === (table.combinableWithIds ?? []).length) {
            return table;
          }
          return { ...table, combinableWithIds: prunedCombinable };
        });
        if (debugEnabled) {
          prunedTables.forEach(table => {
            console.debug('[seating] loaded table seatLayout', {
              tableId: table.id,
              seatLayout: table.seatLayout,
            });
          });
        }
        setSettings(settingsData);
        setZones(zonesData);
        setTables(prunedTables);
        setCombos(combosData);
        setFloorplans(floorplansData);
        lastSavedSnapshotRef.current = settingsData
          ? createSettingsSnapshot(settingsData)
          : null;
        lastSavedSettingsRef.current = settingsData ? ensureSettings(settingsData) : null;
        setIsDirty(false);
        setSaveFeedback(null);
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        console.error('Error loading seating settings:', err);
        if (isMounted && !permissionDeniedShown) {
          setError('Nem sikerült betölteni az ültetési beállításokat.');
          setSettings(null);
          setZones([]);
          setTables([]);
          setCombos([]);
          setFloorplans([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [isAbortError, isDev, isPermissionDenied, unitId]);

  useEffect(() => {
    setActiveTab('overview');
  }, [unitId]);

  useEffect(() => {
    if (!lastSavedSnapshotRef.current) {
      setIsDirty(false);
      return;
    }
    const snapshot = createSettingsSnapshot(settings);
    const nextDirty = snapshot !== lastSavedSnapshotRef.current;
    setIsDirty(nextDirty);
    if (nextDirty) {
      setSaveFeedback(null);
    }
  }, [settings]);

  useEffect(() => {
    if (!saveFeedback) {
      return;
    }
    const timeoutId = setTimeout(() => setSaveFeedback(null), 2500);
    return () => clearTimeout(timeoutId);
  }, [saveFeedback]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const activeButton = document.getElementById(`seating-tab-${activeTab}`);
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  const emergencyZoneOptions = useMemo(
    () => zones.filter(zone => zone.isActive && zone.isEmergency),
    [zones]
  );
  const activeZones = useMemo(() => zones.filter(zone => zone.isActive), [zones]);
  const activeZoneIds = useMemo(
    () => new Set(activeZones.map(zone => zone.id)),
    [activeZones]
  );
  function isRectIntersecting(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number }
  ) {
    return isRectIntersectingFn(a, b);
  }

  const visibleFloorplans = useMemo(
    () => floorplans.filter(plan => plan.isActive !== false),
    [floorplans]
  );

  // UI fallback when stored activeFloorplanId is missing or invalid; never persist this derived value.
  const resolvedActiveFloorplanId = useMemo(() => {
    const wanted = settings?.activeFloorplanId;
    if (wanted === '') {
      return '';
    }
    if (wanted && visibleFloorplans.some(plan => plan.id === wanted)) {
      return wanted;
    }
    return visibleFloorplans[0]?.id ?? '';
  }, [settings?.activeFloorplanId, visibleFloorplans]);

  const activeFloorplan = useMemo(
    () => floorplans.find(plan => plan.id === resolvedActiveFloorplanId) ?? null,
    [floorplans, resolvedActiveFloorplanId]
  );

  // Keep this after resolvedActiveFloorplanId to avoid TDZ in minified builds.
  useEffect(() => {
    setFloorplanMode('view');
  }, [resolvedActiveFloorplanId]);

  useEffect(() => {
    if (!canEditFloorplan && floorplanMode === 'edit') {
      setFloorplanMode('view');
    }
  }, [canEditFloorplan, floorplanMode]);

  
  const editorTables = useMemo(() => {
    if (!activeFloorplan) return [] as Table[];
    const filtered = tables.filter(table => {
      const matchesFloorplan = !table.floorplanId || table.floorplanId === activeFloorplan.id;
      return matchesFloorplan && table.isActive !== false;
    });
    if (!selectedTableDraft) return filtered;
    const seatLayoutForDraft = isSeatLayoutEmpty(selectedTableDraft.seatLayout)
      ? undefined
      : selectedTableDraft.seatLayout;
    return filtered.map(table =>
      table.id === selectedTableDraft.id
        ? {
            ...table,
            capacityTotal: selectedTableDraft.capacityTotal,
            sideCapacities: selectedTableDraft.sideCapacities,
            combinableWithIds: selectedTableDraft.combinableWithIds,
            seatLayout: seatLayoutForDraft,
          }
        : table
    );
  }, [activeFloorplan, selectedTableDraft, tables]);

  const activeObstacles = useMemo(
    () => activeFloorplan?.obstacles ?? [],
    [activeFloorplan]
  );

  const floorplanDims = useMemo(
    () =>
      resolveCanonicalFloorplanDims(
        activeFloorplan ?? { width: floorplanForm.width, height: floorplanForm.height },
        editorTables
      ),
    [activeFloorplan, editorTables, floorplanForm.height, floorplanForm.width]
  );
  const floorplanW = floorplanDims.width;
  const floorplanH = floorplanDims.height;
  const editorGridSize =
    (activeFloorplan?.gridSize && activeFloorplan.gridSize > 0
      ? activeFloorplan.gridSize
      : floorplanForm.gridSize) || 20;
  const selectedTable = useMemo(
    () => tables.find(table => table.id === selectedTableId) ?? null,
    [selectedTableId, tables]
  );
  const selectedTableKey = selectedTableId || selectedTableDraft?.id || null;
  const selectedTableIdForDrag = selectedTableId ?? selectedTableDraft?.id ?? null;
  const selectedEditorTable = useMemo(
    () => (selectedTableKey ? editorTables.find(table => table.id === selectedTableKey) ?? null : null),
    [editorTables, selectedTableKey]
  );
  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId);
  }, []);
  const handleZoomOutFit = useCallback(() => {
    setViewportMode('fit');
    prevSelectedTableIdRef.current = null;
    setFloorplanTransformOverride(null);
    viewportCanvasRef.current?.resetToFit();
  }, []);
  const handleFloorplanBackgroundPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-seating-no-deselect="1"]')) {
        return;
      }
      setSelectedTableId(null);
    },
    []
  );

  
  const getRenderPosition = useCallback(
    (table: Table, geometry: ReturnType<typeof normalizeTableGeometry>) =>
      resolveTableRenderPosition(
        geometry,
        floorplanDims,
        isEditMode ? draftPositions[table.id] : null
      ),
    [draftPositions, floorplanDims, isEditMode]
  );
  useEffect(() => {
    if (!selectedTable) {
      setSelectedTableDraft(null);
      return;
    }
    const capacityTotal =
      typeof selectedTable.capacityTotal === 'number' &&
      Number.isFinite(selectedTable.capacityTotal)
        ? selectedTable.capacityTotal
        : selectedTable.capacityMax > 0
        ? selectedTable.capacityMax
        : selectedTable.minCapacity > 0
        ? selectedTable.minCapacity
        : 2;
    setSelectedTableDraft({
      id: selectedTable.id,
      shape: selectedTable.shape ?? 'rect',
      capacityTotal,
      sideCapacities:
        selectedTable.sideCapacities ?? defaultSideCapacities(capacityTotal),
      combinableWithIds: selectedTable.combinableWithIds ?? [],
      seatLayout: selectedTable.seatLayout,
    });
  }, [
    selectedTable?.id,
    selectedTable?.capacityTotal,
    selectedTable?.capacityMax,
    selectedTable?.minCapacity,
    selectedTable?.sideCapacities?.north,
    selectedTable?.sideCapacities?.east,
    selectedTable?.sideCapacities?.south,
    selectedTable?.sideCapacities?.west,
    selectedTable?.combinableWithIds?.join('|'),
    selectedTable?.seatLayout?.kind,
    selectedTable?.seatLayout?.count,
    selectedTable?.seatLayout?.sides?.north,
    selectedTable?.seatLayout?.sides?.east,
    selectedTable?.seatLayout?.sides?.south,
    selectedTable?.seatLayout?.sides?.west,
    selectedTable?.shape,
    defaultSideCapacities,
  ]);
  const combinableTableOptions = useMemo(() => {
    if (!selectedTable) return [] as Table[];
    return editorTables.filter(
      table => table.id !== selectedTable.id && table.zoneId === selectedTable.zoneId
    );
  }, [editorTables, selectedTable]);
  const sideCapacitySum = useMemo(() => {
    if (!selectedTableDraft) return 0;
    return (
      selectedTableDraft.sideCapacities.north +
      selectedTableDraft.sideCapacities.east +
      selectedTableDraft.sideCapacities.south +
      selectedTableDraft.sideCapacities.west
    );
  }, [selectedTableDraft]);
  const seatLayoutCapacityTotal = useMemo(() => {
    if (!selectedTableDraft) return null;
    if (isSeatLayoutEmpty(selectedTableDraft.seatLayout)) return null;
    return computeSeatCountFromSeatLayout(selectedTableDraft.seatLayout);
  }, [selectedTableDraft?.seatLayout]);
  const seatLayoutSummary = useMemo(
    () => formatSeatLayoutSummary(selectedTableDraft?.seatLayout),
    [selectedTableDraft?.seatLayout]
  );
  useEffect(() => {
    if (!selectedTableDraft) return;
    if (isSeatLayoutEmpty(selectedTableDraft.seatLayout)) return;
    const nextCapacityTotal = computeSeatCountFromSeatLayout(selectedTableDraft.seatLayout);
    if (nextCapacityTotal === selectedTableDraft.capacityTotal) return;
    setSelectedTableDraft(current =>
      current
        ? {
            ...current,
            capacityTotal: nextCapacityTotal,
          }
        : current
    );
  }, [
    selectedTableDraft?.capacityTotal,
    selectedTableDraft?.seatLayout?.kind,
    selectedTableDraft?.seatLayout?.count,
    selectedTableDraft?.seatLayout?.sides?.north,
    selectedTableDraft?.seatLayout?.sides?.east,
    selectedTableDraft?.seatLayout?.sides?.south,
    selectedTableDraft?.seatLayout?.sides?.west,
  ]);
  useEffect(() => {
    if (!selectedTableDraft) return;
    if (isSeatLayoutEmpty(selectedTableDraft.seatLayout)) return;
    const nextSideCapacities = deriveSideCapacitiesFromSeatLayout(
      selectedTableDraft.seatLayout,
      selectedTableDraft.sideCapacities
    );
    const current = selectedTableDraft.sideCapacities;
    if (
      current.north === nextSideCapacities.north &&
      current.east === nextSideCapacities.east &&
      current.south === nextSideCapacities.south &&
      current.west === nextSideCapacities.west
    ) {
      return;
    }
    setSelectedTableDraft(prev =>
      prev
        ? {
            ...prev,
            sideCapacities: nextSideCapacities,
          }
        : prev
    );
  }, [
    deriveSideCapacitiesFromSeatLayout,
    selectedTableDraft?.seatLayout?.kind,
    selectedTableDraft?.seatLayout?.count,
    selectedTableDraft?.seatLayout?.sides?.north,
    selectedTableDraft?.seatLayout?.sides?.east,
    selectedTableDraft?.seatLayout?.sides?.south,
    selectedTableDraft?.seatLayout?.sides?.west,
    selectedTableDraft?.sideCapacities?.north,
    selectedTableDraft?.sideCapacities?.east,
    selectedTableDraft?.sideCapacities?.south,
    selectedTableDraft?.sideCapacities?.west,
  ]);
  useEffect(() => {
    if (isEditMode) return;
    const selectedId = selectedEditorTable?.id ?? null;
    if (!selectedId) {
      prevSelectedTableIdRef.current = null;
      if (viewportMode === 'fit') {
        viewportCanvasRef.current?.resetToFit();
      }
      return;
    }
    if (viewportMode === 'fit') {
      viewportCanvasRef.current?.resetToFit();
      return;
    }
    if (viewportMode === 'auto' && prevSelectedTableIdRef.current === selectedId) {
      return;
    }
    const geometry = resolveTableGeometryInFloorplanSpace(
      selectedEditorTable,
      floorplanDims,
      TABLE_GEOMETRY_DEFAULTS
    );
    const position = getRenderPosition(selectedEditorTable, geometry);
    viewportCanvasRef.current?.centerOnRect({
      x: position.x,
      y: position.y,
      w: geometry.w,
      h: geometry.h,
    });
    prevSelectedTableIdRef.current = selectedId;
  }, [floorplanDims, getRenderPosition, isEditMode, selectedEditorTable, viewportMode]);
  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }
  function applyGrid(value: number, gridSize: number) {
    return gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
  }
  function ceilToGrid(value: number, gridSize: number) {
    return gridSize > 0 ? Math.ceil(value / gridSize) * gridSize : value;
  }
  function floorToGrid(value: number, gridSize: number) {
    return gridSize > 0 ? Math.floor(value / gridSize) * gridSize : value;
  }
  function normalizeRotation(value: number) {
    const wrapped = ((value % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
  }
  const applyRotationDelta = useCallback(
    (tableId: string, currentRot: number, delta: number) => {
      const nextRot = normalizeRotation(currentRot + delta);
      updateDraftRotation(tableId, nextRot);
      scheduleRecenterSelectedTableRef.current();
    },
    [updateDraftRotation]
  );
  const applyRotationAbsolute = useCallback(
    (tableId: string, rot: number) => {
      const nextRot = normalizeRotation(rot);
      updateDraftRotation(tableId, nextRot);
      scheduleRecenterSelectedTableRef.current();
    },
    [updateDraftRotation]
  );
  function snapRotation(value: number, step = 5) {
    return Math.round(value / step) * step;
  }
  function getRotatedHalfExtents(w: number, h: number, rotDeg: number) {
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      hx: (Math.abs(w * cos) + Math.abs(h * sin)) / 2,
      hy: (Math.abs(w * sin) + Math.abs(h * cos)) / 2,
    };
  }
  function clampTopLeftForRotation(
    x: number,
    y: number,
    w: number,
    h: number,
    rotDeg: number,
    floorW: number,
    floorH: number,
    clampFn: (value: number, min: number, max: number) => number
  ) {
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const { hx, hy } = getRotatedHalfExtents(w, h, rotDeg);
    if (debugSeating && (floorW < hx * 2 || floorH < hy * 2)) {
      const now = Date.now();
      if (now - rotatedBoundsLogRef.current > 500) {
        rotatedBoundsLogRef.current = now;
        console.debug('[seating] rotated bounds exceed floorplan', {
          floorW,
          floorH,
          hx,
          hy,
          rotDeg,
        });
      }
    }
    const clampedCenterX = clampFn(centerX, hx, Math.max(hx, floorW - hx));
    const clampedCenterY = clampFn(centerY, hy, Math.max(hy, floorH - hy));
    return {
      x: clampedCenterX - w / 2,
      y: clampedCenterY - h / 2,
      hx,
      hy,
    };
  }
  function clampTopLeftForRotationWithinBounds(
    x: number,
    y: number,
    w: number,
    h: number,
    rotDeg: number,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    clampFn: (value: number, min: number, max: number) => number
  ) {
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const { hx, hy } = getRotatedHalfExtents(w, h, rotDeg);
    let minCenterX = bounds.minX + hx;
    let maxCenterX = bounds.maxX - hx;
    let minCenterY = bounds.minY + hy;
    let maxCenterY = bounds.maxY - hy;
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    if (maxCenterX < minCenterX) {
      minCenterX = midX;
      maxCenterX = midX;
    }
    if (maxCenterY < minCenterY) {
      minCenterY = midY;
      maxCenterY = midY;
    }
    const clampedCenterX = clampFn(centerX, minCenterX, maxCenterX);
    const clampedCenterY = clampFn(centerY, minCenterY, maxCenterY);
    return {
      x: clampedCenterX - w / 2,
      y: clampedCenterY - h / 2,
      hx,
      hy,
    };
  }
  const computeDragBounds = useCallback(
    (
      drag: Pick<
        NonNullable<typeof dragState>,
        'floorplanWidth' | 'floorplanHeight' | 'width' | 'height' | 'gridSize'
      >,
      rotDeg: number,
      shouldSnap: boolean
    ) => {
      const { hx, hy } = getRotatedHalfExtents(drag.width, drag.height, rotDeg);
      const aabbW = hx * 2;
      const aabbH = hy * 2;
      let minX = 0;
      let minY = 0;
      let maxX = drag.floorplanWidth - aabbW;
      let maxY = drag.floorplanHeight - aabbH;
      maxX = Math.max(0, maxX);
      maxY = Math.max(0, maxY);
      if (shouldSnap) {
        minX = ceilToGrid(minX, drag.gridSize);
        minY = ceilToGrid(minY, drag.gridSize);
        maxX = floorToGrid(maxX, drag.gridSize);
        maxY = floorToGrid(maxY, drag.gridSize);
      } else {
        minX = Math.round(minX);
        minY = Math.round(minY);
        maxX = Math.round(maxX);
        maxY = Math.round(maxY);
      }
      if (maxX < minX) {
        const midX = (minX + maxX) / 2;
        minX = midX;
        maxX = midX;
      }
      if (maxY < minY) {
        const midY = (minY + maxY) / 2;
        minY = midY;
        maxY = midY;
      }
      return { minX, minY, maxX, maxY };
    },
    []
  );
  const clampTableToBounds = useCallback(
    (
      nextX: number,
      nextY: number,
      drag: NonNullable<typeof dragState>,
      rotForClamp: number,
      bounds: { minX: number; minY: number; maxX: number; maxY: number },
      mode: 'move' | 'rotate'
    ) => {
      lastDragBoundsRef.current = bounds;
      if (mode === 'move') {
        const { hx, hy } = getRotatedHalfExtents(drag.width, drag.height, rotForClamp);
        return {
          x: clamp(nextX, bounds.minX, bounds.maxX),
          y: clamp(nextY, bounds.minY, bounds.maxY),
          hx,
          hy,
        };
      }
      return clampTopLeftForRotationWithinBounds(
        nextX,
        nextY,
        drag.width,
        drag.height,
        rotForClamp,
        bounds,
        clamp
      );
    },
    [clamp]
  );
  const requestDebugFlush = useCallback(
    (reason?: string | null) => {
      if (typeof reason !== 'undefined') {
        lastDragBlockReasonRef.current = reason;
      }
      if (!debugSeating) {
        return;
      }
      if (debugRafIdRef.current !== null) {
        return;
      }
      debugRafIdRef.current = requestAnimationFrame(() => {
        debugRafIdRef.current = null;
        setLastDragBlockReason(lastDragBlockReasonRef.current);
        setDebugTick(tick => tick + 1);
      });
    },
    [debugSeating]
  );
  function getTableAabbForCollision(x: number, y: number, w: number, h: number, rotDeg: number) {
    return rotatedAabb(x, y, w, h, rotDeg);
  }
  function getEffectiveRotationForClamp(tableId: string, fallback: number) {
    const rot = draftRotationsRef.current?.[tableId];
    return Number.isFinite(rot) ? rot : fallback;
  }
  function getObstacleRenderRect(obstacle: FloorplanObstacle) {
    const draft = draftObstacles[obstacle.id];
    const base = draft ?? obstacle;
    const maxX = Math.max(0, floorplanW - base.w);
    const maxY = Math.max(0, floorplanH - base.h);
    return {
      x: clamp(base.x, 0, maxX),
      y: clamp(base.y, 0, maxY),
      w: Math.max(20, base.w),
      h: Math.max(20, base.h),
    };
  }
  function isTableOverlappingObstacle(
    x: number,
    y: number,
    w: number,
    h: number,
    rotDeg: number
  ) {
    if (floorplanMode !== 'edit') {
      return false;
    }
    const bounds = getTableAabbForCollision(x, y, w, h, rotDeg);
    return activeObstacles.some(obstacle => {
      const rect = getObstacleRenderRect(obstacle);
      return rectIntersectEps(bounds, rect);
    });
  }
  function getObstacleHits(x: number, y: number, w: number, h: number, rotDeg: number) {
    const bounds = getTableAabbForCollision(x, y, w, h, rotDeg);
    return activeObstacles
      .map(obstacle => ({
        id: obstacle.id,
        rect: getObstacleRenderRect(obstacle),
      }))
      .filter(hit => rectIntersectEps(bounds, hit.rect));
  }
  function resolveTablePositionWithSweep(args: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    drag: NonNullable<typeof dragState>;
    rotDeg: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    mode: 'move' | 'rotate';
  }) {
    const { startX, startY, endX, endY, drag, rotDeg, bounds, mode } = args;
    if (!isTableOverlappingObstacle(endX, endY, drag.width, drag.height, rotDeg)) {
      return { x: endX, y: endY, collided: false, obstacleHits: [] as typeof activeObstacles };
    }
    let low = 0;
    let high = 1;
    let best = { x: startX, y: startY };
    for (let i = 0; i < 12; i += 1) {
      const t = (low + high) / 2;
      const midX = startX + (endX - startX) * t;
      const midY = startY + (endY - startY) * t;
      const clamped = clampTableToBounds(midX, midY, drag, rotDeg, bounds, mode);
      if (isTableOverlappingObstacle(clamped.x, clamped.y, drag.width, drag.height, rotDeg)) {
        high = t;
      } else {
        best = { x: clamped.x, y: clamped.y };
        low = t;
      }
    }
    return {
      x: best.x,
      y: best.y,
      collided: true,
      obstacleHits: getObstacleHits(endX, endY, drag.width, drag.height, rotDeg),
    };
  }

  // Order matters to avoid TDZ in minified builds.
  const setActionSavingFlag = (key: string, value: boolean) => {
    actionSavingRef.current[key] = value;
    if (!value) {
      delete actionSavingRef.current[key];
    }
    if (isMountedRef.current) {
      setActionSaving(current => ({ ...current, [key]: value }));
    }
  };

  const handleActionButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    handler: () => void | Promise<void>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void handler();
  };

  const runAction = async ({
    key,
    action,
    successMessage,
    errorMessage,
    errorContext,
  }: {
    key: string;
    action: () => Promise<void>;
    successMessage?: string;
    errorMessage: string;
    errorContext: string;
  }) => {
    if (actionSavingRef.current[key]) {
      if (debugSeating) {
        console.debug('[seating] action already running', { key, context: errorContext });
      }
      return;
    }
    setActionSavingFlag(key, true);
    if (isMountedRef.current) {
      setError(null);
      setSuccess(null);
    }
    try {
      await action();
      if (successMessage && isMountedRef.current) {
        setSuccess(successMessage);
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (debugSeating) {
          console.warn('[seating] action aborted', { key, context: errorContext });
        }
        if (isMountedRef.current) {
          setError('Hálózati megszakítás (Abort). Próbáld újra.');
        }
        return;
      }
      if (isMountedRef.current) {
        if (isPermissionDenied(err)) {
          setError('Nincs jogosultság az ültetés beállításokhoz ennél az egységnél.');
        } else {
          setError(errorMessage);
        }
      }
      console.error(errorContext, err);
      if (debugSeating) {
        console.warn('[seating] action failed', { key, context: errorContext, err });
      }
    } finally {
      setActionSavingFlag(key, false);
    }
  };

  const updateActiveFloorplanObstacles = useCallback(
    (nextObstacles: FloorplanObstacle[]) => {
      if (!activeFloorplan) {
        return;
      }
      setFloorplans(current =>
        current.map(plan =>
          plan.id === activeFloorplan.id ? { ...plan, obstacles: nextObstacles } : plan
        )
      );
    },
    [activeFloorplan]
  );

  const persistActiveObstacles = useCallback(
    async (nextObstacles: FloorplanObstacle[], previousObstacles: FloorplanObstacle[]) => {
      if (!activeFloorplan) {
        return;
      }
      await runAction({
        key: `floorplan-obstacles-${activeFloorplan.id}`,
        errorMessage: 'Nem sikerült menteni az akadályokat.',
        errorContext: 'Error saving floorplan obstacles:',
        action: async () => {
          try {
            await updateFloorplan(unitId, activeFloorplan.id, {
              obstacles: nextObstacles,
            });
          } catch (err) {
            updateActiveFloorplanObstacles(previousObstacles);
            throw err;
          }
        },
      });
    },
    [activeFloorplan, runAction, unitId, updateActiveFloorplanObstacles]
  );

  const setLastSaved = (
    updater:
      | Record<string, { x: number; y: number }>
      | ((prev: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>)
  ) => {
    setLastSavedById(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      lastSavedByIdRef.current = next;
      return next;
    });
  };

  const setLastSavedRot = (
    updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)
  ) => {
    setLastSavedRotById(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      lastSavedRotByIdRef.current = next;
      return next;
    });
  };

  const releaseDragPointerCapture = useCallback((drag: NonNullable<typeof dragState>) => {
    try {
      drag.pointerTarget?.releasePointerCapture?.(drag.pointerId);
    } catch {
      // ignore
    }
  }, []);
  const releaseDragPointerCaptureRef = useRef(releaseDragPointerCapture);

  const abortDrag = useCallback(
    (drag: NonNullable<typeof dragState>, opts?: { skipRelease?: boolean }) => {
      const tableId = drag.tableId;
      unregisterWindowTableDragListenersRef.current();
      if (!opts?.skipRelease) {
        releaseDragPointerCaptureRef.current(drag);
      }
      if (drag.mode === 'rotate') {
        const fallbackRot = lastSavedRotByIdRef.current[tableId];
        if (fallbackRot !== undefined) {
          setDraftRotations(current => ({ ...current, [tableId]: fallbackRot }));
        } else {
          setDraftRotations(current => {
            if (!(tableId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[tableId];
            return next;
          });
        }
      } else {
        const fallback = lastSavedByIdRef.current[tableId];
        if (fallback) {
          setDraftPositions(current => ({ ...current, [tableId]: fallback }));
        } else {
          setDraftPositions(current => {
            if (!(tableId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[tableId];
            return next;
          });
        }
      }
      setDragState(null);
    },
    []
  );
  const abortDragRef = useRef(abortDrag);

  const isSaving = Boolean(actionSaving['settings-save']);
  const canSave = isDirty && !isSaving;
  const saveLabel = isSaving ? 'Mentés...' : isDirty ? 'Mentés' : 'Nincs változás';
  const handleClose = useCallback(() => {
    const isSavingNow = Boolean(
      actionSavingRef.current['settings-save'] || actionSaving['settings-save']
    );
    if (typeof window !== 'undefined' && isDirty && !isSavingNow) {
      const ok = window.confirm('Vannak nem mentett változások. Biztos bezárod?');
      if (!ok) {
        return;
      }
    }
    const drag = dragStateRef.current;
    if (drag) {
      abortDragRef.current(drag);
    }
    setSelectedTableId(null);
    setSelectedObstacleId(null);
    setDraftPositions({});
    setDraftRotations({});
    setDraftObstacles({});
    setSavingById({});
    setObstacleDrag(null);
    actionSavingRef.current = {};
    setActionSaving({});
    onClose();
  }, [actionSaving, isDirty, onClose]);

  const handleResetChanges = () => {
    if (isSaving || !isDirty) {
      return;
    }
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Visszaállítod az utolsó mentett állapotot?');
      if (!ok) {
        return;
      }
    }
    const saved = lastSavedSettingsRef.current;
    if (!saved) {
      return;
    }
    setSettings(saved);
    lastSavedSnapshotRef.current = createSettingsSnapshot(saved);
    setIsDirty(false);
    setSaveFeedback(null);
    setError(null);
    setSuccess(null);
  };

  const tabs = useMemo(
    () =>
      [
        { id: 'overview', label: 'Áttekintés' },
        { id: 'zones', label: 'Zónák' },
        { id: 'tables', label: 'Asztalok' },
        { id: 'combinations', label: 'Kombók' },
        { id: 'floorplans', label: 'Asztaltérkép' },
      ] as const,
    []
  );

  useEffect(() => {
    abortDragRef.current = abortDrag;
  }, [abortDrag]);

  useEffect(() => {
    releaseDragPointerCaptureRef.current = releaseDragPointerCapture;
  }, [releaseDragPointerCapture]);

  const handleLostPointerCapture = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    abortDragRef.current(drag, { skipRelease: true });
  };

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    floorplanModeRef.current = floorplanMode;
  }, [floorplanMode]);

  useEffect(() => {
    obstacleDragRef.current = obstacleDrag;
  }, [obstacleDrag]);

  useEffect(() => {
    const prev = prevActiveFloorplanIdRef.current;
    const next = activeFloorplan?.id ?? null;
    if (prev === null && next === null) {
      return;
    }
    if (prev === null && next !== null) {
      prevActiveFloorplanIdRef.current = next;
      return;
    }
    if (prev !== next) {
      const drag = dragStateRef.current;
      if (drag) {
        abortDragRef.current(drag);
      }
      setSelectedTableId(null);
      setSelectedObstacleId(null);
      setDraftPositions({});
      setDraftRotations({});
      setDraftObstacles({});
      setSavingById({});
      actionSavingRef.current = {};
      setActionSaving({});
      setLastSaved({});
      setLastSavedRot({});
      lastActionRef.current = null;
      setUndoTick(tick => tick + 1);
      setTableForm(current => ({
        ...current,
        floorplanId: next ?? '',
        id: undefined,
      }));
      setError(null);
      setSuccess(null);
    }
    prevActiveFloorplanIdRef.current = next;
  }, [activeFloorplan?.id]);

  useEffect(() => {
    return () => {
      if (rafPosId.current !== null) {
        cancelAnimationFrame(rafPosId.current);
      }
      if (rafRotId.current !== null) {
        cancelAnimationFrame(rafRotId.current);
      }
      if (recenterRafIdRef.current !== null) {
        cancelAnimationFrame(recenterRafIdRef.current);
      }
      if (debugRafIdRef.current !== null) {
        cancelAnimationFrame(debugRafIdRef.current);
        debugRafIdRef.current = null;
      }
      unregisterWindowTableDragListenersRef.current();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (actionSavingRef.current['settings-save'] || actionSaving['settings-save']) {
        return;
      }
      handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionSaving, handleClose]);

  useEffect(() => {
    return () => {
      const drag = dragStateRef.current;
      if (drag) {
        releaseDragPointerCaptureRef.current(drag);
      }
    };
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      // Only cancel drag operations; avoid aborting save/delete actions on mobile blur/visibility.
      const drag = dragStateRef.current;
      if (drag) {
        abortDragRef.current(drag);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBlur();
      }
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleSettingsSave = async () => {
    if (!settings || actionSavingRef.current['settings-save'] || actionSaving['settings-save']) {
      return;
    }
    const snapshot = createSettingsSnapshot(settings);
    let didSave = false;
    normalizedSettingsRef.current = null;
    const emergencyZoneIds =
      settings.emergencyZones?.zoneIds?.filter(zoneId =>
        emergencyZoneOptions.some(zone => zone.id === zoneId)
      ) ?? [];
    const zonePriority = Array.from(
      new Set((settings.zonePriority ?? []).filter(zoneId => activeZoneIds.has(zoneId)))
    );
    const overflowZones = Array.from(
      new Set((settings.overflowZones ?? []).filter(zoneId => activeZoneIds.has(zoneId)))
    );
    const allowCrossZoneCombinations = settings.allowCrossZoneCombinations ?? false;
    const allocationEnabled = settings.allocationEnabled ?? false;
    const allocationMode = settings.allocationMode ?? 'capacity';
    const allocationStrategy = settings.allocationStrategy ?? 'bestFit';
    const defaultZoneId = normalizeOptionalString(settings.defaultZoneId ?? '');
    await runAction({
      key: 'settings-save',
      errorMessage: 'Nem sikerült menteni a beállításokat.',
      errorContext: 'Error saving seating settings:',
      action: async () => {
        const { activeFloorplanId, ...restSettings } = settings;
        const payload: SeatingSettings = {
          ...restSettings,
          allocationEnabled,
          allocationMode,
          allocationStrategy,
          zonePriority,
          overflowZones,
          allowCrossZoneCombinations,
          ...(defaultZoneId ? { defaultZoneId } : {}),
          emergencyZones: {
            enabled: settings.emergencyZones?.enabled ?? false,
            zoneIds: emergencyZoneIds,
            activeRule: settings.emergencyZones?.activeRule ?? 'always',
            weekdays: settings.emergencyZones?.weekdays ?? [],
          },
          // Persist only explicit activeFloorplanId; resolvedActiveFloorplanId is UI fallback only.
          ...(activeFloorplanId !== undefined ? { activeFloorplanId } : {}),
        };
        await updateSeatingSettings(unitId, payload);
        normalizedSettingsRef.current = ensureSettings(payload);
        didSave = true;
      },
    });
    if (didSave && isMountedRef.current) {
      const normalized = normalizedSettingsRef.current;
      if (normalized) {
        setSettings(normalized);
        lastSavedSnapshotRef.current = createSettingsSnapshot(normalized);
        lastSavedSettingsRef.current = normalized;
      } else {
        lastSavedSnapshotRef.current = snapshot;
      }
      setIsDirty(false);
      setSaveFeedback('Mentve');
      setSuccess(null);
    }
  };

  const runSeatingSmokeTest = async () => {
    if (!isDev) {
      return;
    }
    if (!isMountedRef.current) {
      return;
    }
    setProbeRunning(true);
    const summary: string[] = [];
    const recordResult = (label: string, status: 'ok' | 'permission-denied' | 'error') => {
      summary.push(`${label}: ${status}`);
    };
    try {
      try {
        await getDoc(doc(db, 'units', unitId));
        recordResult('units/{unitId}', 'ok');
      } catch (err) {
        recordResult('units/{unitId}', isPermissionDenied(err) ? 'permission-denied' : 'error');
      }
      try {
        await getDoc(doc(db, 'units', unitId, 'seating_settings', 'default'));
        recordResult('seating_settings/default', 'ok');
      } catch (err) {
        recordResult(
          'seating_settings/default',
          isPermissionDenied(err) ? 'permission-denied' : 'error'
        );
      }
      try {
        await getDocs(collection(db, 'units', unitId, 'zones'));
        recordResult('zones', 'ok');
      } catch (err) {
        recordResult('zones', isPermissionDenied(err) ? 'permission-denied' : 'error');
      }
      try {
        await getDocs(collection(db, 'units', unitId, 'tables'));
        recordResult('tables', 'ok');
      } catch (err) {
        recordResult('tables', isPermissionDenied(err) ? 'permission-denied' : 'error');
      }
      try {
        await getDocs(collection(db, 'units', unitId, 'floorplans'));
        recordResult('floorplans', 'ok');
      } catch (err) {
        recordResult('floorplans', isPermissionDenied(err) ? 'permission-denied' : 'error');
      }
      if (isMountedRef.current) {
        setProbeSummary(summary.join(' | '));
      }
    } finally {
      if (isMountedRef.current) {
        setProbeRunning(false);
      }
    }
  };

  const handleFloorplanSubmit = async () => {
    if (!floorplanForm.name.trim()) {
      setError('Az alaprajz neve kötelező.');
      return;
    }
    if (floorplanForm.width < 1 || floorplanForm.height < 1) {
      setError('A méreteknek legalább 1-nek kell lenniük.');
      return;
    }
    await runAction({
      key: 'floorplan-submit',
      errorMessage: 'Nem sikerült menteni az alaprajzot.',
      errorContext: 'Error saving floorplan:',
      successMessage: 'Alaprajz mentve.',
      action: async () => {
        const backgroundImageUrl = normalizeOptionalString(floorplanForm.backgroundImageUrl);
        const payload = {
          name: floorplanForm.name.trim(),
          width: floorplanForm.width,
          height: floorplanForm.height,
          gridSize: floorplanForm.gridSize,
          ...(backgroundImageUrl ? { backgroundImageUrl } : {}),
          isActive: floorplanForm.isActive,
        };
        if (floorplanForm.id) {
          // Avoid wiping obstacles when updating an existing floorplan.
          await updateFloorplan(unitId, floorplanForm.id, payload);
        } else {
          await createFloorplan(unitId, { ...payload, obstacles: [] });
        }
        const nextFloorplans = await listFloorplans(unitId);
        setFloorplans(nextFloorplans);
        setFloorplanForm({
          name: '',
          width: 1000,
          height: 600,
          gridSize: 20,
          backgroundImageUrl: '',
          isActive: true,
        });
      },
    });
  };

  const handleActivateFloorplan = async (floorplanId: string) => {
    if (floorplanId === resolvedActiveFloorplanId) {
      return;
    }
    if (debugSeating) {
      console.debug('[seating] activate floorplan click', { floorplanId });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `floorplan-activate-${floorplanId}`,
      errorMessage: 'Nem sikerült aktiválni az alaprajzot.',
      errorContext: 'Error activating floorplan:',
      successMessage: 'Alaprajz aktiválva.',
      action: async () => {
        await updateSeatingSettings(unitId, { activeFloorplanId: floorplanId });
        const nextFloorplans = await listFloorplans(unitId);
        setFloorplans(nextFloorplans);
        setSettings(prev => ({
          ...ensureSettings(prev),
          activeFloorplanId: floorplanId,
        }));
      },
    });
    if (debugSeating) {
      console.debug('[seating] activate floorplan done', {
        floorplanId,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  const handleDeleteFloorplan = async (floorplanId: string) => {
    if (debugSeating) {
      console.debug('[seating] delete floorplan click', { floorplanId });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `floorplan-delete-${floorplanId}`,
      errorMessage: 'Nem sikerült törölni az alaprajzot.',
      errorContext: 'Error deleting floorplan:',
      successMessage: 'Alaprajz törölve.',
      action: async () => {
        if (debugSeating) {
          console.debug('[seating] delete floorplan call start', { floorplanId });
        }
        await deleteFloorplan(unitId, floorplanId);
        if (debugSeating) {
          console.debug('[seating] delete floorplan call done', { floorplanId });
        }
        const nextFloorplans = await listFloorplans(unitId);
        if (debugSeating) {
          console.debug('[seating] delete floorplan refresh done', { floorplanId });
        }
        const nextVisible = nextFloorplans.filter(item => item.isActive !== false);
        const currentActiveId = settings?.activeFloorplanId ?? resolvedActiveFloorplanId;
        if (currentActiveId === floorplanId) {
          const nextActiveId = nextVisible[0]?.id ?? '';
          if (nextActiveId !== currentActiveId) {
            if (debugSeating) {
              console.debug('[seating] delete floorplan update active', {
                from: currentActiveId,
                to: nextActiveId,
              });
            }
            await updateSeatingSettings(unitId, {
              activeFloorplanId: nextActiveId,
            });
            setSettings(prev => ({
              ...ensureSettings(prev),
              activeFloorplanId: nextActiveId,
            }));
          }
        }
        setFloorplans(nextFloorplans);
      },
    });
    if (debugSeating) {
      console.debug('[seating] delete floorplan done', {
        floorplanId,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  useEffect(() => {
    if (tableForm.floorplanId || !resolvedActiveFloorplanId) {
      return;
    }
    setTableForm(current => ({ ...current, floorplanId: resolvedActiveFloorplanId }));
  }, [resolvedActiveFloorplanId, tableForm.floorplanId]);

  const handleZoneSubmit = async () => {
    if (!zoneForm.name.trim()) {
      setError('A zóna neve kötelező.');
      return;
    }
    await runAction({
      key: 'zone-submit',
      errorMessage: 'Nem sikerült menteni a zónát.',
      errorContext: 'Error saving zone:',
      successMessage: 'Zóna mentve.',
      action: async () => {
        if (zoneForm.id) {
          await updateZone(unitId, zoneForm.id, {
            name: zoneForm.name.trim(),
            priority: zoneForm.priority,
            isActive: zoneForm.isActive,
            isEmergency: zoneForm.isEmergency,
          });
        } else {
          await createZone(unitId, {
            name: zoneForm.name.trim(),
            priority: zoneForm.priority,
            isActive: zoneForm.isActive,
            isEmergency: zoneForm.isEmergency,
          });
        }
        setZones(await listZones(unitId));
        setZoneForm({ name: '', priority: 1, isActive: true, isEmergency: false });
      },
    });
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (debugSeating) {
      console.debug('[seating] delete zone click', { zoneId });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `zone-delete-${zoneId}`,
      errorMessage: 'Nem sikerült törölni a zónát.',
      errorContext: 'Error deleting zone:',
      successMessage: 'Zóna törölve.',
      action: async () => {
        if (debugSeating) {
          console.debug('[seating] delete zone call start', { zoneId });
        }
        await deleteZone(unitId, zoneId);
        if (debugSeating) {
          console.debug('[seating] delete zone call done', { zoneId });
        }
        const nextZones = await listZones(unitId);
        if (debugSeating) {
          console.debug('[seating] delete zone refresh done', { zoneId });
        }
        setZones(nextZones);
      },
    });
    if (debugSeating) {
      console.debug('[seating] delete zone done', {
        zoneId,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  const handleTableSubmit = async () => {
    if (!tableForm.name.trim()) {
      setError('Az asztal neve kötelező.');
      return;
    }
    if (!tableForm.zoneId) {
      setError('Az asztalhoz zóna megadása kötelező.');
      return;
    }
    if (tableForm.minCapacity < 1 || tableForm.capacityMax < 1) {
      setError('A kapacitás értékeknek legalább 1-nek kell lenniük.');
      return;
    }
    if (tableForm.minCapacity > tableForm.capacityMax) {
      setError('A min. kapacitás nem lehet nagyobb, mint a max. kapacitás.');
      return;
    }
    if (!zones.some(zone => zone.id === tableForm.zoneId)) {
      setError('A kiválasztott zóna nem létezik.');
      return;
    }
    await runAction({
      key: 'table-submit',
      errorMessage: 'Nem sikerült menteni az asztalt.',
      errorContext: 'Error saving table:',
      successMessage: 'Asztal mentve.',
      action: async () => {
        const floorplanId = normalizeOptionalString(tableForm.floorplanId);
        const isRect = tableForm.shape === 'rect';
        const isCircle = tableForm.shape === 'circle';
        const width = tableForm.w;
        const height = tableForm.h;
        const radius = tableForm.radius;
        const x = Number.isFinite(tableForm.x) ? tableForm.x : 0;
        const y = Number.isFinite(tableForm.y) ? tableForm.y : 0;
        const rot = Number.isFinite(tableForm.rot) ? tableForm.rot : 0;
        const payload = {
          name: tableForm.name.trim(),
          zoneId: tableForm.zoneId,
          minCapacity: tableForm.minCapacity,
          capacityMax: tableForm.capacityMax,
          isActive: tableForm.isActive,
          canSeatSolo: tableForm.canSeatSolo,
          ...(floorplanId ? { floorplanId } : {}),
          shape: tableForm.shape,
          ...(isRect && Number.isFinite(width) ? { w: width } : {}),
          ...(isRect && Number.isFinite(height) ? { h: height } : {}),
          ...(isCircle && Number.isFinite(radius) ? { radius } : {}),
          x,
          y,
          rot,
          snapToGrid: tableForm.snapToGrid,
          locked: tableForm.locked,
        };
        if (tableForm.id) {
          await updateTable(unitId, tableForm.id, payload);
        } else {
          await createTable(unitId, payload);
        }
        setTables(await listTables(unitId));
        setTableForm({
          name: '',
          zoneId: '',
          minCapacity: 1,
          capacityMax: 2,
          isActive: true,
          canSeatSolo: false,
          floorplanId: resolvedActiveFloorplanId,
          shape: 'rect',
          w: 80,
          h: 60,
          radius: 40,
          x: 0,
          y: 0,
          rot: 0,
          snapToGrid: true,
          locked: false,
        });
      },
    });
  };

  const sanitizeCapacityValue = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  const handleSelectedTableMetadataSave = async () => {
    if (!selectedTableDraft) return;
    const seatLayoutEmpty = isSeatLayoutEmpty(selectedTableDraft.seatLayout);
    const capacityTotal = seatLayoutEmpty
      ? sanitizeCapacityValue(selectedTableDraft.capacityTotal)
      : sanitizeCapacityValue(
          computeSeatCountFromSeatLayout(selectedTableDraft.seatLayout)
        );
    if (seatLayoutEmpty && capacityTotal < 1) {
      setError('A kapacitás megadása kötelező, ha nincs seat layout.');
      setSuccess(null);
      return;
    }
    const sideCapSource = seatLayoutEmpty
      ? selectedTableDraft.sideCapacities
      : deriveSideCapacitiesFromSeatLayout(
          selectedTableDraft.seatLayout,
          selectedTableDraft.sideCapacities
        );
    const sideCapacities = {
      north: sanitizeCapacityValue(sideCapSource.north),
      east: sanitizeCapacityValue(sideCapSource.east),
      south: sanitizeCapacityValue(sideCapSource.south),
      west: sanitizeCapacityValue(sideCapSource.west),
    };
    const combinableWithIds = selectedTableDraft.combinableWithIds.filter(
      id => id !== selectedTableDraft.id
    );
    const payload: Record<string, unknown> = {
      capacityTotal,
      sideCapacities,
      combinableWithIds,
    };
    if (seatLayoutEmpty) {
      payload.seatLayout = deleteField();
    } else if (selectedTableDraft.seatLayout) {
      payload.seatLayout = selectedTableDraft.seatLayout;
    }
    await runAction({
      key: `table-meta-${selectedTableDraft.id}`,
      errorMessage: 'Nem sikerült menteni az asztal kapacitás adatait.',
      errorContext: 'Error saving table capacity metadata:',
      successMessage: 'Asztal kapacitás mentve.',
      action: async () => {
        if (debugEnabled) {
          console.debug('[seating] saving table meta payload', {
            tableId: selectedTableDraft.id,
            seatLayout: payload.seatLayout,
            capacityTotal,
            sideCapacities,
          });
        }
        await updateTable(unitId, selectedTableDraft.id, payload);
        const seatLayoutForState = seatLayoutEmpty ? undefined : selectedTableDraft.seatLayout;
        setTables(current =>
          current.map(table =>
            table.id === selectedTableDraft.id
              ? {
                  ...table,
                  capacityTotal,
                  sideCapacities,
                  combinableWithIds,
                  seatLayout: seatLayoutForState,
                }
              : table
          )
        );
        setSelectedTableDraft(current => {
          if (!current || current.id !== selectedTableDraft.id) return current;
          return {
            ...current,
            capacityTotal,
            sideCapacities,
            combinableWithIds,
            seatLayout: seatLayoutForState,
          };
        });
        if (debugEnabled) {
          console.debug('[seating] table meta saved', {
            tableId: selectedTableDraft.id,
            payloadKeys: Object.keys(payload),
            seatLayoutEmpty,
            capacityTotal,
            seatLayoutAction: seatLayoutEmpty ? 'deleted' : 'set',
          });
        }
      },
    });
  };

  const handleCreateBaseCombo = async () => {
    if (baseComboSelection.length < 2) {
      setError('Legalább két asztalt válassz a base kombinációhoz.');
      setSuccess(null);
      return;
    }
    const groupId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `base-combo-${Date.now()}`;
    const updates = baseComboSelection.map(tableId => ({
      tableId,
      baseCombo: { groupId, role: 'member' as const },
    }));
    await runAction({
      key: `base-combo-${groupId}`,
      errorMessage: 'Nem sikerült létrehozni a base kombinációt.',
      errorContext: 'Error creating base combo:',
      successMessage: 'Base kombináció létrehozva.',
      action: async () => {
        await Promise.all(
          updates.map(update =>
            updateTable(unitId, update.tableId, { baseCombo: update.baseCombo })
          )
        );
        setTables(current =>
          current.map(table => {
            const update = updates.find(item => item.tableId === table.id);
            return update ? { ...table, baseCombo: update.baseCombo } : table;
          })
        );
        setBaseComboSelection([]);
      },
    });
  };

  const handleDeleteTable = async (tableId: string) => {
    if (debugSeating) {
      console.debug('[seating] delete table click', { tableId });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `table-delete-${tableId}`,
      errorMessage: 'Nem sikerült törölni az asztalt.',
      errorContext: 'Error deleting table:',
      successMessage: 'Asztal törölve.',
      action: async () => {
        if (debugSeating) {
          console.debug('[seating] delete table call start', { tableId });
        }
        await deleteTable(unitId, tableId);
        if (debugSeating) {
          console.debug('[seating] delete table call done', { tableId });
        }
        const nextTables = await listTables(unitId);
        if (debugSeating) {
          console.debug('[seating] delete table refresh done', { tableId });
        }
        setTables(nextTables);
      },
    });
    if (debugSeating) {
      console.debug('[seating] delete table done', {
        tableId,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  function updateDraftPosition(tableId: string, x: number, y: number) {
    if (rafPosId.current !== null) {
      cancelAnimationFrame(rafPosId.current);
    }
    rafPosId.current = requestAnimationFrame(() => {
      setDraftPositions(current => ({
        ...current,
        [tableId]: { x, y },
      }));
      rafPosId.current = null;
    });
  }

  function updateDraftRotation(tableId: string, rot: number) {
    if (rafRotId.current !== null) {
      cancelAnimationFrame(rafRotId.current);
    }
    rafRotId.current = requestAnimationFrame(() => {
      setDraftRotations(current => ({
        ...current,
        [tableId]: rot,
      }));
      rafRotId.current = null;
    });
  }

  function computeFloorplanTransformFromRect(
    rect: { width: number; height: number; left?: number; top?: number },
    width: number,
    height: number
  ): FloorplanTransform {
    const rectLeft = rect?.left ?? 0;
    const rectTop = rect?.top ?? 0;
    const baseTransform = computeTransformFromViewportRect(rect, width, height);
    return {
      scale: baseTransform.scale,
      offsetX: baseTransform.offsetX,
      offsetY: baseTransform.offsetY,
      rectLeft: Number.isFinite(rectLeft) ? rectLeft : 0,
      rectTop: Number.isFinite(rectTop) ? rectTop : 0,
      rectWidth: baseTransform.rectWidth,
      rectHeight: baseTransform.rectHeight,
    };
  }

  function getViewportRect(): { width: number; height: number; left: number; top: number } {
    const rect = floorplanViewportRef.current?.getBoundingClientRect();
    return {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
    };
  }

  // Freeze transform+rect during drag to avoid reflow drift.
  function mapClientToFloorplanUsingTransform(
    clientX: number,
    clientY: number,
    transform: PointerTransform,
    rect: DragViewportRect
  ) {
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    if (!Number.isFinite(transform.scale) || transform.scale <= 0) {
      return null;
    }
    const rawX = (clientX - rect.left - transform.offsetX) / transform.scale;
    const rawY = (clientY - rect.top - transform.offsetY) / transform.scale;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return null;
    }
    return { x: rawX, y: rawY };
  }

  function safeScale(value: number): number {
    return Number.isFinite(value) && value > 0.0001 ? value : 1;
  }

  const viewportRect = useViewportRect(floorplanViewportRef, {
    retryFrames: 80,
    deps: [resolvedActiveFloorplanId, floorplanMode],
  });
  const floorplanViewportRect = useMemo(
    () => ({
      width: viewportRect.width,
      height: viewportRect.height,
      left: 0,
      top: 0,
    }),
    [viewportRect.height, viewportRect.width]
  );

  const floorplanRenderTransform = useMemo(
    () =>
      computeFloorplanTransformFromRect(floorplanViewportRect, floorplanW, floorplanH),
    [floorplanViewportRect, floorplanH, floorplanW]
  );
  const [floorplanTransformOverride, setFloorplanTransformOverride] = useState<{
    scale: number;
    offsetX: number;
    offsetY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);
  const transformOverrideLogRef = useRef(0);
  const applyTransformOverride = useCallback(
    (tag: string, next: typeof floorplanTransformOverride) => {
      if (debugSeating) {
        const now = Date.now();
        if (now - transformOverrideLogRef.current > 200) {
          transformOverrideLogRef.current = now;
          console.debug('[seating] transform override', {
            tag,
            viewportMode,
            selectedTableIdForDrag,
            dragTableId: dragStateRef.current?.tableId ?? null,
            next,
          });
        }
      }
      setFloorplanTransformOverride(next);
    },
    [debugSeating, selectedTableIdForDrag, viewportMode]
  );
  const activeFloorplanTransform = floorplanTransformOverride ?? floorplanRenderTransform;
  const getActivePointerTransform = useCallback(() => {
    const rect = getViewportRect();
    return {
      rect,
      transform: {
        scale: activeFloorplanTransform.scale,
        offsetX: activeFloorplanTransform.offsetX,
        offsetY: activeFloorplanTransform.offsetY,
      },
    };
  }, [activeFloorplanTransform]);
  const getSelectedTableScale = useCallback(() => {
    if (!selectedEditorTable) return null;
    if (floorplanViewportRect.width <= 0 || floorplanViewportRect.height <= 0) {
      return null;
    }
    const geometry = resolveTableGeometryInFloorplanSpace(
      selectedEditorTable,
      floorplanDims,
      TABLE_GEOMETRY_DEFAULTS
    );
    const padding = 0.25;
    const paddedW = geometry.w * (1 + padding * 2);
    const paddedH = geometry.h * (1 + padding * 2);
    return Math.min(
      Math.max(
        0.4,
        Math.min(floorplanViewportRect.width / paddedW, floorplanViewportRect.height / paddedH)
      ),
      2.5
    );
  }, [
    floorplanDims,
    floorplanViewportRect.height,
    floorplanViewportRect.width,
    selectedEditorTable,
  ]);
  const recenterSelectedTable = useCallback(
    (scaleOverride?: number) => {
      if (!selectedEditorTable) return;
      if (floorplanViewportRect.width <= 0 || floorplanViewportRect.height <= 0) return;
      const geometry = resolveTableGeometryInFloorplanSpace(
        selectedEditorTable,
        floorplanDims,
        TABLE_GEOMETRY_DEFAULTS
      );
      const position = getRenderPosition(selectedEditorTable, geometry);
      const centerX = position.x + geometry.w / 2;
      const centerY = position.y + geometry.h / 2;
      const scale = safeScale(
        scaleOverride ?? floorplanTransformOverride?.scale ?? activeFloorplanTransform.scale
      );
      applyTransformOverride('recenter-selected-table', {
        scale,
        offsetX: floorplanViewportRect.width / 2 - centerX * scale,
        offsetY: floorplanViewportRect.height / 2 - centerY * scale,
        rectLeft: floorplanViewportRect.left ?? 0,
        rectTop: floorplanViewportRect.top ?? 0,
        rectWidth: floorplanViewportRect.width,
        rectHeight: floorplanViewportRect.height,
      });
    },
    [
      activeFloorplanTransform.scale,
      applyTransformOverride,
      floorplanDims,
      floorplanTransformOverride?.scale,
      floorplanViewportRect.height,
      floorplanViewportRect.left,
      floorplanViewportRect.top,
      floorplanViewportRect.width,
      getRenderPosition,
      selectedEditorTable,
    ]
  );
  const recenterSelectedDragPosition = useCallback(
    (
      position: { x: number; y: number },
      size: { w: number; h: number },
      scaleOverride: number | undefined,
      source: string
    ) => {
      if (viewportMode !== 'selected') return;
      pendingDragRecenterRef.current = { position, size, scaleOverride, source };
      if (dragRecenterRafIdRef.current !== null) {
        return;
      }
      dragRecenterRafIdRef.current = requestAnimationFrame(() => {
        dragRecenterRafIdRef.current = null;
        const pending = pendingDragRecenterRef.current;
        if (!pending) return;
        if (floorplanViewportRect.width <= 0 || floorplanViewportRect.height <= 0) return;
        const centerX = pending.position.x + pending.size.w / 2;
        const centerY = pending.position.y + pending.size.h / 2;
        const scale = safeScale(
          pending.scaleOverride ?? floorplanTransformOverride?.scale ?? activeFloorplanTransform.scale
        );
        if (debugSeating) {
          const now = Date.now();
          const shouldLog =
            pending.source === 'drag-start' ||
            pending.source === 'pointer-up' ||
            (pending.source === 'pointer-move' && now - dragRecenterLogRef.current > 250);
          if (shouldLog) {
            dragRecenterLogRef.current = now;
            console.debug('[seating] drag recenter applied', {
              source: pending.source,
              viewportMode,
              selectedTableIdForDrag,
              dragTableId: dragStateRef.current?.tableId ?? null,
            });
          }
        }
        applyTransformOverride('recenter-selected-drag', {
          scale,
          offsetX: floorplanViewportRect.width / 2 - centerX * scale,
          offsetY: floorplanViewportRect.height / 2 - centerY * scale,
          rectLeft: floorplanViewportRect.left ?? 0,
          rectTop: floorplanViewportRect.top ?? 0,
          rectWidth: floorplanViewportRect.width,
          rectHeight: floorplanViewportRect.height,
        });
      });
    },
    [
      activeFloorplanTransform.scale,
      applyTransformOverride,
      debugSeating,
      floorplanTransformOverride?.scale,
      floorplanViewportRect.height,
      floorplanViewportRect.left,
      floorplanViewportRect.top,
      floorplanViewportRect.width,
      selectedTableIdForDrag,
      viewportMode,
    ]
  );
  const scheduleRecenterSelectedTable = useCallback(
    (scaleOverride?: number) => {
      if (viewportMode !== 'selected') return;
      if (dragStateRef.current) return;
      if (recenterRafIdRef.current !== null) {
        return;
      }
      recenterRafIdRef.current = requestAnimationFrame(() => {
        recenterRafIdRef.current = null;
        recenterSelectedTable(scaleOverride);
      });
    },
    [recenterSelectedTable, viewportMode]
  );
  useEffect(() => {
    scheduleRecenterSelectedTableRef.current = scheduleRecenterSelectedTable;
  }, [scheduleRecenterSelectedTable]);
  useEffect(() => {
    if (!isEditMode) {
      applyTransformOverride('mode-exit-edit', null);
      return;
    }
    if (dragStateRef.current) {
      return;
    }
    if (viewportMode === 'fit') {
      applyTransformOverride('fit-mode', null);
      return;
    }
    if (!selectedEditorTable) {
      prevSelectedTableIdRef.current = null;
      applyTransformOverride('no-selected-table', null);
      return;
    }
    if (
      viewportMode === 'auto' &&
      prevSelectedTableIdRef.current === selectedEditorTable.id
    ) {
      return;
    }
    const scale =
      viewportMode === 'selected' && floorplanTransformOverride
        ? floorplanTransformOverride.scale
        : getSelectedTableScale();
    if (!scale) return;
    recenterSelectedTable(scale);
    prevSelectedTableIdRef.current = selectedEditorTable.id;
  }, [
    applyTransformOverride,
    floorplanDims,
    floorplanTransformOverride,
    floorplanViewportRect.height,
    floorplanViewportRect.left,
    floorplanViewportRect.top,
    floorplanViewportRect.width,
    getSelectedTableScale,
    getRenderPosition,
    isEditMode,
    recenterSelectedTable,
    selectedEditorTable,
    viewportMode,
  ]);

  const isSelectedDragActive =
  viewportMode === 'selected' &&
  isDragging &&
  selectedTableIdForDrag &&
  dragStateRef.current?.tableId === selectedTableIdForDrag;

  const worldCameraStyle = useMemo<React.CSSProperties>(() => {
  const t = activeFloorplanTransform;
  return {
    transform: `translate3d(${t.offsetX}px, ${t.offsetY}px, 0) scale(${t.scale})`,
    transformOrigin: 'top left',
    willChange: 'transform',
    transition:
      floorplanTransformOverride && !isSelectedDragActive
        ? 'transform 200ms ease'
        : undefined,
      };
    }, [activeFloorplanTransform, floorplanTransformOverride, isSelectedDragActive]);
  
  const debugRawGeometry = useMemo(() => {
    const table = editorTables[0];
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
  }, [editorTables]);
  const normalizedDetected = useMemo(
    () => (debugRawGeometry ? looksNormalized(debugRawGeometry, floorplanDims) : false),
    [debugRawGeometry, floorplanDims]
  );
  const sampleTableGeometry = useMemo(() => {
    const table = editorTables[0];
    if (!table) return null;
    const geometry = resolveTableGeometryInFloorplanSpace(
      table,
      floorplanDims,
      TABLE_GEOMETRY_DEFAULTS
    );
    return {
      id: table.id,
      x: geometry.x,
      y: geometry.y,
      w: geometry.w,
      h: geometry.h,
      rot: geometry.rot,
    };
  }, [editorTables, floorplanDims]);
  const sampleTableRender = useMemo(() => {
    const table = editorTables[0];
    if (!table) return null;
    const geometry = resolveTableGeometryInFloorplanSpace(
      table,
      floorplanDims,
      TABLE_GEOMETRY_DEFAULTS
    );
    const position = resolveTableRenderPosition(
      geometry,
      floorplanDims,
      isEditMode ? draftPositions[table.id] : null
    );
    const rot = (isEditMode ? draftRotations[table.id] : undefined) ?? geometry.rot;
    return {
      id: table.id,
      x: position.x,
      y: position.y,
      w: geometry.w,
      h: geometry.h,
      rot,
    };
  }, [draftPositions, draftRotations, editorTables, floorplanDims, isEditMode]);
  const tablesForWorldLayer = useMemo(
    () =>
      editorTables.map(table => {
        if (!isEditMode) return table;
        const draftPos = draftPositions[table.id];
        const draftRot = draftRotations[table.id];
        if (!draftPos && draftRot === undefined) return table;
        return {
          ...table,
          ...(draftPos ? { x: draftPos.x, y: draftPos.y } : {}),
          ...(draftRot !== undefined ? { rot: draftRot } : {}),
        };
      }),
    [draftPositions, draftRotations, editorTables, isEditMode]
  );
  const debugTableRows = useMemo(
    () =>
      editorTables.slice(0, 5).map(table => {
        const raw = normalizeTableGeometry(table);
        const floor = resolveTableGeometryInFloorplanSpace(
          table,
          floorplanDims,
          TABLE_GEOMETRY_DEFAULTS
        );
        return {
          id: table.id,
          name: table.name,
          raw,
          floor,
        };
      }),
    [editorTables, floorplanDims]
  );
  const zeroRectLogRef = useRef(false);
  const formatDebugNumber = (value?: number) =>
    Number.isFinite(value) ? value.toFixed(2) : 'n/a';

  const debugFloorplanWarningReasons = useMemo(() => {
    if (typeof debugSeating === 'undefined' || !debugSeating) {
      return [];
    }
    if (editorTables.length === 0) {
      return [];
    }
    const reasons: string[] = [];
    if (!activeFloorplan) {
      reasons.push('activeFloorplan=null');
    }
    if (floorplanW <= 0) {
      reasons.push(`floorplanWidth=${floorplanW}`);
    }
    if (floorplanH <= 0) {
      reasons.push(`floorplanHeight=${floorplanH}`);
    }
    if (activeFloorplanTransform.rectWidth <= 0) {
      reasons.push(`rectWidth=${activeFloorplanTransform.rectWidth}`);
    }
    if (activeFloorplanTransform.rectHeight <= 0) {
      reasons.push(`rectHeight=${activeFloorplanTransform.rectHeight}`);
    }
    return reasons;
  }, [
    activeFloorplan,
    debugSeating,
    editorTables.length,
    floorplanH,
    activeFloorplanTransform.rectHeight,
    activeFloorplanTransform.rectWidth,
    floorplanW,
  ]);

  useEffect(() => {
    if (!debugEnabled || viewportZeroLogRef.current) {
      return;
    }
    if (floorplanViewportRect.width > 0 && floorplanViewportRect.height > 0) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      if (viewportZeroLogRef.current) {
        return;
      }
      if (floorplanViewportRect.width > 0 && floorplanViewportRect.height > 0) {
        return;
      }
      viewportZeroLogRef.current = true;
      console.debug('[floorplan-editor] viewport still zero', {
        rect: floorplanViewportRect,
        floorplanDims,
        mode: floorplanMode,
      });
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [debugEnabled, floorplanDims, floorplanMode, floorplanViewportRect]);

  useEffect(() => {
    if (typeof debugSeating === 'undefined' || !debugSeating) {
      return;
    }
    if (zeroRectLogRef.current) {
      return;
    }
    if (
      editorTables.length > 0 &&
      (activeFloorplanTransform.rectWidth <= 0 ||
        activeFloorplanTransform.rectHeight <= 0)
    ) {
      zeroRectLogRef.current = true;
      try {
        console.debug('[seating] viewport zero rect with tables', {
          tablesCount: editorTables.length,
          rect: floorplanViewportRect,
          transform: activeFloorplanTransform,
        });
      } catch (error) {
        console.warn('[seating] zero-rect debug log failed', error);
      }
    }
  }, [debugSeating, editorTables.length, activeFloorplanTransform, floorplanViewportRect]);

  const handleUndoLastAction = React.useCallback(async () => {
    const action = lastActionRef.current;
    if (!action) return;
    if (savingById[action.tableId]) return;
    setSavingById(current => ({ ...current, [action.tableId]: true }));
    setDraftPositions(current => ({
      ...current,
      [action.tableId]: { x: action.prev.x, y: action.prev.y },
    }));
    setDraftRotations(current => ({ ...current, [action.tableId]: action.prev.rot }));
    try {
      if (action.kind === 'move') {
        await updateTable(unitId, action.tableId, { x: action.prev.x, y: action.prev.y });
        setLastSaved(current => ({
          ...current,
          [action.tableId]: { x: action.prev.x, y: action.prev.y },
        }));
      } else {
        await updateTable(unitId, action.tableId, { rot: action.prev.rot });
        setLastSavedRot(current => ({ ...current, [action.tableId]: action.prev.rot }));
      }
      lastActionRef.current = null;
      setUndoTick(tick => tick + 1);
    } catch (err) {
      console.error('Error undoing last action:', err);
      setDraftPositions(current => ({
        ...current,
        [action.tableId]: { x: action.next.x, y: action.next.y },
      }));
      setDraftRotations(current => ({ ...current, [action.tableId]: action.next.rot }));
      setError('Nem sikerült visszavonni a legutóbbi műveletet.');
    } finally {
      setSavingById(current => ({ ...current, [action.tableId]: false }));
    }
  }, [savingById, unitId]);

  const isUndoAvailable = useMemo(() => Boolean(lastActionRef.current), [undoTick]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndoKey =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
      if (!isUndoKey) return;
      if (!lastActionRef.current) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      void handleUndoLastAction();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUndoLastAction]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (floorplanMode !== 'edit') {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setFloorplanMode('view');
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [floorplanMode]);

  const finalizeDrag = async (tableId: string, x: number, y: number) => {
    setSavingById(current => ({ ...current, [tableId]: true }));
    try {
      await updateTable(unitId, tableId, { x, y });
      const prevPos = lastSavedByIdRef.current[tableId] ?? { x, y };
      const prevRot =
        lastSavedRotByIdRef.current[tableId] ?? draftRotations[tableId] ?? 0;
      lastActionRef.current = {
        tableId,
        kind: 'move',
        prev: { x: prevPos.x, y: prevPos.y, rot: prevRot },
        next: { x, y, rot: prevRot },
        ts: Date.now(),
      };
      setUndoTick(tick => tick + 1);
      setLastSaved(current => ({ ...current, [tableId]: { x, y } }));
    } catch (err) {
      console.error('Error updating table position:', err);
      setError('Nem sikerült menteni az asztal pozícióját.');
      setDraftPositions(current => {
        const fallback = lastSavedByIdRef.current[tableId];
        if (!fallback) {
          return current;
        }
        return { ...current, [tableId]: fallback };
      });
    } finally {
      setSavingById(current => ({ ...current, [tableId]: false }));
    }
  };

  useEffect(() => {
    finalizeDragRef.current = finalizeDrag;
  }, [finalizeDrag]);

  const finalizeRotation = async (tableId: string, rot: number, prevRot: number) => {
    setSavingById(current => ({ ...current, [tableId]: true }));
    try {
      await updateTable(unitId, tableId, { rot });
      const prevPos = lastSavedByIdRef.current[tableId] ?? { x: 0, y: 0 };
      lastActionRef.current = {
        tableId,
        kind: 'rotate',
        prev: { x: prevPos.x, y: prevPos.y, rot: prevRot },
        next: { x: prevPos.x, y: prevPos.y, rot },
        ts: Date.now(),
      };
      setUndoTick(tick => tick + 1);
      setLastSavedRot(current => ({ ...current, [tableId]: rot }));
    } catch (err) {
      console.error('Error updating table rotation:', err);
      setError('Nem sikerült menteni az asztal forgatását.');
      setDraftRotations(current => {
        const fallback = lastSavedRotByIdRef.current[tableId];
        if (fallback === undefined) {
          return current;
        }
        return { ...current, [tableId]: fallback };
      });
    } finally {
      setSavingById(current => ({ ...current, [tableId]: false }));
    }
  };

  useEffect(() => {
    finalizeRotationRef.current = finalizeRotation;
  }, [finalizeRotation]);

  const getSelectedDragSpeedFactor = useCallback(() => {
    if (viewportMode !== 'selected') return 1;
    return clamp(0.25, 1 / safeScale(activeFloorplanTransform.scale), 0.6);
  }, [activeFloorplanTransform.scale, viewportMode]);

  const handleTablePointerMoveCore = useCallback(
    ({
      clientX,
      clientY,
      pointerId,
      shiftKey,
      altKey,
    }: {
      clientX: number;
      clientY: number;
      pointerId: number;
      shiftKey: boolean;
      altKey: boolean;
    }) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (pointerId !== drag.pointerId) return;
      if (debugSeating) {
        const now = Date.now();
        if (now - dragMoveDebugRef.current > 500) {
          const { transform: currentTransform } = getActivePointerTransform();
          const scaleDiff = Math.abs(currentTransform.scale - drag.dragStartTransform.scale);
          const offsetDiff =
            Math.abs(currentTransform.offsetX - drag.dragStartTransform.offsetX) +
            Math.abs(currentTransform.offsetY - drag.dragStartTransform.offsetY);
          if (scaleDiff > 0.001 || offsetDiff > 0.5) {
            dragMoveDebugRef.current = now;
            requestDebugFlush('transform-changed-during-drag');
          }
        }
      }
      if (!floorplanViewportRef.current) {
        abortDragRef.current(drag);
        return;
      }
      if (drag.mode === 'rotate') {
        const pointer = mapClientToFloorplanUsingTransform(
          clientX,
          clientY,
          drag.dragStartTransform,
          drag.dragStartRect
        );
        if (!pointer) {
          if (debugSeating) {
            const now = Date.now();
            if (now - dragMoveDebugRef.current > 500) {
              dragMoveDebugRef.current = now;
              console.debug('[seating] drag blocked', {
                reason: 'invalid-transform',
                tableId: drag.tableId,
              });
              requestDebugFlush('invalid-transform');
            }
          }
          abortDragRef.current(drag);
          return;
        }
        const currentAngle =
          Math.atan2(pointer.y - drag.rotCenterY, pointer.x - drag.rotCenterX) *
          (180 / Math.PI);
        const deltaAngle = normalizeRotation(currentAngle - drag.rotStartAngleDeg);
        const nextRot = normalizeRotation(drag.tableStartRot + deltaAngle);
        const step = altKey ? 1 : shiftKey ? 15 : 5;
        updateDraftRotation(drag.tableId, snapRotation(nextRot, step));
        return;
      }
      // Manual check: add 3 tables, ensure side-by-side placement on same y-level.
      // Manual check: vertical movement clamps at floorplan edge, rotate still works.
      const scale = safeScale(drag.dragStartScale);
      if (!Number.isFinite(scale) || scale <= 0) {
        if (debugSeating) {
          const now = Date.now();
          if (now - dragMoveDebugRef.current > 500) {
            dragMoveDebugRef.current = now;
            console.debug('[seating] drag blocked', {
              reason: 'invalid-transform',
              tableId: drag.tableId,
            });
            requestDebugFlush('invalid-transform');
          }
        }
        abortDragRef.current(drag);
        return;
      }
      const pointer = mapClientToFloorplanUsingTransform(
        clientX,
        clientY,
        drag.dragStartTransform,
        drag.dragStartRect
      );
      if (!pointer) {
        if (debugSeating) {
          const now = Date.now();
          if (now - dragMoveDebugRef.current > 500) {
            dragMoveDebugRef.current = now;
            console.debug('[seating] drag blocked', {
              reason: 'invalid-transform',
              tableId: drag.tableId,
            });
            requestDebugFlush('invalid-transform');
          }
        }
        abortDragRef.current(drag);
        return;
      }
      lastDragPointerRef.current = { x: pointer.x, y: pointer.y };
      const speedFactor = getSelectedDragSpeedFactor();
      const deltaLocalX = (pointer.x - drag.pointerStartFloorX) * speedFactor;
      const deltaLocalY = (pointer.y - drag.pointerStartFloorY) * speedFactor;
      let nextX = drag.tableStartX + deltaLocalX;
      let nextY = drag.tableStartY + deltaLocalY;
      const unclampedX = nextX;
      const unclampedY = nextY;
      const shouldSnap =
        snapEnabledRef.current &&
        drag.snapToGrid &&
        !altKey &&
        !precisionEnabledRef.current;
      lastDragSnapRef.current = { shouldSnap, gridSize: drag.gridSize };
      requestDebugFlush();
      if (shouldSnap) {
        nextX = applyGrid(nextX, drag.gridSize);
        nextY = applyGrid(nextY, drag.gridSize);
      }
      const rotForClamp = getEffectiveRotationForClamp(drag.tableId, drag.tableStartRot);
      const bounds = computeDragBounds(drag, rotForClamp, shouldSnap);
      if (debugSeating) {
        const prevBounds = lastDragComputedBoundsRef.current;
        const boundsChanged =
          !prevBounds ||
          prevBounds.minX !== bounds.minX ||
          prevBounds.minY !== bounds.minY ||
          prevBounds.maxX !== bounds.maxX ||
          prevBounds.maxY !== bounds.maxY;
        if (boundsChanged) {
          const now = Date.now();
          if (now - dragBoundsChangeLogRef.current > 500) {
            dragBoundsChangeLogRef.current = now;
            console.debug('[seating] drag bounds changed', {
              tableId: drag.tableId,
              prev: prevBounds,
              next: bounds,
            });
          }
          lastDragComputedBoundsRef.current = bounds;
        }
      }
      const clamped = clampTableToBounds(nextX, nextY, drag, rotForClamp, bounds, drag.mode);
      nextX = clamped.x;
      nextY = clamped.y;
      requestDebugFlush();
      if (debugSeating && (nextX !== unclampedX || nextY !== unclampedY)) {
        const now = Date.now();
        if (now - dragClampDebugRef.current > 500) {
          dragClampDebugRef.current = now;
          console.debug('[seating] drag blocked', {
            reason: 'bounds-clamp',
            tableId: drag.tableId,
            unclampedX,
            unclampedY,
            nextX,
            nextY,
            bounds,
          });
          requestDebugFlush('bounds-clamp');
        }
      }
      if (debugSeating) {
        const now = Date.now();
        if (now - dragClampDebugRef.current > 500) {
          dragClampDebugRef.current = now;
          console.debug('[seating] move delta', {
            scale,
            proposed: { x: unclampedX, y: unclampedY },
            clamped: { x: nextX, y: nextY },
          });
        }
      }
      if (
        isTableOverlappingObstacle(
          nextX,
          nextY,
          drag.width,
          drag.height,
          rotForClamp
        )
      ) {
        const start =
          lastValidTablePosRef.current ?? { x: drag.tableStartX, y: drag.tableStartY };
        const resolved = resolveTablePositionWithSweep({
          startX: start.x,
          startY: start.y,
          endX: nextX,
          endY: nextY,
          drag,
          rotDeg: rotForClamp,
          bounds,
          mode: 'move',
        });
        if (resolved.collided && resolved.x === start.x && resolved.y === start.y) {
          nextX = start.x;
          nextY = start.y;
        } else {
          nextX = resolved.x;
          nextY = resolved.y;
        }
        if (debugSeating && resolved.collided) {
          const now = Date.now();
          if (now - dragClampDebugRef.current > 500) {
            dragClampDebugRef.current = now;
            console.debug('[seating] drag sweep', {
              reason: 'obstacle-sweep',
              tableId: drag.tableId,
              nextX,
              nextY,
              rot: rotForClamp,
            });
            requestDebugFlush('obstacle-sweep');
          }
        }
      }
      if (
        !isTableOverlappingObstacle(
          nextX,
          nextY,
          drag.width,
          drag.height,
          rotForClamp
        )
      ) {
        lastValidTablePosRef.current = { x: nextX, y: nextY };
      }
      if (debugSeating) {
        const now = Date.now();
        if (now - dragClampDebugRef.current > 500) {
          dragClampDebugRef.current = now;
          const deltaX = Math.abs(nextX - unclampedX);
          const deltaY = Math.abs(nextY - unclampedY);
          if (deltaX > 1 || deltaY > 1) {
            console.debug('[seating] drag clamp', {
              reason: 'rotation-clamp',
              tableId: drag.tableId,
              unclampedX,
              unclampedY,
              width: drag.width,
              height: drag.height,
              boundW: drag.boundW,
              boundH: drag.boundH,
              rotatedHx: clamped.hx,
              rotatedHy: clamped.hy,
              floorplanWidth: drag.floorplanWidth,
              floorplanHeight: drag.floorplanHeight,
              nextX,
              nextY,
              shouldSnap,
              gridSize: drag.gridSize,
            });
          }
        }
      }
      updateDraftPosition(drag.tableId, nextX, nextY);
      if (viewportMode === 'selected' && selectedTableIdForDrag === drag.tableId) {
        recenterSelectedDragPosition(
          { x: nextX, y: nextY },
          { w: drag.width, h: drag.height },
          drag.dragStartScale,
          'pointer-move'
        );
      }
    },
    [
      activeObstacles,
      applyGrid,
      clamp,
      clampTableToBounds,
      computeDragBounds,
      debugSeating,
      floorplanH,
      floorplanW,
      getActivePointerTransform,
      getSelectedDragSpeedFactor,
      isTableOverlappingObstacle,
      mapClientToFloorplanUsingTransform,
      normalizeRotation,
      recenterSelectedDragPosition,
      requestDebugFlush,
      snapRotation,
      selectedTableIdForDrag,
      viewportMode,
    ]
  );

  useEffect(() => {
    handleTablePointerMoveCoreRef.current = args => {
      void handleTablePointerMoveCore(args);
    };
  }, [handleTablePointerMoveCore]);

  const handleTablePointerUpCore = useCallback(
    ({
      clientX,
      clientY,
      pointerId,
      shiftKey,
      altKey,
    }: {
      clientX: number;
      clientY: number;
      pointerId: number;
      shiftKey: boolean;
      altKey: boolean;
    }) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (pointerId !== drag.pointerId) return;
      if (debugSeating) {
        const now = Date.now();
        if (now - dragMoveDebugRef.current > 500) {
          const { transform: currentTransform } = getActivePointerTransform();
          const scaleDiff = Math.abs(currentTransform.scale - drag.dragStartTransform.scale);
          const offsetDiff =
            Math.abs(currentTransform.offsetX - drag.dragStartTransform.offsetX) +
            Math.abs(currentTransform.offsetY - drag.dragStartTransform.offsetY);
          if (scaleDiff > 0.001 || offsetDiff > 0.5) {
            dragMoveDebugRef.current = now;
            requestDebugFlush('transform-changed-during-drag');
          }
        }
      }
      if (!floorplanViewportRef.current) {
        abortDragRef.current(drag);
        return;
      }
      const tableId = drag.tableId;
      if (drag.mode === 'rotate') {
        const pointer = mapClientToFloorplanUsingTransform(
          clientX,
          clientY,
          drag.dragStartTransform,
          drag.dragStartRect
        );
        if (!pointer) {
          if (debugSeating) {
            const now = Date.now();
            if (now - dragMoveDebugRef.current > 500) {
              dragMoveDebugRef.current = now;
              console.debug('[seating] drag blocked', {
                reason: 'invalid-transform',
                tableId: drag.tableId,
              });
              requestDebugFlush('invalid-transform');
            }
          }
          releaseDragPointerCaptureRef.current(drag);
          unregisterWindowTableDragListenersRef.current();
          setDragState(null);
          return;
        }
        const currentAngle =
          Math.atan2(pointer.y - drag.rotCenterY, pointer.x - drag.rotCenterX) *
          (180 / Math.PI);
        const deltaAngle = normalizeRotation(currentAngle - drag.rotStartAngleDeg);
        const nextRot = normalizeRotation(drag.tableStartRot + deltaAngle);
        const step = altKey ? 1 : shiftKey ? 15 : 5;
        const snappedRot = snapRotation(nextRot, step);
        updateDraftRotation(tableId, snappedRot);
        scheduleRecenterSelectedTable();
        const prevRot = drag.tableStartRot;
        releaseDragPointerCaptureRef.current(drag);
        unregisterWindowTableDragListenersRef.current();
        setDragState(null);
        void finalizeRotationRef.current(tableId, snappedRot, prevRot);
        return;
      }
      const scale = safeScale(drag.dragStartScale);
      if (!Number.isFinite(scale) || scale <= 0) {
        if (debugSeating) {
          const now = Date.now();
          if (now - dragMoveDebugRef.current > 500) {
            dragMoveDebugRef.current = now;
            console.debug('[seating] drag blocked', {
              reason: 'invalid-transform',
              tableId: drag.tableId,
            });
            requestDebugFlush('invalid-transform');
          }
        }
        abortDragRef.current(drag);
        return;
      }
      const pointer = mapClientToFloorplanUsingTransform(
        clientX,
        clientY,
        drag.dragStartTransform,
        drag.dragStartRect
      );
      if (!pointer) {
        if (debugSeating) {
          const now = Date.now();
          if (now - dragMoveDebugRef.current > 500) {
            dragMoveDebugRef.current = now;
            console.debug('[seating] drag blocked', {
              reason: 'invalid-transform',
              tableId: drag.tableId,
            });
            requestDebugFlush('invalid-transform');
          }
        }
        abortDragRef.current(drag);
        return;
      }
      lastDragPointerRef.current = { x: pointer.x, y: pointer.y };
      const speedFactor = getSelectedDragSpeedFactor();
      const deltaLocalX = (pointer.x - drag.pointerStartFloorX) * speedFactor;
      const deltaLocalY = (pointer.y - drag.pointerStartFloorY) * speedFactor;
      let nextX = drag.tableStartX + deltaLocalX;
      let nextY = drag.tableStartY + deltaLocalY;
      const unclampedX = nextX;
      const unclampedY = nextY;
      const shouldSnap =
        snapEnabledRef.current &&
        drag.snapToGrid &&
        !altKey &&
        !precisionEnabledRef.current;
      lastDragSnapRef.current = { shouldSnap, gridSize: drag.gridSize };
      requestDebugFlush();
      if (shouldSnap) {
        nextX = applyGrid(nextX, drag.gridSize);
        nextY = applyGrid(nextY, drag.gridSize);
      }
      const rotForClamp = getEffectiveRotationForClamp(drag.tableId, drag.tableStartRot);
      const bounds = computeDragBounds(drag, rotForClamp, shouldSnap);
      const clamped = clampTableToBounds(nextX, nextY, drag, rotForClamp, bounds, drag.mode);
      nextX = clamped.x;
      nextY = clamped.y;
      requestDebugFlush();
      if (debugSeating && (nextX !== unclampedX || nextY !== unclampedY)) {
        const now = Date.now();
        if (now - dragClampDebugRef.current > 500) {
          dragClampDebugRef.current = now;
          console.debug('[seating] drag blocked', {
            reason: 'bounds-clamp',
            tableId: drag.tableId,
            unclampedX,
            unclampedY,
            nextX,
            nextY,
            bounds,
          });
          requestDebugFlush('bounds-clamp');
        }
      }
      if (
        isTableOverlappingObstacle(
          nextX,
          nextY,
          drag.width,
          drag.height,
          rotForClamp
        )
      ) {
        const start =
          lastValidTablePosRef.current ?? { x: drag.tableStartX, y: drag.tableStartY };
        const resolved = resolveTablePositionWithSweep({
          startX: start.x,
          startY: start.y,
          endX: nextX,
          endY: nextY,
          drag,
          rotDeg: rotForClamp,
          bounds,
          mode: 'move',
        });
        if (resolved.collided && resolved.x === start.x && resolved.y === start.y) {
          nextX = start.x;
          nextY = start.y;
        } else {
          nextX = resolved.x;
          nextY = resolved.y;
        }
        if (debugSeating && resolved.collided) {
          const now = Date.now();
          if (now - dragClampDebugRef.current > 500) {
            dragClampDebugRef.current = now;
            console.debug('[seating] drag sweep', {
              reason: 'obstacle-sweep',
              tableId: drag.tableId,
              nextX,
              nextY,
              rot: rotForClamp,
            });
            requestDebugFlush('obstacle-sweep');
          }
        }
      }
      if (
        !isTableOverlappingObstacle(
          nextX,
          nextY,
          drag.width,
          drag.height,
          rotForClamp
        )
      ) {
        lastValidTablePosRef.current = { x: nextX, y: nextY };
      } else {
        const lastValid =
          lastValidTablePosRef.current ?? { x: drag.tableStartX, y: drag.tableStartY };
        nextX = lastValid.x;
        nextY = lastValid.y;
      }
      updateDraftPosition(tableId, nextX, nextY);
      if (viewportMode === 'selected' && selectedTableIdForDrag === tableId) {
        recenterSelectedDragPosition(
          { x: nextX, y: nextY },
          { w: drag.width, h: drag.height },
          drag.dragStartScale,
          'pointer-up'
        );
      }
      scheduleRecenterSelectedTable();
      releaseDragPointerCaptureRef.current(drag);
      unregisterWindowTableDragListenersRef.current();
      setDragState(null);
      void finalizeDragRef.current(tableId, nextX, nextY);
    },
    [
      activeObstacles,
      applyGrid,
      clamp,
      computeDragBounds,
      clampTableToBounds,
      isTableOverlappingObstacle,
      floorplanH,
      floorplanW,
      getActivePointerTransform,
      getSelectedDragSpeedFactor,
      mapClientToFloorplanUsingTransform,
      normalizeRotation,
      recenterSelectedDragPosition,
      requestDebugFlush,
      scheduleRecenterSelectedTable,
      snapRotation,
      selectedTableIdForDrag,
      viewportMode,
    ]
  );

  useEffect(() => {
    handleTablePointerUpCoreRef.current = args => {
      void handleTablePointerUpCore(args);
    };
  }, [handleTablePointerUpCore]);

  const registerWindowTableDragListeners = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (windowDragListenersActiveRef.current) {
      if (debugSeating) {
        console.debug('[seating] window pointer listeners already active', {
          kind: 'table',
        });
      }
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      if (floorplanModeRef.current === 'edit') {
        event.preventDefault();
      }
      handleTablePointerMoveCoreRef.current({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
    };
    const handleUp = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      if (floorplanModeRef.current === 'edit') {
        event.preventDefault();
      }
      handleTablePointerUpCoreRef.current({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
    };
    const handleCancel = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      if (floorplanModeRef.current === 'edit') {
        event.preventDefault();
      }
      abortDragRef.current(drag);
    };
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener('pointermove', handleMove, listenerOptions);
    window.addEventListener('pointerup', handleUp, listenerOptions);
    window.addEventListener('pointercancel', handleCancel, listenerOptions);
    windowDragHandlersRef.current = {
      move: handleMove,
      up: handleUp,
      cancel: handleCancel,
    };
    windowDragListenersActiveRef.current = true;
    if (debugSeating) {
      console.debug('[seating] window pointer listeners attached', {
        kind: 'table',
        pointerId: dragStateRef.current?.pointerId ?? null,
      });
    }
  }, [debugSeating]);

  const unregisterWindowTableDragListeners = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!windowDragListenersActiveRef.current) {
      return;
    }
    const handlers = windowDragHandlersRef.current;
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
    if (handlers) {
      window.removeEventListener('pointermove', handlers.move, listenerOptions);
      window.removeEventListener('pointerup', handlers.up, listenerOptions);
      window.removeEventListener('pointercancel', handlers.cancel, listenerOptions);
    }
    windowDragHandlersRef.current = null;
    windowDragListenersActiveRef.current = false;
    if (debugSeating) {
      console.debug('[seating] window pointer listeners detached', {
        kind: 'table',
      });
    }
  }, [debugSeating]);

  useEffect(() => {
    unregisterWindowTableDragListenersRef.current = unregisterWindowTableDragListeners;
  }, [unregisterWindowTableDragListeners]);

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: Table,
    geometry: ReturnType<typeof normalizeTableGeometry>
  ) => {
    if (!activeFloorplan) return;
    if (floorplanMode !== 'edit') return;
    if (table.locked) return;
    event.preventDefault();
    if (recenterRafIdRef.current !== null) {
      cancelAnimationFrame(recenterRafIdRef.current);
      recenterRafIdRef.current = null;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    handleSelectTable(table.id);
    if (debugSeating) {
      requestDebugFlush(null);
      console.debug('[seating] floorplan dims source', {
        floorplanId: activeFloorplan?.id ?? null,
        active: {
          w: activeFloorplan?.width ?? null,
          h: activeFloorplan?.height ?? null,
        },
        form: { w: floorplanForm.width ?? null, h: floorplanForm.height ?? null },
        used: { w: floorplanW, h: floorplanH },
      });
    }
    const position = getRenderPosition(table, geometry);
    const renderRot = draftRotations[table.id] ?? geometry.rot;
    lastValidTablePosRef.current = { x: position.x, y: position.y };
    const mode = event.shiftKey ? 'rotate' : 'move';
    const centerX = position.x + geometry.w / 2;
    const centerY = position.y + geometry.h / 2;
    const { rect: dragRect, transform: dragTransform } = getActivePointerTransform();
    const pointer = mapClientToFloorplanUsingTransform(
      event.clientX,
      event.clientY,
      dragTransform,
      dragRect
    );
    if (!pointer) {
      return;
    }
    const startAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * (180 / Math.PI);
    const rad = (renderRot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const boundW = Math.ceil(Math.abs(geometry.w * cos) + Math.abs(geometry.h * sin));
    const boundH = Math.ceil(Math.abs(geometry.w * sin) + Math.abs(geometry.h * cos));
    if (debugSeating) {
      if (viewportMode === 'selected') {
        console.debug('[seating] drag transform (selected mode)', {
          scale: dragTransform.scale,
          offsetX: dragTransform.offsetX,
          offsetY: dragTransform.offsetY,
          rectWidth: dragRect.width,
          rectHeight: dragRect.height,
          viewportMode,
        });
      }
      const shouldSnap =
        snapEnabledRef.current &&
        (table.snapToGrid ?? false) &&
        !precisionEnabledRef.current;
      const bounds = computeDragBounds(
        {
          floorplanWidth: floorplanW,
          floorplanHeight: floorplanH,
          width: geometry.w,
          height: geometry.h,
          gridSize: editorGridSize,
        },
        renderRot,
        shouldSnap
      );
      const { hx, hy } = getRotatedHalfExtents(geometry.w, geometry.h, renderRot);
      const aabbW = hx * 2;
      const aabbH = hy * 2;
      lastDragComputedBoundsRef.current = bounds;
      console.debug('[seating] drag bounds init', {
        tableId: table.id,
        floorplanW,
        floorplanH,
        width: geometry.w,
        height: geometry.h,
        rot: renderRot,
        bounds,
        aabbW,
        aabbH,
        shouldSnap,
      });
    } else {
      lastDragComputedBoundsRef.current = null;
    }
    if (debugSeating) {
      console.debug('[seating] drag scale', {
        scale: dragTransform.scale,
        offsetX: dragTransform.offsetX,
        offsetY: dragTransform.offsetY,
        rectWidth: dragRect.width,
        rectHeight: dragRect.height,
        floorplanWidth: floorplanW,
        floorplanHeight: floorplanH,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        buttons: event.buttons,
      });
    }
    setDragState({
      tableId: table.id,
      pointerId: event.pointerId,
      pointerTarget: event.currentTarget,
      pointerStartClientX: event.clientX,
      pointerStartClientY: event.clientY,
      pointerStartFloorX: pointer.x,
      pointerStartFloorY: pointer.y,
      dragStartTransform: dragTransform,
      dragStartRect: dragRect,
      dragStartScale: safeScale(dragTransform.scale),
      tableStartX: position.x,
      tableStartY: position.y,
      width: geometry.w,
      height: geometry.h,
      boundW,
      boundH,
      mode,
      tableStartRot: renderRot,
      rotStartAngleDeg: startAngle,
      rotCenterX: centerX,
      rotCenterY: centerY,
      floorplanWidth: floorplanW,
      floorplanHeight: floorplanH,
      gridSize: editorGridSize,
      snapToGrid: table.snapToGrid ?? false,
    });
    if (viewportMode === 'selected' && selectedTableIdForDrag === table.id) {
      recenterSelectedDragPosition(
        { x: position.x, y: position.y },
        { w: geometry.w, h: geometry.h },
        dragTransform.scale,
        'drag-start'
      );
    }
    registerWindowTableDragListeners();
    setLastSaved(current =>
      current[table.id] ? current : { ...current, [table.id]: position }
    );
    setLastSavedRot(current =>
      current[table.id] !== undefined ? current : { ...current, [table.id]: renderRot }
    );
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    event.preventDefault();
    void handleTablePointerMoveCore({
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
  };

  const handleTablePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    event.preventDefault();
    void handleTablePointerUpCore({
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
  };

  const handleTablePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    const drag = dragState;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    abortDragRef.current(drag);
  };

  const updateDraftObstacle = (
    obstacleId: string,
    next: { x: number; y: number; w: number; h: number }
  ) => {
    setDraftObstacles(current => ({
      ...current,
      [obstacleId]: next,
    }));
  };

  const handleObstaclePointerMoveCore = useCallback(
    ({
      clientX,
      clientY,
      pointerId,
    }: {
      clientX: number;
      clientY: number;
      pointerId: number;
    }) => {
      if (floorplanMode !== 'edit') {
        return;
      }
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (pointerId !== drag.pointerId) return;
      const deltaClientX = clientX - drag.pointerStartClientX;
      const deltaClientY = clientY - drag.pointerStartClientY;
      const scale = safeScale(drag.dragStartScale);
      const deltaX = deltaClientX / scale;
      const deltaY = deltaClientY / scale;
      const shouldSnap = snapEnabledRef.current && !precisionEnabledRef.current;
      if (drag.mode === 'resize') {
        let nextW = drag.startW + deltaX;
        let nextH = drag.startH + deltaY;
        if (shouldSnap) {
          nextW = applyGrid(Math.max(20, nextW), editorGridSize);
          nextH = applyGrid(Math.max(20, nextH), editorGridSize);
        } else {
          nextW = Math.max(20, nextW);
          nextH = Math.max(20, nextH);
        }
        updateDraftObstacle(drag.obstacleId, {
          x: drag.startX,
          y: drag.startY,
          w: nextW,
          h: nextH,
        });
        return;
      }
      let nextX = drag.startX + deltaX;
      let nextY = drag.startY + deltaY;
      if (shouldSnap) {
        nextX = applyGrid(nextX, editorGridSize);
        nextY = applyGrid(nextY, editorGridSize);
      }
    const maxX = Math.max(0, floorplanW - drag.startW);
    const maxY = Math.max(0, floorplanH - drag.startH);
      nextX = clamp(nextX, 0, maxX);
      nextY = clamp(nextY, 0, maxY);
      updateDraftObstacle(drag.obstacleId, {
        x: nextX,
        y: nextY,
        w: drag.startW,
        h: drag.startH,
      });
    },
    [
      applyGrid,
      clamp,
      editorGridSize,
      floorplanH,
      floorplanMode,
      floorplanW,
      updateDraftObstacle,
    ]
  );

  const handleObstaclePointerUpCore = useCallback(
    ({ pointerId }: { pointerId: number }) => {
      if (floorplanMode !== 'edit') {
        return;
      }
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (pointerId !== drag.pointerId) return;
      const draft = draftObstacles[drag.obstacleId];
      const next = draft ?? {
        x: drag.startX,
        y: drag.startY,
        w: drag.startW,
        h: drag.startH,
      };
      try {
        drag.pointerTarget?.releasePointerCapture?.(drag.pointerId);
      } catch {
        // ignore
      }
      setObstacleDrag(null);
      void finalizeObstacleUpdateRef.current(drag.obstacleId, next);
    },
    [draftObstacles, floorplanMode]
  );

  const handleObstaclePointerCancelCore = useCallback(
    ({ pointerId }: { pointerId: number }) => {
      if (floorplanMode !== 'edit') {
        return;
      }
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (pointerId !== drag.pointerId) return;
      try {
        drag.pointerTarget?.releasePointerCapture?.(drag.pointerId);
      } catch {
        // ignore
      }
      setObstacleDrag(null);
      setDraftObstacles(current => {
        const nextDraft = { ...current };
        delete nextDraft[drag.obstacleId];
        return nextDraft;
      });
    },
    [floorplanMode]
  );

  const handleObstaclePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    obstacle: FloorplanObstacle,
    mode: 'move' | 'resize'
  ) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedObstacleId(obstacle.id);
    const rect = getObstacleRenderRect(obstacle);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const dragRect = getViewportRect();
    const transform = computeFloorplanTransformFromRect(dragRect, floorplanW, floorplanH);
    if (debugSeating) {
      console.debug('[seating] obstacle drag scale', {
        scale: transform.scale,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
        rectWidth: transform.rectWidth,
        rectHeight: transform.rectHeight,
        floorplanWidth: floorplanW,
        floorplanHeight: floorplanH,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        buttons: event.buttons,
      });
    }
    setObstacleDrag({
      obstacleId: obstacle.id,
      pointerId: event.pointerId,
      pointerTarget: event.currentTarget,
      pointerStartClientX: event.clientX,
      pointerStartClientY: event.clientY,
      dragStartTransform: transform,
      dragStartRect: dragRect,
      dragStartScale: safeScale(transform.scale),
      startX: rect.x,
      startY: rect.y,
      startW: rect.w,
      startH: rect.h,
      mode,
    });
  };

  const handleObstaclePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    event.preventDefault();
    void handleObstaclePointerMoveCore({
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    });
  };

  const finalizeObstacleUpdate = async (
    obstacleId: string,
    next: { x: number; y: number; w: number; h: number }
  ) => {
    if (!activeFloorplan) {
      return;
    }
    const previousObstacles = activeObstacles;
    const nextObstacles = activeObstacles.map(obstacle =>
      obstacle.id === obstacleId ? { ...obstacle, ...next } : obstacle
    );
    updateActiveFloorplanObstacles(nextObstacles);
    setDraftObstacles(current => {
      const nextDraft = { ...current };
      delete nextDraft[obstacleId];
      return nextDraft;
    });
    await persistActiveObstacles(nextObstacles, previousObstacles);
  };

  useEffect(() => {
    finalizeObstacleUpdateRef.current = finalizeObstacleUpdate;
  }, [finalizeObstacleUpdate]);

  const handleObstaclePointerUp = async (event: React.PointerEvent<HTMLDivElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    event.preventDefault();
    void handleObstaclePointerUpCore({ pointerId: event.pointerId });
  };

  const handleObstaclePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (floorplanMode !== 'edit') {
      return;
    }
    void handleObstaclePointerCancelCore({ pointerId: event.pointerId });
  };

  useEffect(() => {
    if (floorplanMode !== 'edit') {
      return;
    }
    if (!obstacleDrag) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      void handleObstaclePointerMoveCore({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      });
    };
    const handleUp = (event: PointerEvent) => {
      event.preventDefault();
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      void handleObstaclePointerUpCore({ pointerId: event.pointerId });
    };
    const handleCancel = (event: PointerEvent) => {
      event.preventDefault();
      const drag = obstacleDragRef.current;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;
      void handleObstaclePointerCancelCore({ pointerId: event.pointerId });
    };
    const listenerOptions: AddEventListenerOptions = { passive: false };
    window.addEventListener('pointermove', handleMove, listenerOptions);
    window.addEventListener('pointerup', handleUp, listenerOptions);
    window.addEventListener('pointercancel', handleCancel, listenerOptions);
    if (debugSeating) {
      console.debug('[seating] window pointer fallback attached', {
        kind: 'obstacle',
        pointerId: obstacleDrag.pointerId,
      });
    }
    return () => {
      window.removeEventListener('pointermove', handleMove, listenerOptions);
      window.removeEventListener('pointerup', handleUp, listenerOptions);
      window.removeEventListener('pointercancel', handleCancel, listenerOptions);
      if (debugSeating) {
        console.debug('[seating] window pointer fallback detached', {
          kind: 'obstacle',
          pointerId: obstacleDrag.pointerId,
        });
      }
    };
  }, [
    debugSeating,
    floorplanMode,
    handleObstaclePointerCancelCore,
    handleObstaclePointerMoveCore,
    handleObstaclePointerUpCore,
    obstacleDrag,
  ]);

  const handleComboSubmit = async () => {
    const uniqueSelection = Array.from(new Set<string>(comboSelection));
    if (uniqueSelection.length < 2 || uniqueSelection.length > 3) {
      setError('A kombináció 2-3 asztalból állhat.');
      return;
    }
    const missingTable = uniqueSelection.find(
      tableId => !tables.some(table => table.id === tableId)
    );
    if (missingTable) {
      setError('Csak létező asztalok választhatók.');
      return;
    }
    await runAction({
      key: 'combo-submit',
      errorMessage: 'Nem sikerült menteni a kombinációt.',
      errorContext: 'Error saving combination:',
      successMessage: 'Kombináció mentve.',
      action: async () => {
        await createCombination(unitId, {
          tableIds: uniqueSelection,
          isActive: true,
        });
        setCombos(await listCombinations(unitId));
        setComboSelection([]);
      },
    });
  };

  const handleToggleCombo = async (combo: TableCombination) => {
    if (debugSeating) {
      console.debug('[seating] toggle combo click', { comboId: combo.id });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `combo-toggle-${combo.id}`,
      errorMessage: 'Nem sikerült frissíteni a kombinációt.',
      errorContext: 'Error updating combination:',
      successMessage: combo.isActive ? 'Kombináció kikapcsolva.' : 'Kombináció aktiválva.',
      action: async () => {
        await updateCombination(unitId, combo.id, { isActive: !combo.isActive });
        setCombos(await listCombinations(unitId));
      },
    });
    if (debugSeating) {
      console.debug('[seating] toggle combo done', {
        comboId: combo.id,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  const handleDeleteCombo = async (comboId: string) => {
    if (debugSeating) {
      console.debug('[seating] delete combo click', { comboId });
    }
    const startedAt = debugSeating ? getNow() : 0;
    await runAction({
      key: `combo-delete-${comboId}`,
      errorMessage: 'Nem sikerült törölni a kombinációt.',
      errorContext: 'Error deleting combination:',
      successMessage: 'Kombináció törölve.',
      action: async () => {
        if (debugSeating) {
          console.debug('[seating] delete combo call start', { comboId });
        }
        await deleteCombination(unitId, comboId);
        if (debugSeating) {
          console.debug('[seating] delete combo call done', { comboId });
        }
        const nextCombos = await listCombinations(unitId);
        if (debugSeating) {
          console.debug('[seating] delete combo refresh done', { comboId });
        }
        setCombos(nextCombos);
      },
    });
    if (debugSeating) {
      console.debug('[seating] delete combo done', {
        comboId,
        durationMs: Math.round(getNow() - startedAt),
      });
    }
  };

  const renderOverviewPanel = () => (
    <div className="space-y-6">
      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Foglalás alapok</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <label className="flex flex-col gap-1">
            Buffer (perc)
            <input
              type="number"
              className="border rounded p-2"
              value={settings?.bufferMinutes ?? 15}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  bufferMinutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            Alap foglalási idő (perc)
            <input
              type="number"
              className="border rounded p-2"
              value={settings?.defaultDurationMinutes ?? 120}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  defaultDurationMinutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            Késés kezelése (perc)
            <input
              type="number"
              className="border rounded p-2"
              value={settings?.holdTableMinutesOnLate ?? 15}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  holdTableMinutesOnLate: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings?.vipEnabled ?? true}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  vipEnabled: event.target.checked,
                }))
              }
            />
            VIP engedélyezve
          </label>
        </div>
      </section>

      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Automatikus ültetés (allokáció)</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input
              type="checkbox"
              checked={settings?.allocationEnabled ?? false}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  allocationEnabled: event.target.checked,
                }))
              }
            />
            Automatikus ültetés engedélyezése
          </label>
          <label className="flex flex-col gap-1">
            Allokáció mód
            <select
              className="border rounded p-2"
              value={settings?.allocationMode ?? 'capacity'}
              disabled={!settings?.allocationEnabled}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  allocationMode: event.target.value as SeatingSettings['allocationMode'],
                }))
              }
            >
              <option value="capacity">Kapacitás</option>
              <option value="floorplan">Alaprajz</option>
              <option value="hybrid">Hibrid</option>
            </select>
            <span className="text-xs text-gray-500">
              Kapacitás: legjobb asztal • Alaprajz: térképes kiosztás • Hibrid: vegyes.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            Allokációs stratégia
            <select
              className="border rounded p-2"
              value={settings?.allocationStrategy ?? 'bestFit'}
              disabled={!settings?.allocationEnabled}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  allocationStrategy: event.target.value as SeatingSettings['allocationStrategy'],
                }))
              }
            >
              <option value="bestFit">Best fit</option>
              <option value="minWaste">Min waste</option>
              <option value="priorityZoneFirst">Zóna prioritás</option>
            </select>
            <span className="text-xs text-gray-500">
              Best fit: legjobb illeszkedés • Min waste: minimális pazarlás • Zóna prioritás: sorrend szerint.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            Alapértelmezett zóna
            <select
              className="border rounded p-2"
              value={settings?.defaultZoneId ?? ''}
              disabled={!settings?.allocationEnabled}
              onChange={event =>
                setSettings(prev => ({
                  ...ensureSettings(prev),
                  defaultZoneId: event.target.value,
                }))
              }
            >
              <option value="">Nincs beállítva</option>
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="space-y-3 border rounded-lg p-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen(current => !current)}
          className="w-full text-left font-semibold text-sm"
        >
          Haladó beállítások
        </button>
        {advancedOpen && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="col-span-2 space-y-2">
                <div className="text-sm font-semibold">Zóna prioritás</div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {(settings?.zonePriority ?? []).map((zoneId, index) => {
                    const zone = zones.find(item => item.id === zoneId);
                    if (!zone) {
                      return null;
                    }
                    return (
                      <div
                        key={zoneId}
                        className="flex items-center gap-2 border rounded px-2 py-1"
                      >
                        <span>{zone.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="text-xs text-blue-600 disabled:opacity-40"
                            disabled={!settings?.allocationEnabled || index === 0}
                            onClick={() =>
                              setSettings(prev => {
                                const base = ensureSettings(prev);
                                const list = [...(base.zonePriority ?? [])];
                                if (index <= 0) {
                                  return base;
                                }
                                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                                return { ...base, zonePriority: list };
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="text-xs text-blue-600 disabled:opacity-40"
                            disabled={
                              !settings?.allocationEnabled ||
                              index === (settings?.zonePriority ?? []).length - 1
                            }
                            onClick={() =>
                              setSettings(prev => {
                                const base = ensureSettings(prev);
                                const list = [...(base.zonePriority ?? [])];
                                if (index >= list.length - 1) {
                                  return base;
                                }
                                [list[index], list[index + 1]] = [list[index + 1], list[index]];
                                return { ...base, zonePriority: list };
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-600"
                            disabled={!settings?.allocationEnabled}
                            onClick={() =>
                              setSettings(prev => {
                                const base = ensureSettings(prev);
                                return {
                                  ...base,
                                  zonePriority: (base.zonePriority ?? []).filter(id => id !== zoneId),
                                };
                              })
                            }
                          >
                            törlés
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="border rounded p-2 text-sm"
                    value={zonePriorityAdd}
                    disabled={!settings?.allocationEnabled}
                  onChange={event => {
                    const nextZoneId = event.target.value;
                    setZonePriorityAdd(nextZoneId);
                    if (!nextZoneId) {
                      return;
                    }
                    setSettings(prev => {
                      const base = ensureSettings(prev);
                      const currentList = base.zonePriority ?? [];
                      if (currentList.includes(nextZoneId)) {
                        return base;
                      }
                      return {
                        ...base,
                        zonePriority: [...currentList, nextZoneId],
                      };
                    });
                    setZonePriorityAdd('');
                  }}
                >
                    <option value="">Zóna hozzáadása</option>
                    {activeZones
                      .filter(zone => !(settings?.zonePriority ?? []).includes(zone.id))
                      .map(zone => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <div className="text-sm font-semibold">Overflow zónák</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {activeZones.map(zone => (
                    <label key={zone.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                      checked={(settings?.overflowZones ?? []).includes(zone.id)}
                      disabled={!settings?.allocationEnabled}
                      onChange={event =>
                        setSettings(prev => {
                          const base = ensureSettings(prev);
                          const currentList = base.overflowZones ?? [];
                          const nextList = event.target.checked
                            ? Array.from(new Set([...currentList, zone.id]))
                            : currentList.filter(id => id !== zone.id);
                          return { ...base, overflowZones: nextList };
                        })
                      }
                    />
                      {zone.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm col-span-2">
                <input
                  type="checkbox"
                checked={settings?.allowCrossZoneCombinations ?? false}
                disabled={!settings?.allocationEnabled}
                onChange={event =>
                  setSettings(prev => {
                    const base = ensureSettings(prev);
                    return { ...base, allowCrossZoneCombinations: event.target.checked };
                  })
                }
              />
                Kombinált asztalok engedélyezése zónák között
              </label>
            </div>
            <section className="space-y-3 border rounded-lg p-4">
              <h3 className="font-semibold">Emergency zónák</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings?.emergencyZones?.enabled ?? false}
                  onChange={event =>
                    setSettings(prev => {
                      const base = ensureSettings(prev);
                      return {
                        ...base,
                        emergencyZones: {
                          ...(base.emergencyZones ?? {}),
                          enabled: event.target.checked,
                        },
                      };
                    })
                  }
                />
                Emergency zónák engedélyezve
              </label>
              <div className="text-sm space-y-2">
                <div>
                  <label className="block mb-1">Zónák</label>
                  <select
                    multiple
                    className="border rounded p-2 w-full"
                    value={settings?.emergencyZones?.zoneIds ?? []}
                    onChange={event => {
                      const values = Array.from(
                        event.currentTarget.selectedOptions,
                        option => option.value
                      );
                      setSettings(prev => {
                        const base = ensureSettings(prev);
                        return {
                          ...base,
                          emergencyZones: {
                            ...(base.emergencyZones ?? {}),
                            zoneIds: values,
                          },
                        };
                      });
                    }}
                  >
                    {emergencyZoneOptions.map(zone => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Szabály</label>
                  <select
                    className="border rounded p-2 w-full"
                    value={settings?.emergencyZones?.activeRule ?? 'always'}
                    onChange={event =>
                      setSettings(prev => {
                        const base = ensureSettings(prev);
                        return {
                          ...base,
                          emergencyZones: {
                            ...(base.emergencyZones ?? {}),
                            activeRule: event.target.value as 'always' | 'byWeekday',
                          },
                        };
                      })
                    }
                  >
                    <option value="always">Mindig</option>
                    <option value="byWeekday">Hét napjai szerint</option>
                  </select>
                </div>
                {(settings?.emergencyZones?.activeRule ?? 'always') === 'byWeekday' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {weekdays.map(day => (
                      <label key={day.value} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={
                            settings?.emergencyZones?.weekdays?.includes(day.value) ?? false
                          }
                          onChange={event => {
                            const current = settings?.emergencyZones?.weekdays ?? [];
                            const next = event.target.checked
                              ? [...current, day.value]
                              : current.filter(value => value !== day.value);
                            setSettings(prev => {
                              const base = ensureSettings(prev);
                              return {
                                ...base,
                                emergencyZones: {
                                  ...(base.emergencyZones ?? {}),
                                  weekdays: next,
                                },
                              };
                            });
                          }}
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="space-y-3 border rounded-lg p-4">
        <button
          type="button"
          onClick={() => setDebugOpen(current => !current)}
          className="w-full text-left font-semibold text-sm"
        >
          Debug
        </button>
        {debugOpen && (
          <div className="text-xs text-slate-500 space-y-2">
            {isDev && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={runSeatingSmokeTest}
                  className="underline"
                  disabled={probeRunning}
                >
                  Seating permission smoke test
                </button>
                {probeSummary && <div>{probeSummary}</div>}
              </div>
            )}
            {debugSeating && (
              <div className="space-y-2">
                <div className="font-semibold">Debug</div>
                <button
                  type="button"
                  onClick={event => handleActionButtonClick(event, handleDebugAllocationLog)}
                  className="underline"
                >
                  Test allocation log
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderZonesPanel = () => (
    <section className="space-y-3 border rounded-lg p-4">
      <h3 className="font-semibold">Zónák</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <input
          className="border rounded p-2"
          placeholder="Zóna neve"
          value={zoneForm.name}
          onChange={event => setZoneForm(current => ({ ...current, name: event.target.value }))}
        />
        <input
          type="number"
          className="border rounded p-2"
          placeholder="Prioritás"
          value={zoneForm.priority}
          onChange={event =>
            setZoneForm(current => ({ ...current, priority: Number(event.target.value) }))
          }
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={zoneForm.isActive}
            onChange={event => setZoneForm(current => ({ ...current, isActive: event.target.checked }))}
          />
          Aktív
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={zoneForm.isEmergency}
            onChange={event =>
              setZoneForm(current => ({ ...current, isEmergency: event.target.checked }))
            }
          />
          Emergency
        </label>
      </div>
      <button
        type="button"
        onClick={event => handleActionButtonClick(event, handleZoneSubmit)}
        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
        disabled={actionSaving['zone-submit']}
      >
        {actionSaving['zone-submit'] ? 'Mentés...' : 'Mentés'}
      </button>
      <div className="space-y-2 text-sm">
        {zones.map(zone => {
          const isDeleting = actionSaving[`zone-delete-${zone.id}`];
          return (
            <div key={zone.id} className="flex items-center justify-between border rounded p-2">
              <div>
                {zone.name} (prio {zone.priority}) {zone.isEmergency ? '• emergency' : ''}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setZoneForm({
                      id: zone.id,
                      name: zone.name,
                      priority: zone.priority,
                      isActive: zone.isActive,
                      isEmergency: zone.isEmergency ?? false,
                    })
                  }
                  className="text-blue-600 disabled:opacity-50"
                  disabled={isDeleting}
                >
                  Szerkeszt
                </button>
                <button
                  type="button"
                  onClick={event => {
                    if (debugSeating) {
                      console.debug('[seating] delete zone button onClick fired', {
                        zoneId: zone.id,
                      });
                    }
                    handleActionButtonClick(event, () => handleDeleteZone(zone.id));
                  }}
                  className="text-red-600 disabled:opacity-50"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Törlés...' : 'Törlés'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderTablesPanel = () => (
    <section className="space-y-3 border rounded-lg p-4">
      <h3 className="font-semibold">Asztalok</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <input
          className="border rounded p-2"
          placeholder="Asztal neve"
          value={tableForm.name}
          onChange={event => setTableForm(current => ({ ...current, name: event.target.value }))}
        />
        <select
          className="border rounded p-2"
          value={tableForm.zoneId}
          onChange={event =>
            setTableForm(current => ({ ...current, zoneId: event.target.value }))
          }
        >
          <option value="">Zóna kiválasztása</option>
          {zones.map(zone => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="border rounded p-2"
          placeholder="Min kapacitás"
          value={tableForm.minCapacity}
          onChange={event =>
            setTableForm(current => ({
              ...current,
              minCapacity: Number(event.target.value),
            }))
          }
        />
        <input
          type="number"
          className="border rounded p-2"
          placeholder="Max kapacitás"
          value={tableForm.capacityMax}
          onChange={event =>
            setTableForm(current => ({
              ...current,
              capacityMax: Number(event.target.value),
            }))
          }
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tableForm.isActive}
            onChange={event =>
              setTableForm(current => ({ ...current, isActive: event.target.checked }))
            }
          />
          Aktív
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tableForm.canSeatSolo}
            onChange={event =>
              setTableForm(current => ({ ...current, canSeatSolo: event.target.checked }))
            }
          />
          Solo asztal
        </label>
        <label className="flex flex-col gap-1">
          Alaprajz
          <select
            className="border rounded p-2"
            value={tableForm.floorplanId}
            onChange={event =>
              setTableForm(current => ({ ...current, floorplanId: event.target.value }))
            }
          >
            <option value="">Nincs kiválasztva</option>
            {visibleFloorplans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Forma
          <select
            className="border rounded p-2"
            value={tableForm.shape}
            onChange={event =>
              setTableForm(current => ({
                ...current,
                shape: event.target.value as 'rect' | 'circle',
              }))
            }
          >
            <option value="rect">Téglalap</option>
            <option value="circle">Kör</option>
          </select>
        </label>
        {tableForm.shape === 'rect' ? (
          <>
            <input
              type="number"
              className="border rounded p-2"
              placeholder="Szélesség"
              value={tableForm.w}
              onChange={event =>
                setTableForm(current => ({ ...current, w: Number(event.target.value) }))
              }
            />
            <input
              type="number"
              className="border rounded p-2"
              placeholder="Magasság"
              value={tableForm.h}
              onChange={event =>
                setTableForm(current => ({ ...current, h: Number(event.target.value) }))
              }
            />
          </>
        ) : (
          <input
            type="number"
            className="border rounded p-2"
            placeholder="Sugár"
            value={tableForm.radius}
            onChange={event =>
              setTableForm(current => ({ ...current, radius: Number(event.target.value) }))
            }
          />
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tableForm.snapToGrid}
            onChange={event =>
              setTableForm(current => ({ ...current, snapToGrid: event.target.checked }))
            }
          />
          Grid snap
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tableForm.locked}
            onChange={event =>
              setTableForm(current => ({ ...current, locked: event.target.checked }))
            }
          />
          Zárolt
        </label>
      </div>
      <button
        type="button"
        onClick={event => handleActionButtonClick(event, handleTableSubmit)}
        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
        disabled={actionSaving['table-submit']}
      >
        {actionSaving['table-submit'] ? 'Mentés...' : 'Mentés'}
      </button>
      <div className="space-y-2 text-sm">
        {tables.map(table => {
          const isDeleting = actionSaving[`table-delete-${table.id}`];
          return (
            <div key={table.id} className="flex items-center justify-between border rounded p-2">
              <div>
                {table.name} ({table.minCapacity}-{table.capacityMax} fő) • {table.zoneId}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    (() => {
                      const geometry = resolveTableGeometryInFloorplanSpace(
                        table,
                        floorplanDims,
                        TABLE_GEOMETRY_DEFAULTS
                      );
                      setTableForm({
                        id: table.id,
                        name: table.name,
                        zoneId: table.zoneId,
                        minCapacity: table.minCapacity,
                        capacityMax: table.capacityMax,
                        isActive: table.isActive,
                        canSeatSolo: table.canSeatSolo ?? false,
                        floorplanId: table.floorplanId ?? resolvedActiveFloorplanId,
                        shape: geometry.shape,
                        w: geometry.w,
                        h: geometry.h,
                        radius: geometry.radius,
                        x: geometry.x,
                        y: geometry.y,
                        rot: geometry.rot,
                        snapToGrid: table.snapToGrid ?? true,
                        locked: table.locked ?? false,
                      });
                    })()
                  }
                  className="text-blue-600 disabled:opacity-50"
                  disabled={isDeleting}
                >
                  Szerkeszt
                </button>
                <button
                  type="button"
                  onClick={event => {
                    if (debugSeating) {
                      console.debug('[seating] delete table button onClick fired', {
                        tableId: table.id,
                      });
                    }
                    handleActionButtonClick(event, () => handleDeleteTable(table.id));
                  }}
                  className="text-red-600 disabled:opacity-50"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Törlés...' : 'Törlés'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderCombinationsPanel = () => (
    <section className="space-y-3 border rounded-lg p-4">
      <h3 className="font-semibold">Kombinációk</h3>
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          {tables.map(table => (
            <label key={table.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={comboSelection.includes(table.id)}
                onChange={event => {
                  setComboSelection(current =>
                    event.target.checked
                      ? [...current, table.id]
                      : current.filter(id => id !== table.id)
                  );
                }}
              />
              {table.name}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={event => handleActionButtonClick(event, handleComboSubmit)}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={actionSaving['combo-submit']}
        >
          {actionSaving['combo-submit'] ? 'Mentés...' : 'Mentés'}
        </button>
        <div className="space-y-2">
          {combos.map(combo => {
            const isToggling = actionSaving[`combo-toggle-${combo.id}`];
            const isDeleting = actionSaving[`combo-delete-${combo.id}`];
            return (
              <div key={combo.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  {combo.tableIds.join(', ')} {combo.isActive ? '' : '(inaktív)'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={event =>
                      handleActionButtonClick(event, () => handleToggleCombo(combo))
                    }
                    className="text-blue-600 disabled:opacity-50"
                    disabled={isToggling || isDeleting}
                  >
                    {combo.isActive
                      ? isToggling
                        ? 'Kikapcsolás...'
                        : 'Kikapcsol'
                      : isToggling
                      ? 'Aktiválás...'
                      : 'Aktivál'}
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      if (debugSeating) {
                        console.debug('[seating] delete combo button onClick fired', {
                          comboId: combo.id,
                        });
                      }
                      handleActionButtonClick(event, () => handleDeleteCombo(combo.id));
                    }}
                    className="text-red-600 disabled:opacity-50"
                    disabled={isDeleting || isToggling}
                  >
                    {isDeleting ? 'Törlés...' : 'Törlés'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );

  const resolveTableVisualStyle = (state: ReturnType<typeof getTableVisualState>) => {
    switch (state) {
      case 'free':
        return 'color-mix(in srgb, var(--color-success) 18%, transparent)';
      case 'occupied':
        return 'color-mix(in srgb, var(--color-danger) 18%, transparent)';
      case 'unknown':
      default:
        return 'rgba(255,255,255,0.9)';
    }
  };

  const handleAddSeat = (
    tableId: string,
    side: 'north' | 'east' | 'south' | 'west' | 'radial'
  ) => {
    setSelectedTableDraft(curr => {
      if (!curr || curr.id !== tableId) return curr;

      const shape = curr.shape === 'circle' ? 'circle' : 'rect';

      if (shape === 'circle') {
        const current = curr.seatLayout?.kind === 'circle' ? curr.seatLayout.count : 0;
        const next = Math.min(16, current + 1);
        const nextSeatLayout = { kind: 'circle', count: next } as const;
        const nextSideCapacities = deriveSideCapacitiesFromSeatLayout(
          nextSeatLayout,
          curr.sideCapacities
        );
        return {
          ...curr,
          seatLayout: nextSeatLayout,
          sideCapacities: nextSideCapacities,
          capacityTotal: next,
        };
      }

      if (side === 'radial') return curr;

      const sides =
        curr.seatLayout?.kind === 'rect'
          ? { ...(curr.seatLayout.sides ?? {}) }
          : { north: 0, east: 0, south: 0, west: 0 };

      const current = Number((sides as any)[side] ?? 0);
      const nextSide = Math.min(3, current + 1);
      (sides as any)[side] = nextSide;

      const nextSeatLayout = { kind: 'rect', sides } as const;
      const nextSideCapacities = deriveSideCapacitiesFromSeatLayout(
        nextSeatLayout,
        curr.sideCapacities
      );
      const nextCapacityTotal = computeSeatCountFromSeatLayout(nextSeatLayout);

      return {
        ...curr,
        seatLayout: nextSeatLayout,
        sideCapacities: nextSideCapacities,
        capacityTotal: nextCapacityTotal,
      };
    });
  };

  const handleRemoveSeat = (
    tableId: string,
    side: 'north' | 'east' | 'south' | 'west' | 'radial'
  ) => {
    setSelectedTableDraft(curr => {
      if (!curr || curr.id !== tableId) return curr;

      const shape = curr.shape === 'circle' ? 'circle' : 'rect';

      if (shape === 'circle') {
        const current = curr.seatLayout?.kind === 'circle' ? curr.seatLayout.count : 0;
        const next = Math.max(0, current - 1);
        const nextSeatLayout = { kind: 'circle', count: next } as const;
        const nextSideCapacities = deriveSideCapacitiesFromSeatLayout(
          nextSeatLayout,
          curr.sideCapacities
        );
        return {
          ...curr,
          seatLayout: nextSeatLayout,
          sideCapacities: nextSideCapacities,
          capacityTotal: next,
        };
      }

      if (side === 'radial') return curr;

      const sides =
        curr.seatLayout?.kind === 'rect'
          ? { ...(curr.seatLayout.sides ?? {}) }
          : { north: 0, east: 0, south: 0, west: 0 };

      const current = Number((sides as any)[side] ?? 0);
      const nextSide = Math.max(0, current - 1);
      (sides as any)[side] = nextSide;

      const nextSeatLayout = { kind: 'rect', sides } as const;
      const nextSideCapacities = deriveSideCapacitiesFromSeatLayout(
        nextSeatLayout,
        curr.sideCapacities
      );
      const nextCapacityTotal = computeSeatCountFromSeatLayout(nextSeatLayout);

      return {
        ...curr,
        seatLayout: nextSeatLayout,
        sideCapacities: nextSideCapacities,
        capacityTotal: nextCapacityTotal,
      };
    });
  };
  
  const renderSelectedTablePopover = (transform: {
    scale: number;
    offsetX: number;
    offsetY: number;
  }) => {
    if (!selectedTableKey || !selectedEditorTable || !selectedTableDraft) return null;
    const geometry = resolveTableGeometryInFloorplanSpace(
      selectedEditorTable,
      floorplanDims,
      TABLE_GEOMETRY_DEFAULTS
    );
    const position = getRenderPosition(selectedEditorTable, geometry);
    const centerX = position.x + geometry.w / 2;
    const centerY = position.y + geometry.h / 2;
    const screenX = centerX * transform.scale + transform.offsetX + 12;
    const screenY = centerY * transform.scale + transform.offsetY - 12;
    return (
      <div className="pointer-events-none absolute inset-0 z-[12]">
        <div
          className="pointer-events-auto rounded border border-gray-200 bg-white/95 px-3 py-2 text-[11px] shadow"
          data-seating-no-deselect="1"
          style={{ position: 'absolute', left: screenX, top: screenY }}
        >
          <div className="font-semibold">
            {selectedEditorTable.name || selectedEditorTable.id}
          </div>
          <div className="text-[10px] text-gray-500">
            {selectedEditorTable.zoneId}
          </div>
          <div className="text-[10px] text-gray-500">
            {seatLayoutSummary}
          </div>
          <div className="text-[10px] text-gray-500">
            Kapacitás: {seatLayoutCapacityTotal ?? selectedTableDraft.capacityTotal}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              className={`rounded border px-2 py-0.5 text-[10px] ${
                viewportMode === 'selected'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              onClick={() => setViewportMode('selected')}
            >
              Zoom in (asztal)
            </button>
            <button
              type="button"
              className={`rounded border px-2 py-0.5 text-[10px] ${
                viewportMode === 'fit'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              onClick={handleZoomOutFit}
            >
              Zoom out (teljes)
            </button>
            <button
              type="button"
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[10px] text-gray-700"
              onClick={() => void handleSelectedTableMetadataSave()}
            >
              Mentés
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  const renderFloorplansPanel = () => (
    <div className="space-y-6">
      <div className="text-sm text-[var(--color-text-secondary)]">
        Az aktív asztaltérképet itt tudod kiválasztani.
      </div>
      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Aktív alaprajz</h3>
        <label className="flex flex-col gap-1 text-sm">
          Aktív alaprajz
          <select
            className="border rounded p-2"
            value={settings?.activeFloorplanId ?? resolvedActiveFloorplanId}
            onChange={event =>
              setSettings(prev => ({
                ...ensureSettings(prev),
                activeFloorplanId: event.target.value,
              }))
            }
          >
            <option value="">Nincs kiválasztva</option>
            {visibleFloorplans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Alaprajzok</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <input
            className="border rounded p-2"
            placeholder="Alaprajz neve"
            value={floorplanForm.name}
            onChange={event =>
              setFloorplanForm(current => ({ ...current, name: event.target.value }))
            }
          />
          <input
            type="number"
            className="border rounded p-2"
            placeholder="Szélesség"
            value={floorplanForm.width}
            onChange={event =>
              setFloorplanForm(current => ({ ...current, width: Number(event.target.value) }))
            }
          />
          <input
            type="number"
            className="border rounded p-2"
            placeholder="Magasság"
            value={floorplanForm.height}
            onChange={event =>
              setFloorplanForm(current => ({ ...current, height: Number(event.target.value) }))
            }
          />
          <input
            type="number"
            className="border rounded p-2"
            placeholder="Grid méret"
            value={floorplanForm.gridSize}
            onChange={event =>
              setFloorplanForm(current => ({ ...current, gridSize: Number(event.target.value) }))
            }
          />
          <input
            className="border rounded p-2 col-span-2"
            placeholder="Háttérkép URL (opcionális)"
            value={floorplanForm.backgroundImageUrl}
            onChange={event =>
              setFloorplanForm(current => ({
                ...current,
                backgroundImageUrl: event.target.value,
              }))
            }
          />
        </div>
        <button
          type="button"
          onClick={event => handleActionButtonClick(event, handleFloorplanSubmit)}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
          disabled={actionSaving['floorplan-submit']}
        >
          {actionSaving['floorplan-submit'] ? 'Mentés...' : 'Mentés'}
        </button>
        <div className="space-y-2 text-sm">
          {visibleFloorplans.map(plan => {
            const width = Number(plan.width);
            const height = Number(plan.height);
            const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
            const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
            const isActivating = actionSaving[`floorplan-activate-${plan.id}`];
            const isDeleting = actionSaving[`floorplan-delete-${plan.id}`];
            return (
              <div key={plan.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  {plan.name} ({safeWidth}×{safeHeight})
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={event =>
                      handleActionButtonClick(event, () => handleActivateFloorplan(plan.id))
                    }
                    className="text-blue-600 disabled:opacity-50"
                    disabled={isActivating || isDeleting}
                  >
                    {resolvedActiveFloorplanId === plan.id
                      ? 'Aktív'
                      : isActivating
                      ? 'Aktiválás...'
                      : 'Aktivál'}
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      if (debugSeating) {
                        console.debug('[seating] delete floorplan button onClick fired', {
                          floorplanId: plan.id,
                        });
                      }
                      handleActionButtonClick(event, () => handleDeleteFloorplan(plan.id));
                    }}
                    className="text-red-600 disabled:opacity-50"
                    disabled={isDeleting || isActivating}
                  >
                    {isDeleting ? 'Törlés...' : 'Törlés'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Asztaltérkép szerkesztő</h3>
        {!activeFloorplan ? (
          <div className="text-sm text-[var(--color-text-secondary)]">
            Nincs aktív alaprajz kiválasztva.
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]"
              data-seating-no-deselect="1"
            >
              <span>
                Grid: {editorGridSize}px • Húzd a pöttyöt = forgatás • Shift = 15° • Alt = 1°
              </span>
              <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setFloorplanMode('view')}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    floorplanMode === 'view'
                      ? 'bg-gray-200 text-gray-800'
                      : 'text-gray-500'
                  }`}
                >
                  Megtekintés
                </button>
                <button
                  type="button"
                  onClick={() => setFloorplanMode('edit')}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    floorplanMode === 'edit'
                      ? 'bg-gray-200 text-gray-800'
                      : 'text-gray-500'
                  }`}
                  disabled={!canEditFloorplan}
                >
                  Szerkesztés
                </button>
              </div>
              {selectedEditorTable && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      viewportMode === 'selected'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                    onClick={() => setViewportMode('selected')}
                  >
                    Zoom in (asztal)
                  </button>
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      viewportMode === 'fit'
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                    onClick={handleZoomOutFit}
                  >
                    Zoom out (teljes)
                  </button>
                </div>
              )}
              <button
                type="button"
                className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 disabled:opacity-50"
                onClick={() => void handleUndoLastAction()}
                disabled={!isUndoAvailable || floorplanMode !== 'edit'}
              >
                Visszavonás
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  snapEnabled
                    ? 'border-gray-200 bg-white text-gray-600'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}
                onClick={() => setSnapEnabled(current => !current)}
              >
                Snap {snapEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[11px] ${
                  precisionEnabled
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
                onClick={() => setPrecisionEnabled(current => !current)}
              >
                Precision {precisionEnabled ? 'ON' : 'OFF'}
              </button>
              {floorplanMode === 'edit' && (isDev || debugSeating) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      showObstacleDebug
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                    onClick={() => setShowObstacleDebug(current => !current)}
                  >
                    Obstacles {showObstacleDebug ? 'ON' : 'OFF'}
                  </button>
                  <span className="text-[11px] text-gray-500">
                    obstacles: {activeObstacles.length}
                  </span>
                </div>
              )}
              {floorplanMode === 'edit' && (
                <>
                  <button
                    type="button"
                    className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600"
                    onClick={() => {
                      if (!activeFloorplan) return;
                      const id =
                        typeof crypto !== 'undefined' && 'randomUUID' in crypto
                          ? crypto.randomUUID()
                          : `obstacle-${Date.now()}`;
                      const defaultW = 140;
                      const defaultH = 90;
                      const startX = Math.max(0, (floorplanW - defaultW) / 2);
                      const startY = Math.max(0, (floorplanH - defaultH) / 2);
                      const nextObstacle: FloorplanObstacle = {
                        id,
                        name: 'No-go',
                        x: applyGrid(startX, editorGridSize),
                        y: applyGrid(startY, editorGridSize),
                        w: defaultW,
                        h: defaultH,
                      };
                      const previousObstacles = activeObstacles;
                      const nextObstacles = [...activeObstacles, nextObstacle];
                      updateActiveFloorplanObstacles(nextObstacles);
                      setSelectedObstacleId(id);
                      void persistActiveObstacles(nextObstacles, previousObstacles);
                    }}
                  >
                    + No-go zóna
                  </button>
                  <button
                    type="button"
                    className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 disabled:opacity-50"
                    disabled={!selectedObstacleId}
                    onClick={() => {
                      if (!selectedObstacleId) return;
                      const previousObstacles = activeObstacles;
                      const nextObstacles = activeObstacles.filter(
                        obstacle => obstacle.id !== selectedObstacleId
                      );
                      updateActiveFloorplanObstacles(nextObstacles);
                      setSelectedObstacleId(null);
                      void persistActiveObstacles(nextObstacles, previousObstacles);
                    }}
                  >
                    No-go törlés
                  </button>
                </>
              )}
            </div>
            {typeof debugSeating !== 'undefined' && debugSeating && (
              <div className="rounded border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                <div className="font-semibold">Floorplan debug</div>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">resolved id</dt>
                    <dd className="truncate">
                      {resolvedActiveFloorplanId || 'n/a'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">active id</dt>
                    <dd className="truncate">{activeFloorplan?.id ?? 'n/a'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">
                      visible floorplans
                    </dt>
                    <dd>{visibleFloorplans.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">tables</dt>
                    <dd>{tables.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">editor tables</dt>
                    <dd>{editorTables.length}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">
                      floorplan size
                    </dt>
                    <dd>
                      {floorplanW} × {floorplanH}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">
                      viewport rect
                    </dt>
                    <dd>
                      {formatDebugNumber(floorplanViewportRect.width)} ×{' '}
                      {formatDebugNumber(floorplanViewportRect.height)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-amber-700">transform</dt>
                    <dd>
                      scale {formatDebugNumber(activeFloorplanTransform.scale)} | rect{' '}
                      {formatDebugNumber(activeFloorplanTransform.rectWidth)} ×{' '}
                      {formatDebugNumber(activeFloorplanTransform.rectHeight)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {typeof debugSeating !== 'undefined' &&
              debugSeating &&
              debugFloorplanWarningReasons.length > 0 && (
                <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900">
                  <div className="font-semibold">Floorplan debug warning</div>
                  <p className="mt-1">
                    Tables exist but the floorplan cannot render because:{' '}
                    {debugFloorplanWarningReasons.join(', ')}
                  </p>
                </div>
              )}
            {isEditMode ? (
              <div className="w-full max-w-[min(90vh,100%)] aspect-square mx-auto overflow-hidden min-w-0 min-h-0">
              <div
                ref={floorplanViewportRef}
                className={`relative h-full w-full min-w-0 min-h-0 border border-gray-200 rounded-xl bg-white/80 ${
                  isEditMode ? 'touch-none' : ''
                }`}
                onPointerDownCapture={handleFloorplanBackgroundPointerDown}
              >
                {debugEnabled && (
                  <div className="absolute left-2 top-2 z-20 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 max-w-[240px]">
                    <div>
                      dims: {Math.round(floorplanDims.width)}×
                      {Math.round(floorplanDims.height)} ({floorplanDims.source})
                    </div>
                    <div>
                      viewport: {Math.round(floorplanViewportRect.width)}×
                      {Math.round(floorplanViewportRect.height)}
                    </div>
                    <div>
                      scale: {activeFloorplanTransform.scale.toFixed(3)} | offset:{' '}
                      {activeFloorplanTransform.offsetX.toFixed(1)},{' '}
                      {activeFloorplanTransform.offsetY.toFixed(1)} | ready:{' '}
                      {activeFloorplanTransform.rectWidth > 0 &&
                      activeFloorplanTransform.rectHeight > 0 &&
                      floorplanW > 0 &&
                      floorplanH > 0
                        ? 'yes'
                        : 'no'}
                    </div>
                    <div>normalizedDetected: {normalizedDetected ? 'yes' : 'no'}</div>
                    <div>grid mounted: {gridLayerRef.current ? 'yes' : 'no'}</div>
                    {debugRawGeometry && (
                      <div>
                        raw: {debugRawGeometry.x.toFixed(1)},{debugRawGeometry.y.toFixed(1)}{' '}
                        {debugRawGeometry.w.toFixed(1)}×{debugRawGeometry.h.toFixed(1)} r
                        {debugRawGeometry.rot.toFixed(1)}
                      </div>
                    )}
                    {sampleTableGeometry && (
                      <div>
                        floor: {sampleTableGeometry.x.toFixed(1)},
                        {sampleTableGeometry.y.toFixed(1)} {sampleTableGeometry.w.toFixed(1)}×
                        {sampleTableGeometry.h.toFixed(1)} r
                        {sampleTableGeometry.rot.toFixed(1)}
                      </div>
                    )}
                    {sampleTableRender && (
                      <div>
                        render: {sampleTableRender.x.toFixed(1)},{sampleTableRender.y.toFixed(1)}{' '}
                        {sampleTableRender.w.toFixed(1)}×{sampleTableRender.h.toFixed(1)} r
                        {sampleTableRender.rot.toFixed(1)}
                      </div>
                    )}
                    {debugTableRows.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {debugTableRows.map(row => (
                          <div key={`dbg-${row.id}`}>
                            t:{' '}
                            {row.name ? `${row.name} ` : ''}
                            {row.raw.x.toFixed(1)},{row.raw.y.toFixed(1)} {row.raw.w.toFixed(1)}×
                            {row.raw.h.toFixed(1)} r{row.raw.rot.toFixed(1)} →{' '}
                            {row.floor.x.toFixed(1)},{row.floor.y.toFixed(1)}{' '}
                            {row.floor.w.toFixed(1)}×{row.floor.h.toFixed(1)} r
                            {row.floor.rot.toFixed(1)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedTableKey ? renderSelectedTablePopover(activeFloorplanTransform) : null}
                <div className="absolute inset-0" style={worldCameraStyle}>
                  <div
                    className="relative ring-1 ring-gray-200 rounded-lg bg-white overflow-hidden"
                    style={{ width: floorplanW, height: floorplanH }}
                  >
                    <div
                      ref={gridLayerRef}
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        width: floorplanW,
                        height: floorplanH,
                        zIndex: 0,
                        ...gridBackgroundStyle,
                      }}
                    />
                    {debugSeating && (
                      <>
                        {lastDragBlockReason && (
                          <div className="absolute left-2 top-2 z-10 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
                            drag: {lastDragBlockReason}
                          </div>
                        )}
                        {lastDragBoundsRef.current && (
                          <div
                            className="absolute z-[9] border border-dashed border-amber-400"
                            style={{
                              left: lastDragBoundsRef.current.minX,
                              top: lastDragBoundsRef.current.minY,
                              width:
                                lastDragBoundsRef.current.maxX -
                                lastDragBoundsRef.current.minX,
                              height:
                                lastDragBoundsRef.current.maxY -
                                lastDragBoundsRef.current.minY,
                            }}
                          />
                        )}
                        {lastDragPointerRef.current && (
                          <div
                            className="absolute z-[10] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500"
                            style={{
                              left: lastDragPointerRef.current.x,
                              top: lastDragPointerRef.current.y,
                            }}
                          />
                        )}
                        <div
                          className="absolute left-2 bottom-2 z-10 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900"
                          data-tick={debugTick}
                        >
                          <div>reason: {lastDragBlockReason ?? 'n/a'}</div>
                          <div>
                            pointer:{' '}
                            {lastDragPointerRef.current
                              ? `${Math.round(lastDragPointerRef.current.x)}, ${Math.round(
                                  lastDragPointerRef.current.y
                                )}`
                              : 'n/a'}
                          </div>
                          <div>
                            bounds:{' '}
                            {lastDragBoundsRef.current
                              ? `${Math.round(lastDragBoundsRef.current.minX)}-${Math.round(
                                  lastDragBoundsRef.current.maxX
                                )}, ${Math.round(lastDragBoundsRef.current.minY)}-${Math.round(
                                  lastDragBoundsRef.current.maxY
                                )}`
                              : 'n/a'}
                          </div>
                          <div>
                            snap:{' '}
                            {lastDragSnapRef.current
                              ? `${lastDragSnapRef.current.shouldSnap ? 'on' : 'off'} @ ${
                                  lastDragSnapRef.current.gridSize
                                }`
                              : 'n/a'}
                          </div>
                          <div>boundsMode: floorplan</div>
                          <div>overlapEps: {COLLISION_EPS}</div>
                          {debugSeating && isOverlappingObstacle && (
                            <div>
                              tableRect: {Math.round(tableRect.x)},{Math.round(tableRect.y)}{' '}
                              {Math.round(tableRect.w)}×{Math.round(tableRect.h)} | obstacles:{' '}
                              {obstacleHits
                                .map(
                                  hit =>
                                    `${hit.id}:${Math.round(hit.rect.x)},${Math.round(
                                      hit.rect.y
                                    )} ${Math.round(hit.rect.w)}×${Math.round(hit.rect.h)}`
                                )
                                .join(' | ')}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {showObstacleDebug &&
                      activeObstacles.map(obstacle => {
                        const rect = getObstacleRenderRect(obstacle);
                        return (
                          <div
                            key={`debug-${obstacle.id}`}
                            className="absolute z-[8] border border-dashed border-emerald-400 bg-emerald-200/30 text-[9px] text-emerald-900 pointer-events-none"
                            style={{
                              left: rect.x,
                              top: rect.y,
                              width: rect.w,
                              height: rect.h,
                            }}
                          >
                            <span className="absolute left-1 top-1">
                              {obstacle.name ?? obstacle.id}
                            </span>
                          </div>
                        );
                      })}
                    {activeObstacles.map(obstacle => {
                      const rect = getObstacleRenderRect(obstacle);
                      const isSelected = selectedObstacleId === obstacle.id;
                      return (
                        <div
                          key={obstacle.id}
                          className="absolute border border-dashed border-gray-400 bg-gray-200/40 touch-none"
                          data-seating-no-deselect="1"
                          style={{
                            left: rect.x,
                            top: rect.y,
                            width: rect.w,
                            height: rect.h,
                            transform: `rotate(${obstacle.rot ?? 0}deg)`,
                            outline: isSelected ? '2px solid #2563eb' : undefined,
                            zIndex: 1,
                          }}
                          onClick={event => {
                            event.stopPropagation();
                            setSelectedObstacleId(obstacle.id);
                          }}
                          onPointerDown={
                            floorplanMode === 'edit'
                              ? event => handleObstaclePointerDown(event, obstacle, 'move')
                              : undefined
                          }
                          onPointerMove={
                            floorplanMode === 'edit' ? handleObstaclePointerMove : undefined
                          }
                          onPointerUp={
                            floorplanMode === 'edit' ? handleObstaclePointerUp : undefined
                          }
                          onPointerCancel={
                            floorplanMode === 'edit' ? handleObstaclePointerCancel : undefined
                          }
                        >
                          {floorplanMode === 'edit' && (
                            <span className="absolute left-1 top-1 text-[10px] text-gray-600">
                              {obstacle.name ?? 'No-go'}
                            </span>
                          )}
                          {floorplanMode === 'edit' && (
                            <span
                              role="button"
                              tabIndex={-1}
                              className="absolute -right-2 -bottom-2 h-3 w-3 rounded border border-gray-400 bg-white touch-none"
                              onPointerDown={event =>
                                handleObstaclePointerDown(event, obstacle, 'resize')
                              }
                              onPointerMove={handleObstaclePointerMove}
                              onPointerUp={handleObstaclePointerUp}
                              onPointerCancel={handleObstaclePointerCancel}
                            />
                          )}
                        </div>
                      );
                    })}
                    {editorTables.map(table => {
                      const geometry = resolveTableGeometryInFloorplanSpace(
                        table,
                        floorplanDims,
                        TABLE_GEOMETRY_DEFAULTS
                      );
                      const position = getRenderPosition(table, geometry);
                      const renderRot =
                        (isEditMode ? draftRotations[table.id] : undefined) ?? geometry.rot;
                      const isSelected = selectedTableId === table.id;
                      const isSaving = Boolean(savingById[table.id]);
                      const tableVisualState = getTableVisualState();
                      const tableRect = getTableAabbForCollision(
                        position.x,
                        position.y,
                        geometry.w,
                        geometry.h,
                        renderRot
                      );
                      const obstacleHits =
                        floorplanMode === 'edit'
                          ? activeObstacles
                              .map(obstacle => ({
                                id: obstacle.id,
                                rect: getObstacleRenderRect(obstacle),
                              }))
                              .filter(hit => rectIntersectEps(tableRect, hit.rect))
                          : [];
                      const isOverlappingObstacle = obstacleHits.length > 0;
                      return (
                        <div
                          key={table.id}
                          // Drag root must stay non-relative to preserve pointer math.
                          className={`absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 select-none touch-none ${
                            floorplanMode === 'edit' ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                          data-seating-table-root="1"
                          data-seating-no-deselect="1"
                          style={{
                            left: position.x,
                            top: position.y,
                            width: geometry.w,
                            height: geometry.h,
                            borderRadius: geometry.shape === 'circle' ? geometry.radius : 8,
                            border: isSelected ? '2px solid #2563eb' : '1px solid #9ca3af',
                            backgroundColor: resolveTableVisualStyle(tableVisualState),
                            transform: `rotate(${renderRot}deg)`,
                            boxShadow: isSelected
                              ? '0 0 0 3px rgba(59, 130, 246, 0.35)'
                              : '0 1px 3px rgba(0,0,0,0.1)',
                            touchAction: 'none',
                            zIndex: 2,
                          }}
                          onClick={event => {
                            event.stopPropagation();
                            handleSelectTable(table.id);
                          }}
                          onPointerDown={
                            floorplanMode === 'edit'
                              ? event => {
                                  event.stopPropagation();
                                  handleTablePointerDown(event, table, geometry);
                                }
                              : event => {
                                  event.stopPropagation();
                                }
                          }
                          onPointerMove={
                            floorplanMode === 'edit' ? handleTablePointerMove : undefined
                          }
                          onPointerUp={floorplanMode === 'edit' ? handleTablePointerUp : undefined}
                          onPointerCancel={
                            floorplanMode === 'edit' ? handleTablePointerCancel : undefined
                          }
                          onLostPointerCapture={
                            floorplanMode === 'edit' ? handleLostPointerCapture : undefined
                          }
                        >
                          <div className="relative h-full w-full" style={{ pointerEvents: 'none' }}>
                            {isSelected && !table.locked && floorplanMode === 'edit' && (
                              <>
                                <span
                                  className="absolute left-1/2 -top-3 h-3 w-px -translate-x-1/2 bg-gray-300"
                                  aria-hidden="true"
                                />
                                <button
                                  type="button"
                                  data-seating-no-deselect="1"
                                  className="absolute left-1/2 -top-6 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm"
                                  style={{ touchAction: 'none', pointerEvents: 'auto', zIndex: 40 }}
                                  onPointerDown={event => {
                                    if (!activeFloorplan) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (recenterRafIdRef.current !== null) {
                                      cancelAnimationFrame(recenterRafIdRef.current);
                                      recenterRafIdRef.current = null;
                                    }
                                    event.currentTarget.setPointerCapture?.(event.pointerId);
                                    handleSelectTable(table.id);
                                    if (debugSeating) {
                                      requestDebugFlush(null);
                                    }
                                    const centerX = position.x + geometry.w / 2;
                                    const centerY = position.y + geometry.h / 2;
                                    const { rect: dragRect, transform: dragTransform } =
                                      getActivePointerTransform();
                                    const pointer = mapClientToFloorplanUsingTransform(
                                      event.clientX,
                                      event.clientY,
                                      dragTransform,
                                      dragRect
                                    );
                                    if (!pointer) {
                                      return;
                                    }
                                    const startAngle =
                                      Math.atan2(pointer.y - centerY, pointer.x - centerX) *
                                      (180 / Math.PI);
                                    setDragState({
                                      tableId: table.id,
                                      pointerId: event.pointerId,
                                      pointerTarget: event.currentTarget,
                                      pointerStartClientX: event.clientX,
                                      pointerStartClientY: event.clientY,
                                      pointerStartFloorX: pointer.x,
                                      pointerStartFloorY: pointer.y,
                                      dragStartTransform: dragTransform,
                                      dragStartRect: dragRect,
                                      dragStartScale: safeScale(dragTransform.scale),
                                      tableStartX: position.x,
                                      tableStartY: position.y,
                                      width: geometry.w,
                                      height: geometry.h,
                                      boundW: geometry.w,
                                      boundH: geometry.h,
                                      mode: 'rotate',
                                      tableStartRot: renderRot,
                                      rotStartAngleDeg: startAngle,
                                      rotCenterX: centerX,
                                      rotCenterY: centerY,
                                      floorplanWidth: floorplanW,
                                      floorplanHeight: floorplanH,
                                      gridSize: editorGridSize,
                                      snapToGrid: table.snapToGrid ?? false,
                                    });
                                    registerWindowTableDragListeners();
                                    setLastSavedRot(current =>
                                      current[table.id] !== undefined
                                        ? current
                                        : { ...current, [table.id]: renderRot }
                                    );
                                  }}
                                  onPointerMove={handleTablePointerMove}
                                  onPointerUp={handleTablePointerUp}
                                  onPointerCancel={handleTablePointerCancel}
                                  onLostPointerCapture={handleLostPointerCapture}
                                >
                                  <span className="h-1 w-1 rounded-full bg-gray-500" />
                                </button>
                              </>
                            )}
                            {isOverlappingObstacle && (
                              <span className="absolute -top-2 -right-2 rounded bg-amber-200 px-1 text-[9px] text-amber-800">
                                !
                              </span>
                            )}
                            {debugSeating && isOverlappingObstacle && (
                              <>
                                <div
                                  className="pointer-events-none absolute border border-dashed border-amber-500"
                                  style={{
                                    left: tableRect.x,
                                    top: tableRect.y,
                                    width: tableRect.w,
                                    height: tableRect.h,
                                  }}
                                />
                                {obstacleHits.map(hit => (
                                  <div
                                    key={`overlap-${table.id}-${hit.id}`}
                                    className="pointer-events-none absolute border border-dashed border-rose-500"
                                    style={{
                                      left: hit.rect.x,
                                      top: hit.rect.y,
                                      width: hit.rect.w,
                                      height: hit.rect.h,
                                    }}
                                  />
                                ))}
                              </>
                            )}
                            {table.name}
                            <div className="flex gap-1 mt-1">
                              {table.locked && (
                                <span className="px-1 rounded bg-gray-200 text-[9px]">🔒</span>
                              )}
                              {table.canCombine && (
                                <span className="px-1 rounded bg-amber-200 text-[9px]">COMB</span>
                              )}
                              {isSaving && (
                                <span className="px-1 rounded bg-blue-100 text-[9px]">
                                  Saving...
                                </span>
                              )}
                              {isSelected && (
                                <span className="px-1 rounded bg-gray-100 text-[9px]">
                                  {Math.round(renderRot)}°
                                </span>
                              )}
                            </div>
                            {isSelected && !table.locked && (
                              <div className="flex gap-1 mt-1">
                                <button
                                  type="button"
                                  data-seating-no-deselect="1"
                                  className="px-1 rounded bg-gray-100 text-[9px]"
                                  style={{ pointerEvents: 'auto', zIndex: 30, touchAction: 'none' }}
                                  onPointerDown={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const step = 5;
                                    applyRotationDelta(table.id, renderRot, -step);
                                    lastRotateActionRef.current = { t: Date.now() };
                                  }}
                                  onClick={event => {
                                    event.stopPropagation();
                                  }}
                                >
                                  ↺
                                </button>
                                <button
                                  type="button"
                                  data-seating-no-deselect="1"
                                  className="px-1 rounded bg-gray-100 text-[9px]"
                                  style={{ pointerEvents: 'auto', zIndex: 30, touchAction: 'none' }}
                                  onPointerDown={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const step = 5;
                                    applyRotationDelta(table.id, renderRot, step);
                                    lastRotateActionRef.current = { t: Date.now() };
                                  }}
                                  onClick={event => {
                                    event.stopPropagation();
                                  }}
                                >
                                  ↻
                                </button>
                                <button
                                  type="button"
                                  data-seating-no-deselect="1"
                                  className="px-1 rounded bg-gray-100 text-[9px]"
                                  style={{ pointerEvents: 'auto', zIndex: 30, touchAction: 'none' }}
                                  onPointerDown={event => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    applyRotationAbsolute(table.id, 0);
                                    lastRotateActionRef.current = { t: Date.now() };
                                  }}
                                  onClick={event => {
                                    event.stopPropagation();
                                  }}
                                >
                                  Reset
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <FloorplanWorldLayer
                      tables={tablesForWorldLayer}
                      obstacles={activeObstacles}
                      floorplanDims={floorplanDims}
                      tableDefaults={TABLE_GEOMETRY_DEFAULTS}
                      seatUI={{
                        preview: floorplanMode === 'view',
                        editable: floorplanMode === 'edit',
                        onAddSeat: handleAddSeat,
                        onRemoveSeat: handleRemoveSeat,
                        debug: debugEnabled,
                        debugMode: floorplanMode,
                        debugSelectedTableId: selectedTableId,
                        debugSelectedTableDraftId: selectedTableDraft?.id ?? null,
                        debugSelectedTableKey: selectedTableKey,
                        uiScale: activeFloorplanTransform.scale,
                      }}
                      appearance={{
                        showCapacity: false,
                        renderTableBody: false,
                        renderObstacles: false,
                        isSelected: t => t.id === selectedTableKey,
                      }}
                    />
                  </div>
                </div>
              </div>
              </div>
            ) : (
              <div onPointerDownCapture={handleFloorplanBackgroundPointerDown}>
                <FloorplanViewportCanvas
                  ref={viewportCanvasRef}
                  floorplanDims={floorplanDims}
                  debugEnabled={debugEnabled}
                  viewportDeps={[resolvedActiveFloorplanId]}
                  debugOverlay={context => (
                    <div className="absolute left-2 top-2 z-20 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 max-w-[240px]">
                      <div>
                        dims: {Math.round(context.floorplanDims.width)}×
                        {Math.round(context.floorplanDims.height)} ({context.floorplanDims.source})
                      </div>
                      <div>
                        viewport: {Math.round(context.viewportRect.width)}×
                        {Math.round(context.viewportRect.height)}
                      </div>
                      <div>
                        scale: {context.transform.scale.toFixed(3)} | offset:{' '}
                        {context.transform.offsetX.toFixed(1)},{' '}
                        {context.transform.offsetY.toFixed(1)} | ready:{' '}
                        {context.transform.ready ? 'yes' : 'no'}
                      </div>
                      <div>normalizedDetected: {normalizedDetected ? 'yes' : 'no'}</div>
                      <div>mode: view</div>
                      {debugRawGeometry && (
                        <div>
                          raw: {debugRawGeometry.x.toFixed(1)},{debugRawGeometry.y.toFixed(1)}{' '}
                          {debugRawGeometry.w.toFixed(1)}×{debugRawGeometry.h.toFixed(1)} r
                          {debugRawGeometry.rot.toFixed(1)}
                        </div>
                      )}
                      {sampleTableGeometry && (
                        <div>
                          floor: {sampleTableGeometry.x.toFixed(1)},
                          {sampleTableGeometry.y.toFixed(1)} {sampleTableGeometry.w.toFixed(1)}×
                          {sampleTableGeometry.h.toFixed(1)} r
                          {sampleTableGeometry.rot.toFixed(1)}
                        </div>
                      )}
                      {sampleTableRender && (
                        <div>
                          render: {sampleTableRender.x.toFixed(1)},{sampleTableRender.y.toFixed(1)}{' '}
                          {sampleTableRender.w.toFixed(1)}×{sampleTableRender.h.toFixed(1)} r
                          {sampleTableRender.rot.toFixed(1)}
                        </div>
                      )}
                      {debugTableRows.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {debugTableRows.map(row => (
                            <div key={`dbg-view-${row.id}`}>
                              t:{' '}
                              {row.name ? `${row.name} ` : ''}
                              {row.raw.x.toFixed(1)},{row.raw.y.toFixed(1)}{' '}
                              {row.raw.w.toFixed(1)}×{row.raw.h.toFixed(1)} r
                              {row.raw.rot.toFixed(1)} → {row.floor.x.toFixed(1)},
                              {row.floor.y.toFixed(1)} {row.floor.w.toFixed(1)}×
                              {row.floor.h.toFixed(1)} r{row.floor.rot.toFixed(1)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  renderOverlay={context =>
                    selectedTableKey ? renderSelectedTablePopover(context.transform) : null
                  }
                  renderWorld={context => (
                    <FloorplanWorldLayer
                      tables={tablesForWorldLayer}
                      obstacles={activeObstacles}
                      floorplanDims={floorplanDims}
                      tableDefaults={TABLE_GEOMETRY_DEFAULTS}
                      seatUI={{
                        preview: floorplanMode === 'view',
                        editable: floorplanMode === 'edit',
                        onAddSeat: handleAddSeat,
                        onRemoveSeat: handleRemoveSeat,
                        debug: debugEnabled,
                        debugMode: floorplanMode,
                        debugSelectedTableId: selectedTableId,
                        debugSelectedTableDraftId: selectedTableDraft?.id ?? null,
                        debugSelectedTableKey: selectedTableKey,
                        uiScale: context.transform.scale,
                      }}
                      appearance={{
                        showCapacity: true,
                        isSelected: t => t.id === selectedTableKey,
                      }}
                    />
                  )}
                />
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border rounded-lg p-3 text-sm space-y-3">
            <h4 className="font-semibold">Kiválasztott asztal</h4>
            {!selectedTable || !selectedTableDraft ? (
              <div className="text-xs text-[var(--color-text-secondary)]">
                Kattints egy asztalra az alaprajzon a szerkesztéshez.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {selectedTable.name || selectedTable.id} • zóna: {selectedTable.zoneId}
                  {selectedTable.baseCombo ? (
                    <>
                      {' '}
                      • base combo: {selectedTable.baseCombo.groupId} (
                      {selectedTable.baseCombo.role})
                    </>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  {seatLayoutSummary}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    Kapacitás összesen
                    <input
                      type="number"
                      min={0}
                      className="border rounded p-2"
                      value={seatLayoutCapacityTotal ?? selectedTableDraft.capacityTotal}
                      disabled={seatLayoutCapacityTotal !== null}
                      readOnly={seatLayoutCapacityTotal !== null}
                      onChange={event =>
                        setSelectedTableDraft(current =>
                          current
                            ? {
                                ...current,
                                capacityTotal: Number(event.target.value),
                              }
                            : current
                        )
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                      Észak
                      <input
                        type="number"
                        min={0}
                        className="border rounded p-2"
                        value={selectedTableDraft.sideCapacities.north}
                        disabled={seatLayoutCapacityTotal !== null}
                        readOnly={seatLayoutCapacityTotal !== null}
                        onChange={event =>
                          setSelectedTableDraft(current =>
                            current
                              ? {
                                  ...current,
                                  sideCapacities: {
                                    ...current.sideCapacities,
                                    north: Number(event.target.value),
                                  },
                                }
                              : current
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Kelet
                      <input
                        type="number"
                        min={0}
                        className="border rounded p-2"
                        value={selectedTableDraft.sideCapacities.east}
                        disabled={seatLayoutCapacityTotal !== null}
                        readOnly={seatLayoutCapacityTotal !== null}
                        onChange={event =>
                          setSelectedTableDraft(current =>
                            current
                              ? {
                                  ...current,
                                  sideCapacities: {
                                    ...current.sideCapacities,
                                    east: Number(event.target.value),
                                  },
                                }
                              : current
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Dél
                      <input
                        type="number"
                        min={0}
                        className="border rounded p-2"
                        value={selectedTableDraft.sideCapacities.south}
                        disabled={seatLayoutCapacityTotal !== null}
                        readOnly={seatLayoutCapacityTotal !== null}
                        onChange={event =>
                          setSelectedTableDraft(current =>
                            current
                              ? {
                                  ...current,
                                  sideCapacities: {
                                    ...current.sideCapacities,
                                    south: Number(event.target.value),
                                  },
                                }
                              : current
                          )
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Nyugat
                      <input
                        type="number"
                        min={0}
                        className="border rounded p-2"
                        value={selectedTableDraft.sideCapacities.west}
                        disabled={seatLayoutCapacityTotal !== null}
                        readOnly={seatLayoutCapacityTotal !== null}
                        onChange={event =>
                          setSelectedTableDraft(current =>
                            current
                              ? {
                                  ...current,
                                  sideCapacities: {
                                    ...current.sideCapacities,
                                    west: Number(event.target.value),
                                  },
                                }
                              : current
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                {sideCapacitySum !== selectedTableDraft.capacityTotal && (
                  <div className="text-xs text-amber-600">
                    Figyelem: az oldal kapacitások összege ({sideCapacitySum}) nem
                    egyezik a teljes kapacitással ({selectedTableDraft.capacityTotal}).
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-600">
                    Kombinálható asztalok (azonos zóna)
                  </div>
                  {combinableTableOptions.length === 0 ? (
                    <div className="text-xs text-[var(--color-text-secondary)]">
                      Nincs elérhető asztal a zónában.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {combinableTableOptions.map(option => (
                        <label key={option.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedTableDraft.combinableWithIds.includes(option.id)}
                            onChange={event =>
                              setSelectedTableDraft(current => {
                                if (!current) return current;
                                const next = event.target.checked
                                  ? [...current.combinableWithIds, option.id]
                                  : current.combinableWithIds.filter(id => id !== option.id);
                                return { ...current, combinableWithIds: next };
                              })
                            }
                          />
                          {option.name || option.id}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={event =>
                    handleActionButtonClick(event, handleSelectedTableMetadataSave)
                  }
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-50"
                  disabled={actionSaving[`table-meta-${selectedTableDraft.id}`]}
                >
                  {actionSaving[`table-meta-${selectedTableDraft.id}`]
                    ? 'Mentés...'
                    : 'Kapacitás mentése'}
                </button>
              </div>
            )}
          </div>
          <div className="border rounded-lg p-3 text-sm space-y-3">
            <h4 className="font-semibold">Base kombináció</h4>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Jelölj ki több asztalt, majd hozd létre a base kombót (csak metaadat).
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
          
            </div>
            <button
              type="button"
              onClick={event => handleActionButtonClick(event, handleCreateBaseCombo)}
              className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs disabled:opacity-50"
              disabled={baseComboSelection.length < 2}
            >
              Base combo létrehozása
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const focusTabById = (tabId: string) => {
    const focus = () => {
      if (typeof document === 'undefined') {
        return;
      }
      document.getElementById(`seating-tab-${tabId}`)?.focus();
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(focus);
    } else {
      setTimeout(focus, 0);
    }
  };

  const handleTabsKeyDown = (event: React.KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
    if (currentIndex === -1) {
      return;
    }
    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab.id);
    focusTabById(nextTab.id);
  };

  const renderActivePanel = (tabId: (typeof tabs)[number]['id']) => {
    switch (tabId) {
      case 'overview':
        return renderOverviewPanel();
      case 'zones':
        return renderZonesPanel();
      case 'tables':
        return renderTablesPanel();
      case 'combinations':
        return renderCombinationsPanel();
      case 'floorplans':
        return renderFloorplansPanel();
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <ModalShell
        onClose={handleClose}
        ariaLabelledBy="seating-settings-title"
        containerClassName="max-w-3xl h-[40vh]"
        header={
          <h2 id="seating-settings-title" className="text-xl font-bold">
            Ültetés beállítások
          </h2>
        }
      >
        Betöltés...
      </ModalShell>
    );
  }

  const headerContent = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="seating-settings-title" className="text-xl font-bold">
            Ültetés beállítások
          </h2>
          <div className="text-xs text-gray-500">
            Egység: {unitId.slice(0, 8)}… •{' '}
            {isSaving
              ? 'Mentés folyamatban...'
              : isDirty
              ? 'Nem mentett változások'
              : 'Minden mentve'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex items-center gap-2 text-sm text-gray-500"
        >
          {isDirty && (
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-blue-400" />
          )}
          Bezárás
        </button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {success && <div className="text-sm text-green-600">{success}</div>}
    </>
  );

  const footerContent = (
    <div className="border-t pt-3 pb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-gray-500" aria-live="polite" aria-atomic="true">
        {isSaving
          ? 'Mentés folyamatban...'
          : isDirty
          ? 'Nem mentett változások'
          : 'Minden mentve'}
      </div>
      <div className="flex items-center gap-3">
        {saveFeedback && (
          <span role="status" className="text-xs text-green-600">
            {saveFeedback}
          </span>
        )}
        {isDirty && !isSaving && (
          <button
            type="button"
            onClick={handleResetChanges}
            className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm"
          >
            Visszaállítás
          </button>
        )}
        <button
          type="button"
          onClick={event => handleActionButtonClick(event, handleSettingsSave)}
          className={`px-4 py-2 rounded-lg text-sm disabled:opacity-50 ${
            canSave ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}
          disabled={!canSave}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      onClose={handleClose}
      ariaLabelledBy="seating-settings-title"
      containerClassName="max-w-5xl h-[85vh]"
      header={headerContent}
      footer={footerContent}
    >
      <RuntimeErrorOverlay enabled={errorOverlayEnabled} />
      <PillPanelLayout
        sections={tabs}
        activeId={activeTab}
        onChange={setActiveTab}
        onKeyDown={handleTabsKeyDown}
        ariaLabel="Ültetés beállítások szakaszok"
        idPrefix="seating"
        renderPanel={renderActivePanel}
      />
    </ModalShell>
  );
};

export default SeatingSettingsModal;
