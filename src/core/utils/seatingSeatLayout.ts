// src/core/utils/seatingSeatLayout.ts
import { Table } from '../models/data';

export type SeatSide = 'north' | 'east' | 'south' | 'west' | 'radial';

export type Seat = {
  id: string;
  side: SeatSide;
  index: number;
  x: number;
  y: number;
  angle?: number; // degrees
};

export type SeatAddControl = {
  id: string;
  tableId: string;
  side: Exclude<SeatSide, 'radial'> | 'radial';
  x: number;
  y: number;
  angle?: number;
  disabled?: boolean;
  reason?: string;
};

export type SeatLayoutInput = {
  table: Table;
  geometry: {
    x: number;
    y: number;
    w: number;
    h: number;
    radius?: number;
    rot: number; // degrees
  };
};

// tuning
const SEAT_RING_OFFSET = 14;
const RECT_SIDE_MARGIN = 10;

const clampInt = (v: unknown, min: number, max: number, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const rotatePoint = (px: number, py: number, cx: number, cy: number, rotDeg: number) => {
  const rad = degToRad(rotDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
};

const seatId = (tableId: string, side: SeatSide, index: number) =>
  `seat:${tableId}:${side}:${index}`;

const controlId = (tableId: string, side: string) => `seatAdd:${tableId}:${side}`;

const resolveRectSeatCounts = (table: Table) => {
  const layout = table.seatLayout as any | undefined;
  if (layout?.kind === 'rect' && layout?.sides && typeof layout.sides === 'object') {
    return {
      north: clampInt(layout.sides.north, 0, 3, 0),
      east: clampInt(layout.sides.east, 0, 3, 0),
      south: clampInt(layout.sides.south, 0, 3, 0),
      west: clampInt(layout.sides.west, 0, 3, 0),
    };
  }
  return { north: 0, east: 0, south: 0, west: 0 };
};

const resolveCircleSeatCount = (table: Table) => {
  const layout = table.seatLayout as any | undefined;
  if (layout?.kind === 'circle') return clampInt(layout.count, 0, 16, 0);
  return 0;
};

const distribute = (count: number, start: number, end: number) => {
  if (count <= 0) return [] as number[];
  const min = start + RECT_SIDE_MARGIN;
  const max = end - RECT_SIDE_MARGIN;
  if (count === 1) return [(min + max) / 2];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
};

function computeRectangularSeats(table: Table, geometry: SeatLayoutInput['geometry']): Seat[] {
  const { x, y, w, h, rot } = geometry;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const counts = resolveRectSeatCounts(table);
  const out: Seat[] = [];

  // north
  distribute(counts.north, x, x + w).forEach((sx, i) => {
    const base = { x: sx, y: y - SEAT_RING_OFFSET };
    const p = rotatePoint(base.x, base.y, cx, cy, rot);
    out.push({ id: seatId(table.id, 'north', i), side: 'north', index: i, x: p.x, y: p.y, angle: -90 + rot });
  });

  // south
  distribute(counts.south, x, x + w).forEach((sx, i) => {
    const base = { x: sx, y: y + h + SEAT_RING_OFFSET };
    const p = rotatePoint(base.x, base.y, cx, cy, rot);
    out.push({ id: seatId(table.id, 'south', i), side: 'south', index: i, x: p.x, y: p.y, angle: 90 + rot });
  });

  // west
  distribute(counts.west, y, y + h).forEach((sy, i) => {
    const base = { x: x - SEAT_RING_OFFSET, y: sy };
    const p = rotatePoint(base.x, base.y, cx, cy, rot);
    out.push({ id: seatId(table.id, 'west', i), side: 'west', index: i, x: p.x, y: p.y, angle: 180 + rot });
  });

  // east
  distribute(counts.east, y, y + h).forEach((sy, i) => {
    const base = { x: x + w + SEAT_RING_OFFSET, y: sy };
    const p = rotatePoint(base.x, base.y, cx, cy, rot);
    out.push({ id: seatId(table.id, 'east', i), side: 'east', index: i, x: p.x, y: p.y, angle: 0 + rot });
  });

  return out;
}

function computeCircularSeats(table: Table, geometry: SeatLayoutInput['geometry']): Seat[] {
  const { x, y, w, h, radius, rot } = geometry;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const count = resolveCircleSeatCount(table);
  if (count <= 0) return [];

  const baseR =
    typeof radius === 'number' && Number.isFinite(radius) && radius > 0
      ? radius
      : Math.min(w, h) / 2;

  const ringR = baseR + SEAT_RING_OFFSET;

  const startDeg = -90; // north
  const stepDeg = 360 / count;

  const out: Seat[] = [];
  for (let i = 0; i < count; i += 1) {
    const deg = startDeg + stepDeg * i + rot;
    const rad = degToRad(deg);
    out.push({
      id: seatId(table.id, 'radial', i),
      side: 'radial',
      index: i,
      x: cx + ringR * Math.cos(rad),
      y: cy + ringR * Math.sin(rad),
      angle: deg,
    });
  }
  return out;
}

export function computeSeatLayout(input: SeatLayoutInput): Seat[] {
  const { table, geometry } = input;
  if (table.shape === 'circle') return computeCircularSeats(table, geometry);
  return computeRectangularSeats(table, geometry);
}

/**
 * Add-seat controls:
 * - rect: 4 controls (N/E/S/W), disabled if already 3 on that side
 * - circle: 1 control (radial), disabled if already 16
 */
export function computeSeatAddControls(input: SeatLayoutInput): SeatAddControl[] {
  const { table, geometry } = input;
  const { x, y, w, h, rot } = geometry;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (table.shape === 'circle') {
    const count = resolveCircleSeatCount(table);
    const disabled = count >= 16;
    const baseR =
      typeof geometry.radius === 'number' && Number.isFinite(geometry.radius) && geometry.radius > 0
        ? geometry.radius
        : Math.min(w, h) / 2;
    const ringR = baseR + SEAT_RING_OFFSET;

    const deg = -90 + rot;
    const rad = degToRad(deg);

    return [
      {
        id: controlId(table.id, 'radial'),
        tableId: table.id,
        side: 'radial',
        x: cx + ringR * Math.cos(rad),
        y: cy + ringR * Math.sin(rad),
        angle: deg,
        disabled,
        reason: disabled ? 'Max 16 szék' : undefined,
      },
    ];
  }

  const counts = resolveRectSeatCounts(table);

  const mk = (side: 'north' | 'east' | 'south' | 'west', px: number, py: number, angle: number) => {
    const current = counts[side] ?? 0;
    const disabled = current >= 3;
    const p = rotatePoint(px, py, cx, cy, rot);
    return {
      id: controlId(table.id, side),
      tableId: table.id,
      side,
      x: p.x,
      y: p.y,
      angle: angle + rot,
      disabled,
      reason: disabled ? 'Max 3 / oldal' : undefined,
    } satisfies SeatAddControl;
  };

  // base positions in unrotated space, then rotate around center
  return [
    mk('north', cx, y - SEAT_RING_OFFSET, -90),
    mk('south', cx, y + h + SEAT_RING_OFFSET, 90),
    mk('west', x - SEAT_RING_OFFSET, cy, 180),
    mk('east', x + w + SEAT_RING_OFFSET, cy, 0),
  ];
}
