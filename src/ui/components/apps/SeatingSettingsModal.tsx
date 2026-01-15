import { FirebaseError } from 'firebase/app';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, functions } from '../../../core/firebase/config';
import {
  Floorplan,
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
  listTables,
  listZones,
  updateFloorplan,
  updateCombination,
  updateSeatingSettings,
  updateTable,
  updateZone,
} from '../../../core/services/seatingAdminService';
import {
  normalizeFloorplanDimensions,
  normalizeTableGeometry,
} from '../../../core/utils/seatingNormalize';

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

const SeatingSettingsModal: React.FC<SeatingSettingsModalProps> = ({ unitId, onClose }) => {
  const [settings, setSettings] = useState<SeatingSettings | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [combos, setCombos] = useState<TableCombination[]>([]);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
  const isDev = process.env.NODE_ENV !== 'production';
  const debugSeating =
    isDev ||
    (typeof window !== 'undefined' &&
      window.localStorage.getItem('mintleaf_debug_seating') === '1');
  const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const [probeSummary, setProbeSummary] = useState<string | null>(null);
  const [probeRunning, setProbeRunning] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const [draftRotations, setDraftRotations] = useState<Record<string, number>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [lastSavedById, setLastSavedById] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const lastSavedByIdRef = useRef<Record<string, { x: number; y: number }>>({});
  const [lastSavedRotById, setLastSavedRotById] = useState<Record<string, number>>({});
  const lastSavedRotByIdRef = useRef<Record<string, number>>({});
  const [dragState, setDragState] = useState<{
    tableId: string;
    pointerId: number;
    pointerTarget: HTMLElement | null;
    pointerStartX: number;
    pointerStartY: number;
    tableStartX: number;
    tableStartY: number;
    width: number;
    height: number;
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
  const dragStateRef = useRef<typeof dragState>(null);
  const rafPosId = useRef<number | null>(null);
  const rafRotId = useRef<number | null>(null);
  const [undoTick, setUndoTick] = useState(0);
  const floorplanRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);


  useEffect(() => {
    if (!isDev) return;
    if (floorplans.length === 0 && tables.length === 0) return;
    const normalizedFloorplans = floorplans.map(plan => ({
      id: plan.id,
      ...normalizeFloorplanDimensions(plan),
    }));
    const normalizedTables = tables.slice(0, 3).map(table => ({
      id: table.id,
      ...normalizeTableGeometry(table, {
        rectWidth: 80,
        rectHeight: 60,
        circleRadius: 40,
      }),
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
        setSettings(settingsData);
        setZones(zonesData);
        setTables(tablesData);
        setCombos(combosData);
        setFloorplans(floorplansData);
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

  const emergencyZoneOptions = useMemo(
    () => zones.filter(zone => zone.isActive && zone.isEmergency),
    [zones]
  );
  const activeZones = useMemo(() => zones.filter(zone => zone.isActive), [zones]);
  const activeZoneIds = useMemo(
    () => new Set(activeZones.map(zone => zone.id)),
    [activeZones]
  );

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
  const { width: floorplanWidth, height: floorplanHeight } =
    normalizeFloorplanDimensions(activeFloorplan);
  const editorGridSize =
    (activeFloorplan?.gridSize && activeFloorplan.gridSize > 0
      ? activeFloorplan.gridSize
      : floorplanForm.gridSize) || 20;
  const editorTables = useMemo(() => {
    if (!activeFloorplan) return [] as Table[];
    return tables.filter(
      table => !table.floorplanId || table.floorplanId === activeFloorplan.id
    );
  }, [activeFloorplan, tables]);
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);
  const applyGrid = (value: number, gridSize: number) =>
    gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
  const normalizeRotation = (value: number) => {
    const wrapped = ((value % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
  };
  const snapRotation = (value: number, step = 5) => Math.round(value / step) * step;

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
      setDraftPositions({});
      setDraftRotations({});
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
    };
  }, []);

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
    if (!settings) return;
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
      successMessage: 'Beállítások mentve.',
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
      },
    });
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
          await updateFloorplan(unitId, floorplanForm.id, payload);
        } else {
          await createFloorplan(unitId, payload);
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

  const getRenderPosition = (table: Table, geometry: ReturnType<typeof normalizeTableGeometry>) => {
    const draft = draftPositions[table.id];
    const baseX = draft?.x ?? geometry.x;
    const baseY = draft?.y ?? geometry.y;
    const maxX = Math.max(0, floorplanWidth - geometry.w);
    const maxY = Math.max(0, floorplanHeight - geometry.h);
    return {
      x: clamp(baseX, 0, maxX),
      y: clamp(baseY, 0, maxY),
    };
  };

  const updateDraftPosition = (tableId: string, x: number, y: number) => {
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
  };

  const updateDraftRotation = (tableId: string, rot: number) => {
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
  };

  const getLocalPointerPosition = (event: React.PointerEvent<HTMLElement>) => {
    const rect = floorplanRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: event.clientX, y: event.clientY };
    }
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

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

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: Table,
    geometry: ReturnType<typeof normalizeTableGeometry>
  ) => {
    if (!activeFloorplan) return;
    if (table.locked) return;
    event.preventDefault();
    setSelectedTableId(table.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const position = getRenderPosition(table, geometry);
    const renderRot = draftRotations[table.id] ?? geometry.rot;
    const mode = event.shiftKey ? 'rotate' : 'move';
    const centerX = position.x + geometry.w / 2;
    const centerY = position.y + geometry.h / 2;
    const pointer = getLocalPointerPosition(event);
    const startAngle = Math.atan2(pointer.y - centerY, pointer.x - centerX) * (180 / Math.PI);
    setDragState({
      tableId: table.id,
      pointerId: event.pointerId,
      pointerTarget: event.currentTarget,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      tableStartX: position.x,
      tableStartY: position.y,
      width: geometry.w,
      height: geometry.h,
      mode,
      tableStartRot: renderRot,
      rotStartAngleDeg: startAngle,
      rotCenterX: centerX,
      rotCenterY: centerY,
      floorplanWidth,
      floorplanHeight,
      gridSize: editorGridSize,
      snapToGrid: table.snapToGrid ?? false,
    });
    setLastSaved(current =>
      current[table.id] ? current : { ...current, [table.id]: position }
    );
    setLastSavedRot(current =>
      current[table.id] !== undefined ? current : { ...current, [table.id]: renderRot }
    );
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    if (event.pointerId !== dragState.pointerId) return;
    if (!floorplanRef.current) {
      abortDragRef.current(dragState);
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - dragState.pointerStartX;
    const deltaY = event.clientY - dragState.pointerStartY;
    if (dragState.mode === 'rotate') {
      const pointer = getLocalPointerPosition(event);
      const currentAngle =
        Math.atan2(pointer.y - dragState.rotCenterY, pointer.x - dragState.rotCenterX) *
        (180 / Math.PI);
      const deltaAngle = normalizeRotation(currentAngle - dragState.rotStartAngleDeg);
      const nextRot = normalizeRotation(dragState.tableStartRot + deltaAngle);
      const step = event.altKey ? 1 : event.shiftKey ? 15 : 5;
      updateDraftRotation(dragState.tableId, snapRotation(nextRot, step));
      return;
    }
    let nextX = dragState.tableStartX + deltaX;
    let nextY = dragState.tableStartY + deltaY;
    if (dragState.snapToGrid) {
      nextX = applyGrid(nextX, dragState.gridSize);
      nextY = applyGrid(nextY, dragState.gridSize);
    }
    const maxX = Math.max(0, dragState.floorplanWidth - dragState.width);
    const maxY = Math.max(0, dragState.floorplanHeight - dragState.height);
    nextX = clamp(nextX, 0, maxX);
    nextY = clamp(nextY, 0, maxY);
    updateDraftPosition(dragState.tableId, nextX, nextY);
  };

  const handleTablePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    if (!floorplanRef.current) {
      abortDragRef.current(drag);
      return;
    }
    event.preventDefault();
    const tableId = drag.tableId;
    if (drag.mode === 'rotate') {
      const pointer = getLocalPointerPosition(event);
      const currentAngle =
        Math.atan2(pointer.y - drag.rotCenterY, pointer.x - drag.rotCenterX) *
        (180 / Math.PI);
      const deltaAngle = normalizeRotation(currentAngle - drag.rotStartAngleDeg);
      const nextRot = normalizeRotation(drag.tableStartRot + deltaAngle);
      const step = event.altKey ? 1 : event.shiftKey ? 15 : 5;
      const snappedRot = snapRotation(nextRot, step);
      updateDraftRotation(tableId, snappedRot);
      const prevRot = drag.tableStartRot;
      releaseDragPointerCaptureRef.current(drag);
      setDragState(null);
      void finalizeRotation(tableId, snappedRot, prevRot);
      return;
    }
    const deltaX = event.clientX - drag.pointerStartX;
    const deltaY = event.clientY - drag.pointerStartY;
    let nextX = drag.tableStartX + deltaX;
    let nextY = drag.tableStartY + deltaY;
    if (drag.snapToGrid) {
      nextX = applyGrid(nextX, drag.gridSize);
      nextY = applyGrid(nextY, drag.gridSize);
    }
    const maxX = Math.max(0, drag.floorplanWidth - drag.width);
    const maxY = Math.max(0, drag.floorplanHeight - drag.height);
    nextX = clamp(nextX, 0, maxX);
    nextY = clamp(nextY, 0, maxY);
    updateDraftPosition(tableId, nextX, nextY);
    releaseDragPointerCaptureRef.current(drag);
    setDragState(null);
    void finalizeDrag(tableId, nextX, nextY);
  };

  const handleTablePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragState;
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    abortDragRef.current(drag);
  };

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

  const handleClose = useCallback(() => {
    const drag = dragStateRef.current;
    if (drag) {
      abortDragRef.current(drag);
    }
    setSelectedTableId(null);
    setDraftPositions({});
    setDraftRotations({});
    setSavingById({});
    actionSavingRef.current = {};
    setActionSaving({});
    onClose();
  }, [onClose]);

  const tabs = [
    { id: 'overview', label: 'Áttekintés' },
    { id: 'zones', label: 'Zónák' },
    { id: 'tables', label: 'Asztalok' },
    { id: 'combinations', label: 'Kombók' },
    { id: 'floorplans', label: 'Asztaltérkép' },
  ] as const;

  const renderOverviewPanel = () => (
    <div className="space-y-6">
      <section className="space-y-3 border rounded-lg p-4">
        <h3 className="font-semibold">Alap beállítások</h3>
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
            Seating allocation enabled
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
                      const geometry = normalizeTableGeometry(table, {
                        rectWidth: 80,
                        rectHeight: 60,
                        circleRadius: 40,
                      });
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
            const { width, height } = normalizeFloorplanDimensions(plan);
            const isActivating = actionSaving[`floorplan-activate-${plan.id}`];
            const isDeleting = actionSaving[`floorplan-delete-${plan.id}`];
            return (
              <div key={plan.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  {plan.name} ({width}×{height})
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <span>
                Grid: {editorGridSize}px • Húzd a pöttyöt = forgatás • Shift = 15° • Alt = 1°
              </span>
              <button
                type="button"
                className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600 disabled:opacity-50"
                onClick={() => void handleUndoLastAction()}
                disabled={!isUndoAvailable}
              >
                Visszavonás
              </button>
            </div>
            <div className="overflow-auto">
              <div
                ref={floorplanRef}
                className="relative border border-gray-200 rounded-lg"
                style={{ width: floorplanWidth, height: floorplanHeight }}
              >
                {activeFloorplan.backgroundImageUrl && (
                  <img
                    src={activeFloorplan.backgroundImageUrl}
                    alt={activeFloorplan.name}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                {editorTables.map(table => {
                  const geometry = normalizeTableGeometry(table, {
                    rectWidth: 80,
                    rectHeight: 60,
                    circleRadius: 40,
                  });
                  const position = getRenderPosition(table, geometry);
                  const renderRot = draftRotations[table.id] ?? geometry.rot;
                  const isSelected = selectedTableId === table.id;
                  const isSaving = Boolean(savingById[table.id]);
                  return (
                    <div
                      key={table.id}
                      className="absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 cursor-grab active:cursor-grabbing select-none relative"
                      style={{
                        left: position.x,
                        top: position.y,
                        width: geometry.w,
                        height: geometry.h,
                        borderRadius: geometry.shape === 'circle' ? geometry.radius : 8,
                        border: isSelected ? '2px solid #2563eb' : '1px solid #9ca3af',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        transform: `rotate(${renderRot}deg)`,
                        boxShadow: isSelected
                          ? '0 0 0 3px rgba(59, 130, 246, 0.35)'
                          : '0 1px 3px rgba(0,0,0,0.1)',
                        touchAction: 'none',
                      }}
                      onClick={() => setSelectedTableId(table.id)}
                      onPointerDown={event => handleTablePointerDown(event, table, geometry)}
                      onPointerMove={handleTablePointerMove}
                      onPointerUp={handleTablePointerUp}
                      onPointerCancel={handleTablePointerCancel}
                      onLostPointerCapture={handleLostPointerCapture}
                    >
                      {isSelected && !table.locked && (
                        <>
                          <span
                            className="absolute left-1/2 -top-3 h-3 w-px -translate-x-1/2 bg-gray-300"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            className="absolute left-1/2 -top-6 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm"
                            style={{ touchAction: 'none' }}
                            onPointerDown={event => {
                              if (!activeFloorplan) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedTableId(table.id);
                              event.currentTarget.setPointerCapture?.(event.pointerId);
                              const centerX = position.x + geometry.w / 2;
                              const centerY = position.y + geometry.h / 2;
                              const pointer = getLocalPointerPosition(event);
                              const startAngle =
                                Math.atan2(pointer.y - centerY, pointer.x - centerX) *
                                (180 / Math.PI);
                              setDragState({
                                tableId: table.id,
                                pointerId: event.pointerId,
                                pointerTarget: event.currentTarget,
                                pointerStartX: event.clientX,
                                pointerStartY: event.clientY,
                                tableStartX: position.x,
                                tableStartY: position.y,
                                width: geometry.w,
                                height: geometry.h,
                                mode: 'rotate',
                                tableStartRot: renderRot,
                                rotStartAngleDeg: startAngle,
                                rotCenterX: centerX,
                                rotCenterY: centerY,
                                floorplanWidth,
                                floorplanHeight,
                                gridSize: editorGridSize,
                                snapToGrid: table.snapToGrid ?? false,
                              });
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
                      {table.name}
                      <div className="flex gap-1 mt-1">
                        {table.locked && (
                          <span className="px-1 rounded bg-gray-200 text-[9px]">🔒</span>
                        )}
                        {table.canCombine && (
                          <span className="px-1 rounded bg-amber-200 text-[9px]">COMB</span>
                        )}
                        {isSaving && (
                          <span className="px-1 rounded bg-blue-100 text-[9px]">Saving...</span>
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
                            className="px-1 rounded bg-gray-100 text-[9px]"
                            onPointerDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              const nextRot = normalizeRotation(renderRot - 5);
                              updateDraftRotation(table.id, nextRot);
                              setLastSavedRot(current => ({
                                ...current,
                                [table.id]:
                                  current[table.id] !== undefined ? current[table.id] : renderRot,
                              }));
                              void finalizeRotation(table.id, nextRot, renderRot);
                            }}
                          >
                            ↺
                          </button>
                          <button
                            type="button"
                            className="px-1 rounded bg-gray-100 text-[9px]"
                            onPointerDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              const nextRot = normalizeRotation(renderRot + 5);
                              updateDraftRotation(table.id, nextRot);
                              setLastSavedRot(current => ({
                                ...current,
                                [table.id]:
                                  current[table.id] !== undefined ? current[table.id] : renderRot,
                              }));
                              void finalizeRotation(table.id, nextRot, renderRot);
                            }}
                          >
                            ↻
                          </button>
                          <button
                            type="button"
                            className="px-1 rounded bg-gray-100 text-[9px]"
                            onPointerDown={event => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              updateDraftRotation(table.id, 0);
                              setLastSavedRot(current => ({
                                ...current,
                                [table.id]:
                                  current[table.id] !== undefined ? current[table.id] : renderRot,
                              }));
                              void finalizeRotation(table.id, 0, renderRot);
                            }}
                          >
                            Reset
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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

  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
        onClick={handleClose}
      >
        <div
          className="rounded-2xl shadow-xl w-full max-w-3xl p-6 bg-white"
          onClick={event => event.stopPropagation()}
        >
          Betöltés...
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={handleClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-6 space-y-6"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Ültetés beállítások</h2>
          <button onClick={handleClose} className="text-sm text-gray-500">
            Bezárás
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {success && <div className="text-sm text-green-600">{success}</div>}
        <div
          role="tablist"
          aria-label="Ültetés beállítások fülek"
          className="flex flex-wrap gap-2 border-b pb-2"
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              id={`seating-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`seating-tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabsKeyDown}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="pt-4 pb-24">
          {activeTab === 'overview' && (
            <div
              role="tabpanel"
              id="seating-tabpanel-overview"
              aria-labelledby="seating-tab-overview"
              tabIndex={0}
            >
              {renderOverviewPanel()}
            </div>
          )}
          {activeTab === 'zones' && (
            <div
              role="tabpanel"
              id="seating-tabpanel-zones"
              aria-labelledby="seating-tab-zones"
              tabIndex={0}
            >
              {renderZonesPanel()}
            </div>
          )}
          {activeTab === 'tables' && (
            <div
              role="tabpanel"
              id="seating-tabpanel-tables"
              aria-labelledby="seating-tab-tables"
              tabIndex={0}
            >
              {renderTablesPanel()}
            </div>
          )}
          {activeTab === 'combinations' && (
            <div
              role="tabpanel"
              id="seating-tabpanel-combinations"
              aria-labelledby="seating-tab-combinations"
              tabIndex={0}
            >
              {renderCombinationsPanel()}
            </div>
          )}
          {activeTab === 'floorplans' && (
            <div
              role="tabpanel"
              id="seating-tabpanel-floorplans"
              aria-labelledby="seating-tab-floorplans"
              tabIndex={0}
            >
              {renderFloorplansPanel()}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white pt-4 pb-2 border-t flex justify-end">
          <button
            type="button"
            onClick={event => handleActionButtonClick(event, handleSettingsSave)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
            disabled={actionSaving['settings-save']}
          >
            {actionSaving['settings-save'] ? 'Mentés...' : 'Mentés'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SeatingSettingsModal;
