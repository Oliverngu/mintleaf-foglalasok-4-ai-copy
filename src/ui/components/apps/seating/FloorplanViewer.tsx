import React, { useEffect, useMemo, useState } from 'react';
import { Floorplan, Table, Zone } from '../../../../core/models/data';
import { getSeatingSettings, listFloorplans } from '../../../../core/services/seatingAdminService';
import { listTables, listZones } from '../../../../core/services/seatingService';

const ZONE_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0f766e', '#ca8a04'];

type FloorplanViewerProps = {
  unitId: string;
  floorplanId?: string;
  highlightTableIds?: string[];
  highlightZoneId?: string | null;
};

const getTableDimensions = (table: Table) => {
  if (table.shape === 'circle') {
    const radius = table.radius && table.radius > 0 ? table.radius : 28;
    return { width: radius * 2, height: radius * 2, radius };
  }
  const width = table.w && table.w > 0 ? table.w : 80;
  const height = table.h && table.h > 0 ? table.h : 50;
  return { width, height, radius: 0 };
};

const FloorplanViewer: React.FC<FloorplanViewerProps> = ({
  unitId,
  floorplanId,
  highlightTableIds,
  highlightZoneId,
}) => {
  const [floorplan, setFloorplan] = useState<Floorplan | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitId) {
      setFloorplan(null);
      setTables([]);
      setZones([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settings, floorplansData, zonesData, tablesData] = await Promise.all([
          getSeatingSettings(unitId, { createIfMissing: false }),
          listFloorplans(unitId),
          listZones(unitId),
          listTables(unitId),
        ]);

        if (!isMounted) return;

        const targetFloorplanId = floorplanId ?? settings.activeFloorplanId;
        const resolvedFloorplan =
          floorplansData.find(plan => plan.id === targetFloorplanId) ??
          floorplansData.find(plan => plan.isActive) ??
          null;

        setFloorplan(resolvedFloorplan);
        setZones(zonesData);
        setTables(tablesData);
      } catch (err) {
        console.error('Error loading floorplan viewer data:', err);
        if (isMounted) {
          setError('Nem sikerült betölteni az asztaltérképet.');
          setFloorplan(null);
          setZones([]);
          setTables([]);
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
  }, [floorplanId, unitId]);

  const zoneColors = useMemo(() => {
    const colors = new Map<string, string>();
    zones.forEach((zone, index) => {
      colors.set(zone.id, ZONE_COLORS[index % ZONE_COLORS.length]);
    });
    return colors;
  }, [zones]);

  const highlightedTableIds = useMemo(() => new Set(highlightTableIds ?? []), [highlightTableIds]);
  const zoneHighlightTableIds = useMemo(() => {
    if (!highlightZoneId) return new Set<string>();
    return new Set(tables.filter(table => table.zoneId === highlightZoneId).map(table => table.id));
  }, [highlightZoneId, tables]);

  const visibleTables = useMemo(() => {
    if (!floorplan) return [] as Table[];
    return tables.filter(table => !table.floorplanId || table.floorplanId === floorplan.id);
  }, [floorplan, tables]);

  if (loading) {
    return <div className="text-xs text-[var(--color-text-secondary)]">Betöltés...</div>;
  }

  if (error) {
    return <div className="text-xs text-red-600">{error}</div>;
  }

  if (!floorplan) {
    return (
      <div className="text-xs text-[var(--color-text-secondary)]">
        Nincs aktív asztaltérkép beállítva.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px] text-[var(--color-text-secondary)]">
        {zones.map(zone => (
          <div key={zone.id} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: zoneColors.get(zone.id) }}
            />
            <span>{zone.name}</span>
          </div>
        ))}
      </div>
      <div className="overflow-auto">
        <div
          className="relative border border-gray-200 rounded-lg"
          style={{ width: floorplan.width, height: floorplan.height }}
        >
          {floorplan.backgroundImageUrl && (
            <img
              src={floorplan.backgroundImageUrl}
              alt={floorplan.name}
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}
          {visibleTables.map(table => {
            const { width, height, radius } = getTableDimensions(table);
            const isStrongHighlight = highlightedTableIds.has(table.id);
            const isZoneHighlight = zoneHighlightTableIds.has(table.id);
            const baseColor = zoneColors.get(table.zoneId) ?? '#6b7280';

            return (
              <div
                key={table.id}
                className="absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800"
                style={{
                  left: table.x ?? 0,
                  top: table.y ?? 0,
                  width,
                  height,
                  borderRadius: table.shape === 'circle' ? radius : 8,
                  border: `2px solid ${baseColor}`,
                  backgroundColor: isZoneHighlight ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.9)',
                  transform: `rotate(${table.rot ?? 0}deg)`,
                  boxShadow: isStrongHighlight
                    ? '0 0 0 3px rgba(59, 130, 246, 0.7)'
                    : '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <span>{table.name}</span>
                <div className="flex gap-1 mt-1">
                  {table.locked && (
                    <span className="px-1 rounded bg-gray-200 text-[9px]">🔒</span>
                  )}
                  {table.canCombine && (
                    <span className="px-1 rounded bg-amber-200 text-[9px]">COMB</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FloorplanViewer;
