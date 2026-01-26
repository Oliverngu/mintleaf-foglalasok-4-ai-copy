import { Floorplan, Table } from '../models/data';
import { normalizeTableGeometry } from './seatingNormalize';

type FloorplanLike = Pick<Floorplan, 'width' | 'height'> | null | undefined;

type CanonicalDims = {
  width: number;
  height: number;
  source: 'floorplan' | 'tables' | 'fallback';
};

type ViewportRect = {
  width: number;
  height: number;
};

type TableGeometryDefaults = {
  rectWidth?: number;
  rectHeight?: number;
  circleRadius?: number;
};

type TableGeometry = ReturnType<typeof normalizeTableGeometry>;
type GeometryLike = Pick<TableGeometry, 'x' | 'y' | 'w' | 'h'>;

type FloorplanTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rectWidth: number;
  rectHeight: number;
  ready: boolean;
};

/**
 * Detect normalized POSITION (x/y).
 * IMPORTANT: w/h can be stored in pixels while x/y is normalized.
 */
export const looksNormalized = (
  geometry: GeometryLike,
  floorplanDims: { width: number; height: number }
) => {
  if (floorplanDims.width <= 10 || floorplanDims.height <= 10) {
    return false;
  }
  const within = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1.5;
  return within(geometry.x) && within(geometry.y);
};

const looksSizeNormalized = (geometry: GeometryLike) => {
  const within = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1.5;
  return within(geometry.w) && within(geometry.h);
};

const looksRadiusNormalized = (radius: unknown) => {
  const r = Number(radius);
  return Number.isFinite(r) && r >= 0 && r <= 1.5;
};

export const resolveCanonicalFloorplanDims = (
  floorplan: FloorplanLike,
  tables: Table[] = []
): CanonicalDims => {
  const width = Number(floorplan?.width);
  const height = Number(floorplan?.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height, source: 'floorplan' };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasTables = false;

  tables.forEach(table => {
    const geometry = normalizeTableGeometry(table);
    if (
      !Number.isFinite(geometry.x) ||
      !Number.isFinite(geometry.y) ||
      !Number.isFinite(geometry.w) ||
      !Number.isFinite(geometry.h)
    ) {
      return;
    }
    const left = geometry.x;
    const top = geometry.y;
    const right = geometry.x + geometry.w;
    const bottom = geometry.y + geometry.h;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
    hasTables = true;
  });

  if (hasTables && Number.isFinite(minX) && Number.isFinite(minY)) {
    const computedWidth = Math.max(1, maxX - minX);
    const computedHeight = Math.max(1, maxY - minY);
    return {
      width: Number.isFinite(computedWidth) ? computedWidth : 1,
      height: Number.isFinite(computedHeight) ? computedHeight : 1,
      source: 'tables',
    };
  }

  return { width: 1, height: 1, source: 'fallback' };
};

export const resolveTableGeometryInFloorplanSpace = (
  table: Table,
  floorplanDims: { width: number; height: number },
  defaults: TableGeometryDefaults = {}
) => {
  const geometry = normalizeTableGeometry(table, defaults);

  const posNorm = looksNormalized(geometry, floorplanDims);
  if (!posNorm) {
    return geometry;
  }

  const sizeNorm = looksSizeNormalized(geometry);
  const radiusNorm = looksRadiusNormalized((geometry as any).radius);

  const scaleRadius = Math.min(floorplanDims.width, floorplanDims.height);

  return {
    ...geometry,
    // position always scaled when normalized
    x: geometry.x * floorplanDims.width,
    y: geometry.y * floorplanDims.height,

    // size scaled only if it is normalized too
    w: sizeNorm ? geometry.w * floorplanDims.width : geometry.w,
    h: sizeNorm ? geometry.h * floorplanDims.height : geometry.h,

    // radius scaled only if it is normalized
    radius: radiusNorm ? (geometry as any).radius * scaleRadius : (geometry as any).radius,
  };
};

export const resolveTableRenderPosition = (
  geometry: TableGeometry,
  floorplanDims: { width: number; height: number },
  draft?: { x: number; y: number } | null
) => {
  const baseX = draft?.x ?? geometry.x;
  const baseY = draft?.y ?? geometry.y;
  const maxX = Math.max(0, floorplanDims.width - geometry.w);
  const maxY = Math.max(0, floorplanDims.height - geometry.h);
  return {
    x: Math.min(Math.max(baseX, 0), maxX),
    y: Math.min(Math.max(baseY, 0), maxY),
  };
};

export const computeTransformFromViewportRect = (
  rect: ViewportRect,
  width: number,
  height: number
): FloorplanTransform => {
  const rectWidth = rect?.width ?? 0;
  const rectHeight = rect?.height ?? 0;
  if (rectWidth <= 0 || rectHeight <= 0 || width <= 0 || height <= 0) {
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rectWidth: Math.max(0, rectWidth),
      rectHeight: Math.max(0, rectHeight),
      ready: false,
    };
  }
  const rawScale = Math.min(rectWidth / width, rectHeight / height);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const offsetX = (rectWidth - width * scale) / 2;
  const offsetY = (rectHeight - height * scale) / 2;
  return {
    scale,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    rectWidth,
    rectHeight,
    ready: true,
  };
};
