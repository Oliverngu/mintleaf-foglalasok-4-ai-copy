export type TableVisualState = 'free' | 'occupied' | 'unknown';

export const getTableVisualState = (): TableVisualState => 'unknown';

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const isRectIntersecting = (a: Rect, b: Rect): boolean => {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};
