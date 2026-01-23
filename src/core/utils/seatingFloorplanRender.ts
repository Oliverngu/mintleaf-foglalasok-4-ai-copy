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

type FloorplanTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rectWidth: number;
  rectHeight: number;
  ready: boolean;
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
