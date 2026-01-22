export type FloorplanTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
};

export function computeFloorplanTransformFromRect(
  rect: { width: number; height: number; left?: number; top?: number },
  width: number,
  height: number
): FloorplanTransform {
  const rectWidth = rect?.width ?? 0;
  const rectHeight = rect?.height ?? 0;
  const rectLeft = rect?.left ?? 0;
  const rectTop = rect?.top ?? 0;
  if (rectWidth <= 0 || rectHeight <= 0) {
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rectLeft: 0,
      rectTop: 0,
      rectWidth: 0,
      rectHeight: 0,
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
    rectLeft: Number.isFinite(rectLeft) ? rectLeft : 0,
    rectTop: Number.isFinite(rectTop) ? rectTop : 0,
    rectWidth,
    rectHeight,
  };
}
