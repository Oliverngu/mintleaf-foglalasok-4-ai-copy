import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { computeTransformFromViewportRect } from '../../../../core/utils/seatingFloorplanRender';
import { useViewportRect } from '../../../hooks/useViewportRect';

const GRID_SPACING = 24;
const gridBackgroundStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.45) 1px, transparent 1px)',
  backgroundSize: `${GRID_SPACING}px ${GRID_SPACING}px`,
  backgroundPosition: '0 0',
};

export type FloorplanViewportDims = {
  width: number;
  height: number;
  source?: string;
};

export type FloorplanViewportContext = {
  floorplanDims: FloorplanViewportDims;
  viewportRect: { width: number; height: number };
  transform: {
    scale: number;
    offsetX: number;
    offsetY: number;
    rectWidth: number;
    rectHeight: number;
    ready: boolean;
  };
};

export type FloorplanViewportHandle = {
  centerOnRect: (
    rect: { x: number; y: number; w: number; h: number },
    options?: { targetScale?: number; padding?: number }
  ) => void;
  getTransform: () => FloorplanViewportContext['transform'];
};

type FloorplanViewportCanvasProps = {
  floorplanDims: FloorplanViewportDims;
  debugEnabled?: boolean;
  debugOverlay?: (context: FloorplanViewportContext) => React.ReactNode;
  renderOverlay?: (context: FloorplanViewportContext) => React.ReactNode;
  renderWorld: (context: FloorplanViewportContext) => React.ReactNode;
  viewportDeps?: ReadonlyArray<unknown>;
};

const FloorplanViewportCanvas = React.forwardRef<
  FloorplanViewportHandle,
  FloorplanViewportCanvasProps
>(({
  floorplanDims,
  debugEnabled = false,
  debugOverlay,
  renderOverlay,
  renderWorld,
  viewportDeps = [],
}, ref) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transformOverride, setTransformOverride] =
    useState<FloorplanViewportContext['transform'] | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
const viewportRect = useViewportRect(viewportRef, {
  retryFrames: 80,
  deps: viewportDeps,
});

// mindig “lokális” rect-et adjunk tovább (0,0 origóval)
const normalizedViewportRect = useMemo(
  () => ({
    width: viewportRect.width,
    height: viewportRect.height,
    left: 0,
    top: 0,
  }),
  [viewportRect.width, viewportRect.height]
);

const transform = useMemo(
  () =>
    computeTransformFromViewportRect(
      normalizedViewportRect,
      floorplanDims.width,
      floorplanDims.height
    ),
  [floorplanDims.width, floorplanDims.height, normalizedViewportRect]
);

const activeTransform = transformOverride ?? transform;

const context = useMemo(
  () => ({
    floorplanDims,
    viewportRect: normalizedViewportRect,
    transform: activeTransform,
  }),
  [floorplanDims, normalizedViewportRect, activeTransform]
);

const centerOnRect = (
  rect: { x: number; y: number; w: number; h: number },
  options: { targetScale?: number; padding?: number } = {}
) => {
  if (normalizedViewportRect.width <= 0 || normalizedViewportRect.height <= 0) return;
  if (!Number.isFinite(rect.w) || !Number.isFinite(rect.h) || rect.w <= 0 || rect.h <= 0) return;
  const padding = typeof options.padding === 'number' ? Math.max(0, options.padding) : 0.2;
  const paddedW = rect.w * (1 + padding * 2);
  const paddedH = rect.h * (1 + padding * 2);
  const baseScale = Math.min(
    normalizedViewportRect.width / paddedW,
    normalizedViewportRect.height / paddedH
  );
  const requestedScale = typeof options.targetScale === 'number' ? options.targetScale : baseScale;
  const scale = Math.min(2.5, Math.max(0.4, requestedScale));
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  const offsetX = normalizedViewportRect.width / 2 - centerX * scale;
  const offsetY = normalizedViewportRect.height / 2 - centerY * scale;
  setTransformOverride({
    scale,
    offsetX,
    offsetY,
    rectWidth: normalizedViewportRect.width,
    rectHeight: normalizedViewportRect.height,
    ready: true,
  });
  setIsAnimating(true);
  window.setTimeout(() => setIsAnimating(false), 220);
};

useImperativeHandle(ref, () => ({
  centerOnRect,
  getTransform: () => activeTransform,
}));

useEffect(() => {
  setTransformOverride(null);
}, [floorplanDims.width, floorplanDims.height, normalizedViewportRect.width, normalizedViewportRect.height]);

  return (
  <div className="w-full max-w-[min(90vh,100%)] mx-auto overflow-hidden min-w-0 min-h-0">
    <div
      ref={viewportRef}
      className="relative w-full overflow-hidden border border-gray-200 rounded-xl bg-white/80"
      style={{
        aspectRatio:
          floorplanDims.width > 0 && floorplanDims.height > 0
            ? `${floorplanDims.width} / ${floorplanDims.height}`
            : '1 / 1',
      }}
    >
        {debugEnabled && debugOverlay ? debugOverlay(context) : null}
        {renderOverlay ? renderOverlay(context) : null}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${activeTransform.offsetX}px, ${activeTransform.offsetY}px) scale(${activeTransform.scale})`,
            transformOrigin: 'top left',
            transition: isAnimating ? 'transform 200ms ease' : undefined,
          }}
        >
          <div className="relative" style={{ width: floorplanDims.width, height: floorplanDims.height }}>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                width: floorplanDims.width,
                height: floorplanDims.height,
                zIndex: 0,
                ...gridBackgroundStyle,
              }}
            />
            {renderWorld(context)}
          </div>
        </div>
      </div>
    </div>
  );
});

FloorplanViewportCanvas.displayName = 'FloorplanViewportCanvas';

export default FloorplanViewportCanvas;
