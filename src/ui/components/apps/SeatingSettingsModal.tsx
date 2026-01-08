import React, { useEffect, useMemo, useState } from 'react';
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
    let isMounted = true;
    const loadData = async () => {
      try {
        try {
          await ensureDefaultFloorplan(unitId);
        } catch (err) {
          console.error('Error ensuring default floorplan:', err);
        }
        const [settingsData, zonesData, tablesData, combosData, floorplansData] = await Promise.all([
          getSeatingSettings(unitId),
          listZones(unitId),
          listTables(unitId),
          listCombinations(unitId),
          listFloorplans(unitId),
        ]);
        if (!isMounted) return;
        setSettings(settingsData);
        setZones(zonesData);
        setTables(tablesData);
        setCombos(combosData);
        setFloorplans(floorplansData);
      } catch (err) {
        console.error('Error loading seating settings:', err);
        if (isMounted) {
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

  const fallbackActiveFloorplanId = settings?.activeFloorplanId
    ? floorplans.find(plan => plan.id === settings.activeFloorplanId)?.id
    : floorplans.find(plan => plan.isActive)?.id;
  const activeFloorplanId = settings?.activeFloorplanId ?? fallbackActiveFloorplanId ?? '';

  const handleSettingsSave = async () => {
    if (!settings) return;
    setError(null);
    setSuccess(null);
    const emergencyZoneIds =
      settings.emergencyZones?.zoneIds?.filter(zoneId =>
        emergencyZoneOptions.some(zone => zone.id === zoneId)
      ) ?? [];
    try {
      await updateSeatingSettings(unitId, {
        ...settings,
        activeFloorplanId: settings.activeFloorplanId ?? activeFloorplanId,
        emergencyZones: {
          enabled: settings.emergencyZones?.enabled ?? false,
          zoneIds: emergencyZoneIds,
          activeRule: settings.emergencyZones?.activeRule ?? 'always',
          weekdays: settings.emergencyZones?.weekdays ?? [],
        },
      });
      setSuccess('Beállítások mentve.');
    } catch (err) {
      console.error('Error saving seating settings:', err);
      setError('Nem sikerült menteni a beállításokat.');
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
      const payload = {
        name: floorplanForm.name.trim(),
        width: floorplanForm.width,
        height: floorplanForm.height,
        gridSize: floorplanForm.gridSize,
        backgroundImageUrl: floorplanForm.backgroundImageUrl || undefined,
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
    if (tableForm.floorplanId || !activeFloorplanId) {
      return;
    }
    setTableForm(current => ({ ...current, floorplanId: activeFloorplanId }));
  }, [activeFloorplanId, tableForm.floorplanId]);

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
      const payload = {
        name: tableForm.name.trim(),
        zoneId: tableForm.zoneId,
        minCapacity: tableForm.minCapacity,
        capacityMax: tableForm.capacityMax,
        isActive: tableForm.isActive,
        canSeatSolo: tableForm.canSeatSolo,
        floorplanId: tableForm.floorplanId || undefined,
        shape: tableForm.shape,
        w: tableForm.shape === 'rect' ? tableForm.w : undefined,
        h: tableForm.shape === 'rect' ? tableForm.h : undefined,
        radius: tableForm.shape === 'circle' ? tableForm.radius : undefined,
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
        snapToGrid: true,
        locked: false,
      });
      setSuccess('Asztal mentve.');
    } catch (err) {
      console.error('Error saving table:', err);
      setError('Nem sikerült menteni az asztalt.');
    }
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
            {floorplans.map(plan => (
              <div key={plan.id} className="flex items-center justify-between border rounded p-2">
                <div>
                  {plan.name} ({plan.width}×{plan.height})
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleActivateFloorplan(plan.id)}
                    className="text-blue-600"
                  >
                    {activeFloorplanId === plan.id ? 'Aktív' : 'Aktivál'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteFloorplan(unitId, plan.id);
                      const nextFloorplans = await listFloorplans(unitId);
                      let nextActiveId = activeFloorplanId;
                      if (activeFloorplanId === plan.id) {
                        nextActiveId = nextFloorplans[0]?.id ?? '';
                        await updateSeatingSettings(unitId, { activeFloorplanId: nextActiveId });
                        setSettings(current => ({
                          ...(current ?? {}),
                          activeFloorplanId: nextActiveId,
                        }));
                      }
                      setFloorplans(nextFloorplans);
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
                value={settings?.activeFloorplanId ?? activeFloorplanId}
                onChange={event =>
                  setSettings(current => ({
                    ...(current ?? {}),
                    activeFloorplanId: event.target.value,
                  }))
                }
              >
                <option value="">Nincs kiválasztva</option>
                {floorplans.map(plan => (
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
                {floorplans.map(plan => (
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
                      setTableForm({
                        id: table.id,
                        name: table.name,
                        zoneId: table.zoneId,
                        minCapacity: table.minCapacity,
                        capacityMax: table.capacityMax,
                        isActive: table.isActive,
                        canSeatSolo: table.canSeatSolo ?? false,
                        floorplanId: table.floorplanId ?? activeFloorplanId,
                        shape: table.shape ?? 'rect',
                        w: table.w ?? 80,
                        h: table.h ?? 60,
                        radius: table.radius ?? 40,
                        snapToGrid: table.snapToGrid ?? true,
                        locked: table.locked ?? false,
                      })
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
