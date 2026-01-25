// src/core/utils/seatingSeatLayout.ts
import { Table } from '../models/data';

export type SeatSide = 'north' | 'east' | 'south' | 'west' | 'radial';

export type Seat = {
  id: string;
  side: SeatSide;
  index: number;
  x: number;
  y: number;
  /**
   * Degrees. Useful if later you want to rotate the seat icon
   * to "face" away from the table.
   */
  angle?: number;
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

/**
 * Visual tuning knobs (safe defaults).
 * You can tweak these later without touching logic.
 */
const SEAT_RING_OFFSET = 14; // distance from table edge
const RECT_SIDE_MARGIN = 10; // margin when distributing seats along a side

const clampInt = (v: unknown, min: number, max: number, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const rotatePoint = (
  px: number,
  py: number,
  cx: number,
  cy: number,
  rotDeg: number
) => {
  const rad = degToRad(rotDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

const seatId = (tableId: string, side: SeatSide, index: number) =>
  `seat:${tableId}:${side}:${index}`;

const resolveRectSeatCounts = (table: Table) => {
  // Prefer explicit seatLayout
  const layout = table.seatLayout as any | undefined;

  if (layout?.kind === 'rect' && layout?.sides && typeof layout.sides === 'object') {
    return {
      north: clampInt(layout.sides.north, 0, 3, 0),
      east: clampInt(layout.sides.east, 0, 3, 0),
      south: clampInt(layout.sides.south, 0, 3, 0),
      west: clampInt(layout.sides.west, 0, 3, 0),
    };
  }

  // Optional legacy fallback: sideCapacities exists, but it means "people" not "chairs".
  // We keep it OFF by default to avoid unexpected icons appearing.
  return { north: 0, east: 0, south: 0, west: 0 };
};

const resolveCircleSeatCount = (table: Table) => {
  const layout = table.seatLayout as any | undefined;
  if (layout?.kind === 'circle') {
    return clampInt(layout.count, 0, 16, 0);
  }
  return 0;
};

function computeRectangularSeats(table: Table, geometry: SeatLayoutInput['geometry']): Seat[] {
  const { x, y, w, h, rot } = geometry;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const counts = resolveRectSeatCounts(table);
  const out: Seat[] = [];

  const distribute = (count: number, start: number, end: number) => {
    // returns positions along [start,end] excluding hard edges using margin,
    // evenly spaced for count
    if (count <= 0) return [] as number[];
    const min = start + RECT_SIDE_MARGIN;
    const max = end - RECT_SIDE_MARGIN;
    if (count === 1) return [(min + max) / 2];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  };

  // NORTH (top)
  {
    const c = counts.north;
    const xs = distribute(c, x, x + w);
    xs.forEach((sx, i) => {
      const base = { x: sx, y: y - SEAT_RING_OFFSET };
      const p = rotatePoint(base.x, base.y, cx, cy, rot);
      out.push({
        id: seatId(table.id, 'north', i),
        side: 'north',
        index: i,
        x: p.x,
        y: p.y,
        angle: -90 + rot,
      });
    });
  }

  // SOUTH (bottom)
  {
    const c = counts.south;
    const xs = distribute(c, x, x + w);
    xs.forEach((sx, i) => {
      const base = { x: sx, y: y + h + SEAT_RING_OFFSET };
      const p = rotatePoint(base.x, base.y, cx, cy, rot);
      out.push({
        id: seatId(table.id, 'south', i),
        side: 'south',
        index: i,
        x: p.x,
        y: p.y,
        angle: 90 + rot,
      });
    });
  }

  // WEST (left)
  {
    const c = counts.west;
    const ys = distribute(c, y, y + h);
    ys.forEach((sy, i) => {
      const base = { x: x - SEAT_RING_OFFSET, y: sy };
      const p = rotatePoint(base.x, base.y, cx, cy, rot);
      out.push({
        id: seatId(table.id, 'west', i),
        side: 'west',
        index: i,
        x: p.x,
        y: p.y,
        angle: 180 + rot,
      });
    });
  }

  // EAST (right)
  {
    const c = counts.east;
    const ys = distribute(c, y, y + h);
    ys.forEach((sy, i) => {
      const base = { x: x + w + SEAT_RING_OFFSET, y: sy };
      const p = rotatePoint(base.x, base.y, cx, cy, rot);
      out.push({
        id: seatId(table.id, 'east', i),
        side: 'east',
        index: i,
        x: p.x,
        y: p.y,
        angle: 0 + rot,
      });
    });
  }

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

  // Start at "north" so it matches mental model, then distribute evenly.
  // Rot is applied as an additional rotation.
  const startDeg = -90;
  const stepDeg = 360 / count;

  const out: Seat[] = [];
  for (let i = 0; i < count; i += 1) {
    const deg = startDeg + stepDeg * i + rot;
    const rad = degToRad(deg);
    const px = cx + ringR * Math.cos(rad);
    const py = cy + ringR * Math.sin(rad);
    out.push({
      id: seatId(table.id, 'radial', i),
      side: 'radial',
      index: i,
      x: px,
      y: py,
      angle: deg, // outward direction
    });
  }

  return out;
}

export function computeSeatLayout(input: SeatLayoutInput): Seat[] {
  const { table, geometry } = input;

  if (table.shape === 'circle') {
    return computeCircularSeats(table, geometry);
  }

  return computeRectangularSeats(table, geometry);
}
