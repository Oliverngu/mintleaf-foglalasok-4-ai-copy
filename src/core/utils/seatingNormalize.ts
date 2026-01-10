import { Floorplan, Table } from '../models/data';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

type TableGeometryDefaults = {
  rectWidth?: number;
  rectHeight?: number;
  circleRadius?: number;
};

export const normalizeFloorplanDimensions = (
  floorplan?: Pick<Floorplan, 'width' | 'height'> | null
) => {
  const width =
    isFiniteNumber(floorplan?.width) && floorplan.width > 0 ? floorplan.width : 800;
  const height =
    isFiniteNumber(floorplan?.height) && floorplan.height > 0 ? floorplan.height : 500;
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
