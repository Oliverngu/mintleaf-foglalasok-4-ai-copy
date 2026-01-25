import React, { useMemo, useRef } from 'react';
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

type FloorplanViewportCanvasProps = {
  floorplanDims: FloorplanViewportDims;
  debugEnabled?: boolean;
  debugOverlay?: (context: FloorplanViewportContext) => React.ReactNode;
  renderWorld: (context: FloorplanViewportContext) => React.ReactNode;
  viewportDeps?: ReadonlyArray<unknown>;
};

const FloorplanViewportCanvas: React.FC<FloorplanViewportCanvasProps> = ({
  floorplanDims,
  debugEnabled = false,
  debugOverlay,
  renderWorld,
  viewportDeps = [],
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
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

const context = useMemo(
  () => ({
    floorplanDims,
    viewportRect: normalizedViewportRect,
    transform,
  }),
  [floorplanDims, normalizedViewportRect, transform]
);

  return (
    <div className="w-full max-w-[min(90vh,100%)] aspect-square mx-auto overflow-hidden min-w-0 min-h-0">
      <div
        ref={viewportRef}
        className="relative h-full w-full border border-gray-200 rounded-xl bg-white/80"
      >
        {debugEnabled && debugOverlay ? debugOverlay(context) : null}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
            transformOrigin: 'top left',
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
};

export default FloorplanViewportCanvas;
