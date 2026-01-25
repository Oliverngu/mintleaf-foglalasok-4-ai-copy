import { Table } from '../models/data';

export type SeatSide = 'north' | 'east' | 'south' | 'west' | 'radial';

export type Seat = {
  id: string;
  side: SeatSide;
  index: number;
  x: number;
  y: number;
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

type SideCounts = {
  north: number;
  east: number;
  south: number;
  west: number;
};

const MAX_RECT_PER_SIDE = 3;
const MAX_CIRCLE = 16;

// UI-hoz majd később: ikon középpontok, nem a kör/ember rajzolás
const DEFAULT_SEAT_OFFSET = 10; // px távolság az asztal szélétől kifelé
const DEFAULT_CIRCLE_OFFSET = 12; // kör asztal peremétől kifelé

const clampInt = (n: unknown, min: number, max: number) => {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const rotatePoint = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rotDeg: number
) => {
  const r = degToRad(rotDeg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

const safeTableId = (t: Table) => (t as any)?.id ?? (t as any)?.tableId ?? 'table';

const getSideCount = (table: Table, side: keyof SideCounts) => {
  // 1) prefer sideCapacities
  const sc = (table as any)?.sideCapacities;
  if (sc && typeof sc === 'object' && side in sc) {
    return clampInt(sc[side], 0, MAX_RECT_PER_SIDE);
  }

  // 2) fallback: sideSeats / seatsBySide / etc. (ha később átnevezed)
  const alt = (table as any)?.seatsBySide ?? (table as any)?.sideSeats;
  if (alt && typeof alt === 'object' && side in alt) {
    return clampInt(alt[side], 0, MAX_RECT_PER_SIDE);
  }

  return 0;
};

const getRectCounts = (table: Table): SideCounts => ({
  north: getSideCount(table, 'north'),
  east: getSideCount(table, 'east'),
  south: getSideCount(table, 'south'),
  west: getSideCount(table, 'west'),
});

const getCircleCount = (table: Table) => {
  // 1) prefer explicit field
  const circleSeats =
    (table as any)?.circleSeats ??
    (table as any)?.seatCountRadial ??
    (table as any)?.radialSeats;

  if (circleSeats !== undefined) return clampInt(circleSeats, 0, MAX_CIRCLE);

  // 2) fallback: capacityMax (ha nincs külön kerek mező, inkább 0 legyen)
  // szándékosan nem használjuk automatikusan capacityMax-ot, nehogy “megjelenjen” seat ott is.
  return 0;
};

export function computeSeatLayout(input: SeatLayoutInput): Seat[] {
  const { table, geometry } = input;

  if ((table as any)?.shape === 'circle') {
    return computeCircularSeats(table, geometry);
  }

  return computeRectangularSeats(table, geometry);
}

/**
 * Téglalap: N/E/S/W oldalanként max 3
 * - az elosztás a megfelelő oldal mentén történik
 * - a pontokat az asztal középpontja körül elforgatjuk geometry.rot szerint
 */
function computeRectangularSeats(table: Table, geometry: SeatLayoutInput['geometry']): Seat[] {
  const counts = getRectCounts(table);
  const seats: Seat[] = [];

  const cx = geometry.x + geometry.w / 2;
  const cy = geometry.y + geometry.h / 2;

  const leftX = geometry.x;
  const rightX = geometry.x + geometry.w;
  const topY = geometry.y;
  const bottomY = geometry.y + geometry.h;

  // Egyenletes pozíciók 1..n “slot” alapján
  const spaced = (start: number, end: number, n: number) => {
    if (n <= 0) return [] as number[];
    if (n === 1) return [(start + end) / 2];
    const step = (end - start) / (n + 1);
    const arr: number[] = [];
    for (let i = 1; i <= n; i += 1) arr.push(start + step * i);
    return arr;
  };

  // north: top edge, kifelé -y irányban
  {
    const n = counts.north;
    const xs = spaced(leftX, rightX, n);
    xs.forEach((x, i) => {
      const p = rotatePoint(x, topY - DEFAULT_SEAT_OFFSET, cx, cy, geometry.rot);
      seats.push({
        id: `${safeTableId(table)}:north:${i}`,
        side: 'north',
        index: i,
        x: p.x,
        y: p.y,
      });
    });
  }

  // south: bottom edge, kifelé +y
  {
    const n = counts.south;
    const xs = spaced(leftX, rightX, n);
    xs.forEach((x, i) => {
      const p = rotatePoint(x, bottomY + DEFAULT_SEAT_OFFSET, cx, cy, geometry.rot);
      seats.push({
        id: `${safeTableId(table)}:south:${i}`,
        side: 'south',
        index: i,
        x: p.x,
        y: p.y,
      });
    });
  }

  // west: left edge, kifelé -x
  {
    const n = counts.west;
    const ys = spaced(topY, bottomY, n);
    ys.forEach((y, i) => {
      const p = rotatePoint(leftX - DEFAULT_SEAT_OFFSET, y, cx, cy, geometry.rot);
      seats.push({
        id: `${safeTableId(table)}:west:${i}`,
        side: 'west',
        index: i,
        x: p.x,
        y: p.y,
      });
    });
  }

  // east: right edge, kifelé +x
  {
    const n = counts.east;
    const ys = spaced(topY, bottomY, n);
    ys.forEach((y, i) => {
      const p = rotatePoint(rightX + DEFAULT_SEAT_OFFSET, y, cx, cy, geometry.rot);
      seats.push({
        id: `${safeTableId(table)}:east:${i}`,
        side: 'east',
        index: i,
        x: p.x,
        y: p.y,
      });
    });
  }

  return seats;
}

/**
 * Kör asztal: max 16
 * - székek egyenletesen a körön, így alapból szimmetrikus
 * - geometry.rot hozzáadódik az alap szöghez
 * - a pontok az asztal középpontjától radius+offset távolságra kerülnek
 */
function computeCircularSeats(table: Table, geometry: SeatLayoutInput['geometry']): Seat[] {
  const n = getCircleCount(table);
  if (n <= 0) return [];

  const cx = geometry.x + geometry.w / 2;
  const cy = geometry.y + geometry.h / 2;

  // ha radius nincs, számoljuk w/h alapján
  const baseRadius =
    Number.isFinite(geometry.radius) && (geometry.radius as number) > 0
      ? (geometry.radius as number)
      : Math.min(geometry.w, geometry.h) / 2;

  const r = Math.max(1, baseRadius + DEFAULT_CIRCLE_OFFSET);

  // start angle: "north" irányból induljunk ( -90° ), erre jön rá rot
  const startDeg = -90 + geometry.rot;

  const seats: Seat[] = [];
  for (let i = 0; i < n; i += 1) {
    const angleDeg = startDeg + (360 / n) * i;
    const angleRad = degToRad(angleDeg);
    const x = cx + r * Math.cos(angleRad);
    const y = cy + r * Math.sin(angleRad);

    seats.push({
      id: `${safeTableId(table)}:radial:${i}`,
      side: 'radial',
      index: i,
      x,
      y,
      angle: angleDeg,
    });
  }

  return seats;
}
