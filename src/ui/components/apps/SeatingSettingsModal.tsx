import { FirebaseError } from 'firebase/app';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '../../../core/firebase/config';
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

  const isPermissionDenied = (err: unknown): err is FirebaseError => {
    const code = (err as { code?: string } | null)?.code;
    const name = (err as { name?: string } | null)?.name;
    return name === 'FirebaseError' && code === 'permission-denied';
  };

  const isAbortError = (err: unknown) => (err as { name?: string } | null)?.name === 'AbortError';
  const normalizeOptionalString = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const isDev = process.env.NODE_ENV !== 'production';
  const [probeSummary, setProbeSummary] = useState<string | null>(null);
  const [probeRunning, setProbeRunning] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});
  const [lastSavedById, setLastSavedById] = useState<Record<string, { x: number; y: number }>>(
    {}
  );
  const lastSavedByIdRef = useRef<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = useState<{
    tableId: string;
    pointerStartX: number;
    pointerStartY: number;
    tableStartX: number;
    tableStartY: number;
    width: number;
    height: number;
    floorplanWidth: number;
    floorplanHeight: number;
    gridSize: number;
    snapToGrid: boolean;
  } | null>(null);
  const rafId = useRef<number | null>(null);
  const prevActiveFloorplanIdRef = useRef<string | null>(null);

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
        setProbeSummary(summary.join(' | '));
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
  }, [unitId]);

  const emergencyZoneOptions = useMemo(
    () => zones.filter(zone => zone.isActive && zone.isEmergency),
    [zones]
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
      setSelectedTableId(null);
      setDraftPositions({});
      setSavingById({});
      setLastSaved({});
      lastSavedByIdRef.current = {};
      setDragState(null);
    }
    prevActiveFloorplanIdRef.current = next;
  }, [activeFloorplan?.id]);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  const handleSettingsSave = async () => {
    if (!settings) return;
    setError(null);
    setSuccess(null);
    const emergencyZoneIds =
      settings.emergencyZones?.zoneIds?.filter(zoneId =>
        emergencyZoneOptions.some(zone => zone.id === zoneId)
      ) ?? [];
    try {
      const { activeFloorplanId, ...restSettings } = settings;
      const payload: SeatingSettings = {
        ...restSettings,
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
      setSuccess('Beállítások mentve.');
    } catch (err) {
      console.error('Error saving seating settings:', err);
      setError('Nem sikerült menteni a beállításokat.');
    }
  };

  const runSeatingSmokeTest = async () => {
    if (!isDev) {
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
      setProbeSummary(summary.join(' | '));
    } finally {
      setProbeRunning(false);
    }
  };

  const handleFloorplanSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!floorplanForm.name.trim()) {
      setError('Az alaprajz neve kötelező.');
      return;
    }
    if (floorplanForm.width < 1 || floorplanForm.height < 1) {
      setError('A méreteknek legalább 1-nek kell lenniük.');
      return;
    }
    try {
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
      setSuccess('Alaprajz mentve.');
    } catch (err) {
      console.error('Error saving floorplan:', err);
      setError('Nem sikerült menteni az alaprajzot.');
    }
  };

  const handleActivateFloorplan = async (floorplanId: string) => {
    setError(null);
    setSuccess(null);
    try {
      if (floorplanId === resolvedActiveFloorplanId) {
        return;
      }
      await updateSeatingSettings(unitId, { activeFloorplanId: floorplanId });
      const nextFloorplans = await listFloorplans(unitId);
      setFloorplans(nextFloorplans);
      setSettings(current => ({
        ...(current ?? {}),
        activeFloorplanId: floorplanId,
      }));
      setSuccess('Alaprajz aktiválva.');
    } catch (err) {
      console.error('Error activating floorplan:', err);
      setError('Nem sikerült aktiválni az alaprajzot.');
    }
  };

  useEffect(() => {
    if (tableForm.floorplanId || !resolvedActiveFloorplanId) {
      return;
    }
    setTableForm(current => ({ ...current, floorplanId: resolvedActiveFloorplanId }));
  }, [resolvedActiveFloorplanId, tableForm.floorplanId]);

  const handleZoneSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!zoneForm.name.trim()) {
      setError('A zóna neve kötelező.');
      return;
    }
    try {
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
      setSuccess('Zóna mentve.');
    } catch (err) {
      console.error('Error saving zone:', err);
      setError('Nem sikerült menteni a zónát.');
    }
  };

  const handleTableSubmit = async () => {
    setError(null);
    setSuccess(null);
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
    try {
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
        floorplanId: activeFloorplanId,
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
      setSuccess('Asztal mentve.');
    } catch (err) {
      console.error('Error saving table:', err);
      setError('Nem sikerült menteni az asztalt.');
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
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
    }
    rafId.current = requestAnimationFrame(() => {
      setDraftPositions(current => ({
        ...current,
        [tableId]: { x, y },
      }));
      rafId.current = null;
    });
  };

  const finalizeDrag = async (tableId: string, x: number, y: number) => {
    setSavingById(current => ({ ...current, [tableId]: true }));
    try {
      await updateTable(unitId, tableId, { x, y });
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

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: Table,
    geometry: ReturnType<typeof normalizeTableGeometry>
  ) => {
    if (!activeFloorplan) return;
    event.preventDefault();
    setSelectedTableId(table.id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const position = getRenderPosition(table, geometry);
    setDragState({
      tableId: table.id,
      pointerStartX: event.clientX,
      pointerStartY: event.clientY,
      tableStartX: position.x,
      tableStartY: position.y,
      width: geometry.w,
      height: geometry.h,
      floorplanWidth,
      floorplanHeight,
      gridSize: editorGridSize,
      snapToGrid: table.snapToGrid ?? false,
    });
    setLastSaved(current =>
      current[table.id] ? current : { ...current, [table.id]: position }
    );
  };

  const handleTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.pointerStartX;
    const deltaY = event.clientY - dragState.pointerStartY;
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
    if (!dragState) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.pointerStartX;
    const deltaY = event.clientY - dragState.pointerStartY;
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
    const tableId = dragState.tableId;
    setDragState(null);
    void finalizeDrag(tableId, nextX, nextY);
  };

  const handleTablePointerCancel = () => {
    if (!dragState) return;
    const tableId = dragState.tableId;
    const fallback = lastSavedByIdRef.current[tableId];
    if (fallback) {
      setDraftPositions(current => ({ ...current, [tableId]: fallback }));
    }
    setDragState(null);
  };

  const handleComboSubmit = async () => {
    setError(null);
    setSuccess(null);
    const uniqueSelection = Array.from(new Set(comboSelection));
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
    try {
      await createCombination(unitId, {
        tableIds: uniqueSelection,
        isActive: true,
      });
      setCombos(await listCombinations(unitId));
      setComboSelection([]);
      setSuccess('Kombináció mentve.');
    } catch (err) {
      console.error('Error saving combination:', err);
      setError('Nem sikerült menteni a kombinációt.');
    }
  };

  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
        onClick={onClose}
      >
        <div className="rounded-2xl shadow-xl w-full max-w-3xl p-6 bg-white">
          Betöltés...
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-6 space-y-6"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Ültetés beállítások</h2>
          <button onClick={onClose} className="text-sm text-gray-500">
            Bezárás
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {success && <div className="text-sm text-green-600">{success}</div>}
        {isDev && (
          <div className="text-xs text-slate-500 space-y-1">
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
            onClick={handleFloorplanSubmit}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Mentés
          </button>
          <div className="space-y-2 text-sm">
            {visibleFloorplans.map(plan => {
              const { width, height } = normalizeFloorplanDimensions(plan);
              return (
                <div key={plan.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    {plan.name} ({width}×{height})
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleActivateFloorplan(plan.id)}
                      className="text-blue-600"
                    >
                      {resolvedActiveFloorplanId === plan.id ? 'Aktív' : 'Aktivál'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteFloorplan(unitId, plan.id);
                        const nextFloorplans = await listFloorplans(unitId);
                        const nextVisible = nextFloorplans.filter(item => item.isActive !== false);
                        if (resolvedActiveFloorplanId === plan.id) {
                          const nextActiveId = nextVisible[0]?.id ?? '';
                          if (nextActiveId !== resolvedActiveFloorplanId) {
                            await updateSeatingSettings(unitId, {
                              activeFloorplanId: nextActiveId,
                            });
                            setSettings(current => ({
                              ...(current ?? {}),
                              activeFloorplanId: nextActiveId,
                            }));
                          }
                        }
                        setFloorplans(nextFloorplans);
                      }}
                      className="text-red-600"
                    >
                      Törlés
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
              <div className="text-xs text-[var(--color-text-secondary)]">
                Grid: {editorGridSize}px
              </div>
              <div className="overflow-auto">
                <div
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
                    const isSelected = selectedTableId === table.id;
                    const isSaving = Boolean(savingById[table.id]);

                    return (
                      <div
                        key={table.id}
                        className="absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 cursor-grab active:cursor-grabbing select-none"
                        style={{
                          left: position.x,
                          top: position.y,
                          width: geometry.w,
                          height: geometry.h,
                          borderRadius: geometry.shape === 'circle' ? geometry.radius : 8,
                          border: isSelected ? '2px solid #2563eb' : '1px solid #9ca3af',
                          backgroundColor: 'rgba(255,255,255,0.9)',
                          transform: `rotate(${geometry.rot}deg)`,
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
                      >
                        <span>{table.name}</span>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

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
                  setSettings(current => ({
                    ...(current ?? {}),
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
                  setSettings(current => ({
                    ...(current ?? {}),
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
                  setSettings(current => ({
                    ...(current ?? {}),
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
                  setSettings(current => ({
                    ...(current ?? {}),
                    vipEnabled: event.target.checked,
                  }))
                }
              />
              VIP engedélyezve
            </label>
            <label className="flex flex-col gap-1">
              Aktív alaprajz
              <select
                className="border rounded p-2"
                value={settings?.activeFloorplanId ?? resolvedActiveFloorplanId}
                onChange={event =>
                  setSettings(current => ({
                    ...(current ?? {}),
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
          </div>
          <button
            type="button"
            onClick={handleSettingsSave}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Mentés
          </button>
        </section>

        <section className="space-y-3 border rounded-lg p-4">
          <h3 className="font-semibold">Emergency zónák</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings?.emergencyZones?.enabled ?? false}
              onChange={event =>
                setSettings(current => ({
                  ...(current ?? {}),
                  emergencyZones: {
                    ...(current?.emergencyZones ?? {}),
                    enabled: event.target.checked,
                  },
                }))
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
                  const values = Array.from(event.target.selectedOptions).map(option => option.value);
                  setSettings(current => ({
                    ...(current ?? {}),
                    emergencyZones: {
                      ...(current?.emergencyZones ?? {}),
                      zoneIds: values,
                    },
                  }));
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
                  setSettings(current => ({
                    ...(current ?? {}),
                    emergencyZones: {
                      ...(current?.emergencyZones ?? {}),
                      activeRule: event.target.value as 'always' | 'byWeekday',
                    },
                  }))
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
                      checked={settings?.emergencyZones?.weekdays?.includes(day.value) ?? false}
                      onChange={event => {
                        const current = settings?.emergencyZones?.weekdays ?? [];
                        const next = event.target.checked
                          ? [...current, day.value]
                          : current.filter(value => value !== day.value);
                        setSettings(prev => ({
                          ...(prev ?? {}),
                          emergencyZones: {
                            ...(prev?.emergencyZones ?? {}),
                            weekdays: next,
                          },
                        }));
                      }}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

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
            onClick={handleZoneSubmit}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Mentés
          </button>
          <div className="space-y-2 text-sm">
            {zones.map(zone => (
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
                    className="text-blue-600"
                  >
                    Szerkeszt
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteZone(unitId, zone.id);
                      setZones(await listZones(unitId));
                    }}
                    className="text-red-600"
                  >
                    Törlés
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

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
            onClick={handleTableSubmit}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Mentés
          </button>
          <div className="space-y-2 text-sm">
            {tables.map(table => (
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
                    className="text-blue-600"
                  >
                    Szerkeszt
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteTable(unitId, table.id);
                      setTables(await listTables(unitId));
                    }}
                    className="text-red-600"
                  >
                    Törlés
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

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
              onClick={handleComboSubmit}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm"
            >
              Mentés
            </button>
            <div className="space-y-2">
              {combos.map(combo => (
                <div key={combo.id} className="flex items-center justify-between border rounded p-2">
                  <div>
                    {combo.tableIds.join(', ')} {combo.isActive ? '' : '(inaktív)'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await updateCombination(unitId, combo.id, { isActive: !combo.isActive });
                        setCombos(await listCombinations(unitId));
                      }}
                      className="text-blue-600"
                    >
                      {combo.isActive ? 'Kikapcsol' : 'Aktivál'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCombination(unitId, combo.id);
                        setCombos(await listCombinations(unitId));
                      }}
                      className="text-red-600"
                    >
                      Törlés
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SeatingSettingsModal;
