import { Floorplan, Table } from '../models/data';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type TableGeometryDefaults = {
  rectWidth?: number;
  rectHeight?: number;
  circleRadius?: number;
};

export const isPlaceholderFloorplanDims = (width?: number | null, height?: number | null) =>
  Number(width) === 1 && Number(height) === 1;

export const isSaneDims = (dims: { width: number; height: number }) =>
  dims.width > 0 && dims.height > 0 && dims.width < 10000 && dims.height < 10000;

export const safeScaleOk = (scaleX: number, scaleY: number) =>
  Number.isFinite(scaleX) &&
  Number.isFinite(scaleY) &&
  scaleX >= 0.2 &&
  scaleX <= 5 &&
  scaleY >= 0.2 &&
  scaleY <= 5;

export const normalizeFloorplanDimensions = (
  floorplan?: Pick<Floorplan, 'width' | 'height'> | null
) => {
  const width =
    isFiniteNumber(floorplan?.width) && floorplan.width > 0 ? floorplan.width : 1;
  const height =
    isFiniteNumber(floorplan?.height) && floorplan.height > 0 ? floorplan.height : 1;
  return { width, height };
};

export const normalizeTableGeometry = (
  table?: Partial<Table> | null,
  defaults: TableGeometryDefaults = {}
) => {
  const shape = table?.shape === 'circle' ? 'circle' : 'rect';
  const rectWidth = defaults.rectWidth ?? 80;
  const rectHeight = defaults.rectHeight ?? 50;
  const circleRadius = defaults.circleRadius ?? 28;
  const radius =
    isFiniteNumber(table?.radius) && table.radius > 0 ? table.radius : circleRadius;
  const w =
    isFiniteNumber(table?.w) && table.w > 0
      ? table.w
      : shape === 'circle'
        ? radius * 2
        : rectWidth;
  const h =
    isFiniteNumber(table?.h) && table.h > 0
      ? table.h
      : shape === 'circle'
        ? radius * 2
        : rectHeight;
  const x = isFiniteNumber(table?.x) ? table.x : 0;
  const y = isFiniteNumber(table?.y) ? table.y : 0;
  const rot = isFiniteNumber(table?.rot) ? table.rot : 0;

  return { x, y, rot, w, h, radius, shape };
};

export type TableGeometry = {
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  radius?: number | null;
};

export type ScaleResult =
  | { didScale: true; geometry: TableGeometry }
  | {
      didScale: false;
      geometry: TableGeometry;
      reason: 'invalid-dims' | 'unsafe-scale' | 'missing-geometry';
    };

export const normalizeTableGeometryToFloorplan = (
  table: TableGeometry,
  fromDims: { width: number; height: number },
  toDims: { width: number; height: number }
) => {
  if (!fromDims.width || !fromDims.height || !toDims.width || !toDims.height) {
    return { ...table };
  }
  const scaleX = toDims.width / fromDims.width;
  const scaleY = toDims.height / fromDims.height;
  const next: TableGeometry = { ...table };
  if (isFiniteNumber(table.x)) {
    next.x = table.x * scaleX;
  }
  if (isFiniteNumber(table.y)) {
    next.y = table.y * scaleY;
  }
  if (isFiniteNumber(table.w)) {
    next.w = table.w * scaleX;
  }
  if (isFiniteNumber(table.h)) {
    next.h = table.h * scaleY;
  }
  if (isFiniteNumber(table.radius)) {
    next.radius = table.radius * Math.min(scaleX, scaleY);
  }
  return next;
};

export const scaleTableGeometry = (
  geometry: TableGeometry,
  fromDims: { width: number; height: number },
  toDims: { width: number; height: number }
): ScaleResult => {
  if (!isSaneDims(fromDims) || !isSaneDims(toDims)) {
    return { geometry, didScale: false, reason: 'invalid-dims' };
  }
  const scaleX = toDims.width / fromDims.width;
  const scaleY = toDims.height / fromDims.height;
  if (!safeScaleOk(scaleX, scaleY)) {
    return { geometry, didScale: false, reason: 'unsafe-scale' };
  }
  const hasGeometry =
    isFiniteNumber(geometry.x) ||
    isFiniteNumber(geometry.y) ||
    isFiniteNumber(geometry.w) ||
    isFiniteNumber(geometry.h) ||
    isFiniteNumber(geometry.radius);
  if (!hasGeometry) {
    return { geometry, didScale: false, reason: 'missing-geometry' };
  }
  const next: TableGeometry = { ...geometry };
  if (isFiniteNumber(geometry.x)) {
    next.x = geometry.x * scaleX;
  }
  if (isFiniteNumber(geometry.y)) {
    next.y = geometry.y * scaleY;
  }
  if (isFiniteNumber(geometry.w)) {
    next.w = geometry.w * scaleX;
  }
  if (isFiniteNumber(geometry.h)) {
    next.h = geometry.h * scaleY;
  }
  if (isFiniteNumber(geometry.radius)) {
    next.radius = geometry.radius * Math.min(scaleX, scaleY);
  }
  return { geometry: next, didScale: true };
};
