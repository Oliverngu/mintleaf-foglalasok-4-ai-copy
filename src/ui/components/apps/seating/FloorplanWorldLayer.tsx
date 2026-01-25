import React from 'react';
import { FloorplanObstacle, Table } from '../../../../core/models/data';
import {
  resolveTableGeometryInFloorplanSpace,
  resolveTableRenderPosition,
} from '../../../../core/utils/seatingFloorplanRender';

type TableGeometryDefaults = {
  rectWidth: number;
  rectHeight: number;
  circleRadius: number;
};

type TableStatus = 'occupied' | 'upcoming' | 'free';

type TableAppearance = {
  getStatus?: (table: Table) => TableStatus;
  renderStatusColor?: (status: TableStatus) => string;
  isSelected?: (table: Table) => boolean;
  isRecommended?: (table: Table) => boolean;
  hasConflict?: (table: Table) => boolean;
  showCapacity?: boolean;
};

type Props = {
  tables: Table[];
  obstacles: FloorplanObstacle[];
  floorplanDims: { width: number; height: number };
  tableDefaults: TableGeometryDefaults;
  appearance?: TableAppearance;
};

const defaultRenderStatusColor = (status: TableStatus) => {
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

const FloorplanWorldLayer: React.FC<Props> = ({
  tables,
  obstacles,
  floorplanDims,
  tableDefaults,
  appearance,
}) => {
  const getStatus = appearance?.getStatus ?? (() => 'free');
  const renderStatusColor = appearance?.renderStatusColor ?? defaultRenderStatusColor;
  const isSelected = appearance?.isSelected ?? (() => false);
  const isRecommended = appearance?.isRecommended ?? (() => false);
  const hasConflict = appearance?.hasConflict ?? (() => false);
  const showCapacity = appearance?.showCapacity ?? false;

  return (
    <>
      {/* NO-GO / OBSTACLES */}
      {obstacles.map(obstacle => {
        const rot = obstacle.rot ?? 0;

        return (
          <div
            key={obstacle.id}
            className="absolute border border-dashed border-gray-300 bg-gray-200/40"
            style={{
              left: obstacle.x,
              top: obstacle.y,
              width: obstacle.w,
              height: obstacle.h,
              transform: `translateZ(0) rotate(${rot}deg)`,
              transformOrigin: 'center center',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* TABLES */}
      {tables.map(table => {
        const geometry = resolveTableGeometryInFloorplanSpace(table, floorplanDims, tableDefaults);
        const position = resolveTableRenderPosition(geometry, floorplanDims);

        const status = getStatus(table);
        const selected = isSelected(table);
        const recommended = isRecommended(table);
        const conflict = hasConflict(table);

        // z-index policy (deterministic)
        const zIndex = selected ? 10 : conflict ? 6 : recommended ? 5 : 2;

        const radius =
          geometry.shape === 'circle'
            ? '9999px'
            : 10; // slightly softer corners than 8 to match the modern editor feel

        const outline = recommended ? '2px dashed rgba(251, 191, 36, 0.95)' : undefined;

        return (
          <div
            key={table.id}
            className={`absolute flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800 pointer-events-none`}
            style={{
              left: position.x,
              top: position.y,
              width: geometry.w,
              height: geometry.h,
              borderRadius: radius,
              border: '2px solid rgba(148, 163, 184, 0.60)',
              backgroundColor: renderStatusColor(status),
              transform: `translateZ(0) rotate(${geometry.rot}deg)`,
              transformOrigin: 'center center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              outline,
              outlineOffset: recommended ? 2 : undefined,
              zIndex,
            }}
          >
            <span className="leading-none">{table.name}</span>

            {showCapacity && typeof table.capacityMax === 'number' && table.capacityMax > 0 ? (
              <span className="mt-0.5 text-[9px] font-medium text-gray-500 leading-none">
                max {table.capacityMax}
              </span>
            ) : null}

            {conflict ? (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white text-[8px] text-white flex items-center justify-center">
                !
              </span>
            ) : null}

            {selected ? (
              <span
                className="absolute inset-0 rounded-[inherit]"
                style={{
                  boxShadow: '0 0 0 2px var(--color-primary)',
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
};

export default FloorplanWorldLayer;
