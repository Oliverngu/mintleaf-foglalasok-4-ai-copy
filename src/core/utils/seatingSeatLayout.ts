// src/core/utils/seatingSeatLayout.ts
import { Table } from '../models/data';

export type SeatSide = 'north' | 'east' | 'south' | 'west' | 'radial';

export type Seat = {
  id: string;
  side: SeatSide;
  index: number;
  // local table-space coords (before table rotation), origin = table top-left
  x: number;
  y: number;
  // only for radial/circle seats (angle around center, radians)
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

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const safeShape = (shape: Table['shape']) => {
  if (shape === 'circle') return 'circle';
  return 'rect';
};

const seatId = (tableId: string, side: SeatSide, index: number) =>
  `${tableId}:${side}:${index}`;

export function computeSeatLayout(input: SeatLayoutInput): Seat[] {
  const { table, geometry } = input;

  if (safeShape(table.shape) === 'circle') {
    return computeCircularSeats(table, geometry);
  }

  return computeRectangularSeats(table, geometry);
}

export function computeRectangularSeats(
  table: Table,
  geometry: SeatLayoutInput['geometry']
): Seat[] {
  const w = Math.max(1, geometry.w);
  const h = Math.max(1, geometry.h);

  const sides =
    table.seatLayout?.kind === 'rect' ? table.seatLayout.sides ?? {} : {};

  const north = clampInt(sides.north, 0, 3, 0);
  const east = clampInt(sides.east, 0, 3, 0);
  const south = clampInt(sides.south, 0, 3, 0);
  const west = clampInt(sides.west, 0, 3, 0);

  const inset = Math.max(10, Math.min(w, h) * 0.12);
  const outside = Math.max(10, Math.min(w, h) * 0.14);

  const seats: Seat[] = [];

  const distribute = (count: number) => {
    if (count <= 1) return [0.5];
    if (count === 2) return [0.33, 0.67];
    return [0.25, 0.5, 0.75];
  };

  distribute(north).forEach((t, i) => {
    seats.push({
      id: seatId(table.id, 'north', i),
      side: 'north',
      index: i,
      x: inset + t * (w - 2 * inset),
      y: -outside,
    });
  });

  distribute(south).forEach((t, i) => {
    seats.push({
      id: seatId(table.id, 'south', i),
      side: 'south',
      index: i,
      x: inset + t * (w - 2 * inset),
      y: h + outside,
    });
  });

  distribute(east).forEach((t, i) => {
    seats.push({
      id: seatId(table.id, 'east', i),
      side: 'east',
      index: i,
      x: w + outside,
      y: inset + t * (h - 2 * inset),
    });
  });

  distribute(west).forEach((t, i) => {
    seats.push({
      id: seatId(table.id, 'west', i),
      side: 'west',
      index: i,
      x: -outside,
      y: inset + t * (h - 2 * inset),
    });
  });

  return seats;
}

export function computeCircularSeats(
  table: Table,
  geometry: SeatLayoutInput['geometry']
): Seat[] {
  const maxSeats = 16;
  const w = Math.max(1, geometry.w);
  const h = Math.max(1, geometry.h);

  const r = Math.max(1, geometry.radius ?? Math.min(w, h) / 2);

  const rawCount = table.seatLayout?.kind === 'circle' ? table.seatLayout.count : 0;

  const count = clampInt(rawCount, 0, maxSeats, 0);
  if (count <= 0) return [];

  const cx = w / 2;
  const cy = h / 2;

  const outside = Math.max(10, r * 0.18);
  const seatRadius = r + outside;

  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / count;

  const seats: Seat[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = startAngle + i * step;
    seats.push({
      id: seatId(table.id, 'radial', i),
      side: 'radial',
      index: i,
      x: cx + Math.cos(angle) * seatRadius,
      y: cy + Math.sin(angle) * seatRadius,
      angle,
    });
  }

  return seats;
}

export function getSeatAddLimits(table: Table) {
  if (safeShape(table.shape) === 'circle') {
    const count = clampInt(
      table.seatLayout?.kind === 'circle' ? table.seatLayout.count : 0,
      0,
      16,
      0
    );
    return { kind: 'circle' as const, count, max: 16 };
  }

  const sides =
    table.seatLayout?.kind === 'rect' ? table.seatLayout.sides ?? {} : {};

  return {
    kind: 'rect' as const,
    sides: {
      north: clampInt(sides.north, 0, 3, 0),
      east: clampInt(sides.east, 0, 3, 0),
      south: clampInt(sides.south, 0, 3, 0),
      west: clampInt(sides.west, 0, 3, 0),
    },
    maxPerSide: 3,
  };
}

// --- Seat add controls (UI "+" buttons) ---

export type SeatAddControl = {
  id: string;
  // rect: north/east/south/west; circle: radial
  side: SeatSide;
  // for circle it can be 0 (single control)
  index: number;
  x: number;
  y: number;
  angle?: number; // optional: mainly for circle orientation if you want later
  disabled?: boolean;
  reason?: string;
};

const controlId = (tableId: string, side: SeatSide, index: number) =>
  `${tableId}:add:${side}:${index}`;

export function computeSeatAddControls(input: SeatLayoutInput): SeatAddControl[] {
  const { table, geometry } = input;

  if (safeShape(table.shape) === 'circle') {
    return computeCircleAddControls(table, geometry);
  }

  return computeRectAddControls(table, geometry);
}

function computeRectAddControls(
  table: Table,
  geometry: SeatLayoutInput['geometry']
): SeatAddControl[] {
  const w = Math.max(1, geometry.w);
  const h = Math.max(1, geometry.h);

  const layout = (table as any)?.seatLayout;
  const sides =
  table.seatLayout?.kind === 'rect' ? table.seatLayout.sides ?? {} : {};

  const north = clampInt(sides.north, 0, 3, 0);
  const east = clampInt(sides.east, 0, 3, 0);
  const south = clampInt(sides.south, 0, 3, 0);
  const west = clampInt(sides.west, 0, 3, 0);

  const outside = Math.max(10, Math.min(w, h) * 0.14);

  // Where should the "+" sit? Middle of each side, slightly outside.
  const controls: SeatAddControl[] = [];

  if (north < 3) {
    controls.push({
      id: controlId(table.id, 'north', north),
      side: 'north',
      index: north, // next seat index on that side
      x: w / 2,
      y: -outside,
    });
  }

  if (south < 3) {
    controls.push({
      id: controlId(table.id, 'south', south),
      side: 'south',
      index: south,
      x: w / 2,
      y: h + outside,
    });
  }

  if (east < 3) {
    controls.push({
      id: controlId(table.id, 'east', east),
      side: 'east',
      index: east,
      x: w + outside,
      y: h / 2,
    });
  }

  if (west < 3) {
    controls.push({
      id: controlId(table.id, 'west', west),
      side: 'west',
      index: west,
      x: -outside,
      y: h / 2,
    });
  }

  return controls;
}

function computeCircleAddControls(
  table: Table,
  geometry: SeatLayoutInput['geometry']
): SeatAddControl[] {
  const maxSeats = 16;
  const w = Math.max(1, geometry.w);
  const h = Math.max(1, geometry.h);

  const r = Math.max(1, geometry.radius ?? Math.min(w, h) / 2);

  const layout = (table as any)?.seatLayout;
  const count = clampInt(
  table.seatLayout?.kind === 'circle' ? table.seatLayout.count : 0,
  0,
  maxSeats,
  0
);

  if (count >= maxSeats) return [];

  const cx = w / 2;
  const cy = h / 2;

  // Put the "+" at the top (north) outside the circle, stable position.
  const outside = Math.max(10, r * 0.22);
  const angle = -Math.PI / 2;

  return [
    {
      id: controlId(table.id, 'radial', count), // next index if you want it
      side: 'radial',
      index: count,
      x: cx + Math.cos(angle) * (r + outside),
      y: cy + Math.sin(angle) * (r + outside),
      angle,
    },
  ];
}
