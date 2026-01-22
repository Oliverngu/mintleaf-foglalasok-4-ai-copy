import { computeFloorplanTransformFromRect } from './seatingFloorplanTransform';

export type CanonicalFloorplanRenderContext = {
  sx: number;
  sy: number;
  offsetX: number;
  offsetY: number;
  ready: boolean;
};

export const computeCanonicalFloorplanRenderContext = (
  rect: { width: number; height: number; left?: number; top?: number },
  logicalWidth: number,
  logicalHeight: number
): CanonicalFloorplanRenderContext => {
  if (
    !Number.isFinite(rect?.width) ||
    !Number.isFinite(rect?.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(logicalWidth) ||
    !Number.isFinite(logicalHeight) ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return { sx: 1, sy: 1, offsetX: 0, offsetY: 0, ready: false };
  }
  const transform = computeFloorplanTransformFromRect(rect, logicalWidth, logicalHeight);
  return {
    sx: transform.scale,
    sy: transform.scale,
    offsetX: transform.offsetX,
    offsetY: transform.offsetY,
    ready: transform.rectWidth > 0 && transform.rectHeight > 0,
  };
};
