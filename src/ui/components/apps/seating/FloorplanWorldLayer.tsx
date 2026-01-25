// src/ui/components/apps/seating/FloorplanWorldLayer.tsx
import React from 'react';
import { FloorplanObstacle, Table } from '../../../../core/models/data';
import {
  resolveTableGeometryInFloorplanSpace,
  resolveTableRenderPosition,
} from '../../../../core/utils/seatingFloorplanRender';
import {
  computeSeatLayout,
  computeSeatAddControls,
  Seat,
  SeatAddControl,
} from '../../../../core/utils/seatingSeatLayout';

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

type SeatUI = {
  /** Preview: true -> seats shown faintly, no + controls */
  preview?: boolean;
  /** Edit: true -> show + controls and make them clickable */
  editable?: boolean;
  /** called when user clicks a + control */
  onAddSeat?: (tableId: string, side: 'north' | 'east' | 'south' | 'west' | 'radial') => void;
};

type Props = {
  tables: Table[];
  obstacles: FloorplanObstacle[];
  floorplanDims: { width: number; height: number };
  tableDefaults: TableGeometryDefaults;
  appearance?: TableAppearance;
  seatUI?: SeatUI;
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
  seatUI,
}) => {
  const getStatus = appearance?.getStatus ?? (() => 'free');
  const renderStatusColor = appearance?.renderStatusColor ?? defaultRenderStatusColor;
  const isSelected = appearance?.isSelected ?? (() => false);
  const isRecommended = appearance?.isRecommended ?? (() => false);
  const hasConflict = appearance?.hasConflict ?? (() => false);
  const showCapacity = appearance?.showCapacity ?? false;

  const seatPreview = Boolean(seatUI?.preview);
  const seatEditable = Boolean(seatUI?.editable);
  const onAddSeat = seatUI?.onAddSeat;

  return (
    <>
      {/* Obstacles */}
      {obstacles.map(obstacle => (
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

      {/* Tables + Seats */}
      {tables.map(table => {
        const geometry = resolveTableGeometryInFloorplanSpace(table, floorplanDims, tableDefaults);
        const position = resolveTableRenderPosition(geometry, floorplanDims);

        const status = getStatus(table);
        const selected = isSelected(table);
        const recommended = isRecommended(table);
        const conflict = hasConflict(table);

        // IMPORTANT:
        // computeSeatLayout / computeSeatAddControls return TABLE-LOCAL coordinates (origin = table top-left).
        // So we render seats/+ inside a wrapper that has the same left/top/size/rotation as the table.
        const seats: Seat[] = computeSeatLayout({
          table,
          geometry: { x: 0, y: 0, w: geometry.w, h: geometry.h, radius: geometry.radius, rot: geometry.rot },
        });

        const addControls: SeatAddControl[] = seatEditable
          ? computeSeatAddControls({
              table,
              geometry: { x: 0, y: 0, w: geometry.w, h: geometry.h, radius: geometry.radius, rot: geometry.rot },
            })
          : [];

        const tableRadius =
          geometry.shape === 'circle'
            ? typeof geometry.radius === 'number'
              ? geometry.radius
              : Math.min(geometry.w, geometry.h) / 2
            : 8;

        return (
          <div
            key={table.id}
            className="absolute"
            style={{
              left: position.x,
              top: position.y,
              width: geometry.w,
              height: geometry.h,
              transform: `rotate(${geometry.rot}deg)`,
              transformOrigin: 'top left',
              zIndex: 2,
              pointerEvents: 'auto',
            }}
          >
            {/* Seats (LOCAL coords) */}
            {seats.map(seat => (
              <div
                key={seat.id}
                className="absolute flex items-center justify-center rounded-full border border-gray-300 bg-white/70"
                style={{
                  left: seat.x - 8,
                  top: seat.y - 8,
                  width: 16,
                  height: 16,
                  zIndex: 3,
                  opacity: seatPreview ? 0.28 : 0.85,
                  pointerEvents: 'none',
                }}
                title="szék"
              >
                <div className="relative">
                  <div
                    className="mx-auto rounded-full bg-gray-700"
                    style={{ width: 5, height: 5, opacity: 0.8 }}
                  />
                  <div
                    className="mx-auto mt-[1px] rounded-full bg-gray-700"
                    style={{ width: 7, height: 5, opacity: 0.55 }}
                  />
                </div>
              </div>
            ))}

            {/* Add-seat controls (LOCAL coords, clickable) */}
            {seatEditable &&
              addControls.map(ctrl => {
                const disabled = Boolean(ctrl.disabled);
                const clickable = Boolean(onAddSeat) && !disabled;

                return (
                  <button
                    key={ctrl.id}
                    type="button"
                    onClick={() => {
                      if (!onAddSeat || disabled) return;
                      onAddSeat(table.id, ctrl.side);
                    }}
                    className={[
                      'absolute flex items-center justify-center rounded-full',
                      'border border-dashed',
                      disabled ? 'border-gray-200 bg-white/40' : 'border-amber-300 bg-amber-50/70',
                    ].join(' ')}
                    style={{
                      left: ctrl.x - 9,
                      top: ctrl.y - 9,
                      width: 18,
                      height: 18,
                      zIndex: 4,
                      cursor: clickable ? 'pointer' : 'not-allowed',
                      pointerEvents: 'auto',
                    }}
                    title={disabled ? ctrl.reason ?? 'limit' : 'szék hozzáadása'}
                  >
                    <span
                      className="text-[12px] leading-none"
                      style={{ opacity: disabled ? 0.25 : 0.9 }}
                    >
                      +
                    </span>
                  </button>
                );
              })}

            {/* Table body */}
            <div
              className={[
                'absolute inset-0 flex flex-col items-center justify-center text-[10px] font-semibold text-gray-800',
                selected ? 'ring-2 ring-[var(--color-primary)]' : '',
              ].join(' ')}
              style={{
                pointerEvents: 'none',
                borderRadius: tableRadius,
                border: '2px solid rgba(148, 163, 184, 0.6)',
                backgroundColor: renderStatusColor(status),
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                outline: recommended ? '2px dashed rgba(251, 191, 36, 0.9)' : undefined,
                outlineOffset: recommended ? 2 : undefined,
              }}
            >
              <span>{table.name}</span>
              {showCapacity && table.capacityMax ? (
                <span className="text-[9px] text-gray-500">max {table.capacityMax}</span>
              ) : null}
              {conflict ? (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-white text-[8px] text-white flex items-center justify-center">
                  !
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default FloorplanWorldLayer;
