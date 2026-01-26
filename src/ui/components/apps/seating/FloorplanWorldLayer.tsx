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
  SeatSide,
  getSeatAddLimits,
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
  renderTableBody?: boolean;
  renderObstacles?: boolean;
};

type SeatUI = {
  /** Preview: true -> seats shown faintly, no + controls */
  preview?: boolean;
  /** Edit: true -> show + controls and make them clickable */
  editable?: boolean;
  /** called when user clicks a + control */
  onAddSeat?: (tableId: string, side: 'north' | 'east' | 'south' | 'west' | 'radial') => void;
  /** called when user clicks a - control */
  onRemoveSeat?: (
    tableId: string,
    side: 'north' | 'east' | 'south' | 'west' | 'radial'
  ) => void;
  /** render debug badge */
  debug?: boolean;
  debugMode?: string;
  debugSelectedTableId?: string | null;
  debugSelectedTableDraftId?: string | null;
  debugSelectedTableKey?: string | null;
  uiScale?: number;
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
  const renderTableBody = appearance?.renderTableBody ?? true;
  const renderObstacles = appearance?.renderObstacles ?? true;

  const seatPreview = Boolean(seatUI?.preview);
  const seatEditable = Boolean(seatUI?.editable);
  const onAddSeat = seatUI?.onAddSeat;
  const onRemoveSeat = seatUI?.onRemoveSeat;
  const debugEnabled = Boolean(seatUI?.debug);
  const uiScaleRaw = typeof seatUI?.uiScale === 'number' ? seatUI.uiScale : 1;
  const uiScale = Math.min(1.6, Math.max(0.8, uiScaleRaw));
  const seatSize = 16 * uiScale;
  const seatRadius = seatSize / 2;
  const controlSize = 18 * uiScale;
  const controlRadius = controlSize / 2;
  const gap = 6 * uiScale;

  let selectedSeatCount = 0;
  let selectedControlCount = 0;
  let selectedTableId: string | null = null;
  let selectedTableShape: Table['shape'] | undefined;
  let selectedSeatLayout: Table['seatLayout'] | undefined;
  let selectedSideCapacities: Table['sideCapacities'] | undefined;
  let selectedPlusOutsets: Record<SeatSide, number> | undefined;
  let selectedRemoveOutsets: Record<SeatSide, number> | undefined;
  let anySelected = false;
  const hasSeatLayout = (table: Table) => {
    if (table.seatLayout?.kind === 'circle') {
      return (table.seatLayout.count ?? 0) > 0;
    }
    if (table.seatLayout?.kind === 'rect') {
      const sides = table.seatLayout.sides ?? {};
      return (
        (sides.north ?? 0) > 0 ||
        (sides.east ?? 0) > 0 ||
        (sides.south ?? 0) > 0 ||
        (sides.west ?? 0) > 0
      );
    }
    return false;
  };

  return (
    <>
      {/* Obstacles */}
      {renderObstacles &&
        obstacles.map(obstacle => (
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
              pointerEvents: 'none',
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
        const renderMode = seatPreview ? 'preview' : 'edit';
        const seats: Seat[] = hasSeatLayout(table)
          ? computeSeatLayout({
              table,
              geometry: {
                x: 0,
                y: 0,
                w: geometry.w,
                h: geometry.h,
                radius: geometry.radius,
                rot: geometry.rot,
              },
              renderMode,
            })
          : [];

        const circleRadius =
          table.shape === 'circle'
            ? typeof geometry.radius === 'number'
              ? geometry.radius
              : Math.min(geometry.w, geometry.h) / 2
            : Math.min(geometry.w, geometry.h) / 2;
        const controlOutsets = {
          north: 0,
          east: 0,
          south: 0,
          west: 0,
          radial: 0,
        } as Record<SeatSide, number>;
        seats.forEach(seat => {
          switch (seat.side) {
            case 'north':
              controlOutsets.north = Math.max(controlOutsets.north, -seat.y);
              break;
            case 'south':
              controlOutsets.south = Math.max(controlOutsets.south, seat.y - geometry.h);
              break;
            case 'east':
              controlOutsets.east = Math.max(controlOutsets.east, seat.x - geometry.w);
              break;
            case 'west':
              controlOutsets.west = Math.max(controlOutsets.west, -seat.x);
              break;
            case 'radial': {
              const cx = geometry.w / 2;
              const cy = geometry.h / 2;
              const dist = Math.hypot(seat.x - cx, seat.y - cy);
              controlOutsets.radial = Math.max(controlOutsets.radial, dist - circleRadius);
              break;
            }
            default:
              break;
          }
        });
        const defaultOutsetRect = Math.max(10, Math.min(geometry.w, geometry.h) * 0.14);
        const defaultOutsetRadial = Math.max(10, circleRadius * 0.22);
        const plusOutsets: Record<SeatSide, number> = {
          north: Math.max(defaultOutsetRect, controlOutsets.north + seatRadius + controlRadius + gap),
          south: Math.max(defaultOutsetRect, controlOutsets.south + seatRadius + controlRadius + gap),
          east: Math.max(defaultOutsetRect, controlOutsets.east + seatRadius + controlRadius + gap),
          west: Math.max(defaultOutsetRect, controlOutsets.west + seatRadius + controlRadius + gap),
          radial: Math.max(defaultOutsetRadial, controlOutsets.radial + seatRadius + controlRadius + gap),
        };
        const removeOutsets: Record<SeatSide, number> = {
          north: plusOutsets.north + controlSize + gap,
          south: plusOutsets.south + controlSize + gap,
          east: plusOutsets.east + controlSize + gap,
          west: plusOutsets.west + controlSize + gap,
          radial: plusOutsets.radial + controlSize + gap,
        };
        const resolveControlPosition = (side: SeatSide, outset: number) => {
          switch (side) {
            case 'north':
              return { x: geometry.w / 2, y: -outset };
            case 'south':
              return { x: geometry.w / 2, y: geometry.h + outset };
            case 'east':
              return { x: geometry.w + outset, y: geometry.h / 2 };
            case 'west':
              return { x: -outset, y: geometry.h / 2 };
            case 'radial': {
              const angle = -Math.PI / 2;
              const cx = geometry.w / 2;
              const cy = geometry.h / 2;
              return {
                x: cx + Math.cos(angle) * (circleRadius + outset),
                y: cy + Math.sin(angle) * (circleRadius + outset),
              };
            }
            default:
              return { x: geometry.w / 2, y: -outset };
          }
        };

        const addControls: SeatAddControl[] =
          seatEditable && selected
            ? computeSeatAddControls({
                table,
                geometry: {
                  x: 0,
                  y: 0,
                  w: geometry.w,
                  h: geometry.h,
                  radius: geometry.radius,
                  rot: geometry.rot,
                },
              })
            : [];

        const seatLimits = selected ? getSeatAddLimits(table) : null;

        if (selected) {
          anySelected = true;
          selectedSeatCount = seats.length;
          selectedControlCount = addControls.length;
          selectedTableId = table.id;
          selectedTableShape = table.shape;
          selectedSeatLayout = table.seatLayout;
          selectedSideCapacities = table.sideCapacities;
          selectedPlusOutsets = plusOutsets;
          selectedRemoveOutsets = removeOutsets;
        }

        const tableRadius =
          geometry.shape === 'circle'
            ? typeof geometry.radius === 'number'
              ? geometry.radius
              : Math.min(geometry.w, geometry.h) / 2
            : 8;

        return (
          <div key={table.id} className="absolute" style={{ left: position.x, top: position.y }}>
            <div
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: geometry.w,
                height: geometry.h,
                transform: `rotate(${geometry.rot}deg)`,
                transformOrigin: 'top left',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              {/* Seats (LOCAL coords) */}
              {seats.map(seat => (
                <div
                  key={seat.id}
                  className="absolute flex items-center justify-center rounded-full border border-gray-300 bg-white/70"
                  style={{
                    left: seat.x - seatRadius,
                    top: seat.y - seatRadius,
                    width: seatSize,
                    height: seatSize,
                    zIndex: 3,
                    opacity: seatPreview ? 0.28 : 0.85,
                    pointerEvents: 'none',
                  }}
                  title="szék"
                >
                  <div className="relative">
                    <div
                      className="mx-auto rounded-full bg-gray-700"
                      style={{ width: 5 * uiScale, height: 5 * uiScale, opacity: 0.8 }}
                    />
                    <div
                      className="mx-auto mt-[1px] rounded-full bg-gray-700"
                      style={{
                        width: 7 * uiScale,
                        height: 5 * uiScale,
                        opacity: 0.55,
                      }}
                    />
                  </div>
                </div>
              ))}

              {renderTableBody && (
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
              )}
            </div>

            {seatEditable && selected && (
              <div
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  width: geometry.w,
                  height: geometry.h,
                  transform: `rotate(${geometry.rot}deg)`,
                  transformOrigin: 'top left',
                  zIndex: 6,
                  pointerEvents: 'auto',
                }}
              >
                {addControls.map(ctrl => {
                  const disabled = Boolean(ctrl.disabled);
                  const clickable = Boolean(onAddSeat) && !disabled;
                  const plusPosition = resolveControlPosition(
                    ctrl.side,
                    plusOutsets[ctrl.side] ?? defaultOutsetRect
                  );
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
                        disabled
                          ? 'border-gray-200 bg-white/40'
                          : 'border-amber-300 bg-amber-50/70',
                      ].join(' ')}
                    style={{
                      left: plusPosition.x - controlRadius,
                      top: plusPosition.y - controlRadius,
                      width: controlSize,
                      height: controlSize,
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
                {seatLimits &&
                  (seatLimits.kind === 'circle'
                    ? seatLimits.count > 0
                    : Object.values(seatLimits.sides).some(value => value > 0)) &&
                  (seatLimits.kind === 'circle'
                    ? (['radial'] as SeatSide[])
                    : (['north', 'east', 'south', 'west'] as SeatSide[])
                  ).map(side => {
                      const shouldRender =
                        seatLimits.kind === 'circle'
                          ? side === 'radial' && seatLimits.count > 0
                          : side !== 'radial' && seatLimits.sides[side] > 0;
                      if (!shouldRender) return null;
                      const canRemove = Boolean(onRemoveSeat);
                      const removePosition = resolveControlPosition(
                        side,
                        removeOutsets[side] ?? defaultOutsetRect
                      );
                      return (
                        <button
                          key={`${table.id}-remove-${side}`}
                          type="button"
                          onClick={() => {
                            if (!onRemoveSeat) return;
                            onRemoveSeat(table.id, side);
                          }}
                          className="absolute flex items-center justify-center rounded-full border border-dashed border-rose-300 bg-rose-50/70"
                          style={{
                            left: removePosition.x - controlRadius,
                            top: removePosition.y - controlRadius,
                            width: controlSize,
                            height: controlSize,
                            zIndex: 4,
                            cursor: canRemove ? 'pointer' : 'not-allowed',
                            pointerEvents: 'auto',
                            opacity: canRemove ? 1 : 0.4,
                          }}
                          title="szék eltávolítása"
                        >
                          <span className="text-[12px] leading-none">-</span>
                        </button>
                      );
                    }
                  )}
              </div>
            )}
          </div>
        );
      })}
      {debugEnabled ? (
        <div className="pointer-events-none absolute left-2 bottom-2 z-[999] rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
          <div>seatEditable: {seatEditable ? 'yes' : 'no'}</div>
          <div>seatPreview: {seatPreview ? 'yes' : 'no'}</div>
          <div>mode: {seatUI?.debugMode ?? 'n/a'}</div>
          <div>selectedTableId: {seatUI?.debugSelectedTableId ?? 'n/a'}</div>
          <div>selectedTableDraftId: {seatUI?.debugSelectedTableDraftId ?? 'n/a'}</div>
          <div>selectedTableKey: {seatUI?.debugSelectedTableKey ?? 'n/a'}</div>
          <div>anySelected: {anySelected ? 'yes' : 'no'}</div>
          <div>selectedTable: {selectedTableId ?? 'n/a'}</div>
          <div>shape: {selectedTableShape ?? 'n/a'}</div>
          <div>
            seatLayout: {selectedSeatLayout?.kind ?? 'none'}{' '}
            {selectedSeatLayout?.kind === 'circle'
              ? `(${selectedSeatLayout.count ?? 0})`
              : selectedSeatLayout?.kind === 'rect'
              ? `N${selectedSeatLayout.sides?.north ?? 0} E${selectedSeatLayout.sides?.east ?? 0} S${
                  selectedSeatLayout.sides?.south ?? 0
                } W${selectedSeatLayout.sides?.west ?? 0}`
              : ''}
          </div>
          <div>
            sideCaps:{' '}
            {selectedSideCapacities
              ? `N${selectedSideCapacities.north} E${selectedSideCapacities.east} S${selectedSideCapacities.south} W${selectedSideCapacities.west}`
              : 'n/a'}
          </div>
          <div>
            plusOutsets:{' '}
            {selectedPlusOutsets
              ? `N${Math.round(selectedPlusOutsets.north)} E${Math.round(selectedPlusOutsets.east)} S${Math.round(selectedPlusOutsets.south)} W${Math.round(selectedPlusOutsets.west)} R${Math.round(selectedPlusOutsets.radial)}`
              : 'n/a'}
          </div>
          <div>
            removeOutsets:{' '}
            {selectedRemoveOutsets
              ? `N${Math.round(selectedRemoveOutsets.north)} E${Math.round(selectedRemoveOutsets.east)} S${Math.round(selectedRemoveOutsets.south)} W${Math.round(selectedRemoveOutsets.west)} R${Math.round(selectedRemoveOutsets.radial)}`
              : 'n/a'}
          </div>
          <div>addControls: {selectedControlCount}</div>
          <div>seats: {selectedSeatCount}</div>
        </div>
      ) : null}
    </>
  );
};

export default FloorplanWorldLayer;
