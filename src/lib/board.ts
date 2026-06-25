export type Point = { x: number; y: number };
export type Viewport = { panX: number; panY: number; zoom: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// world -> screen (screen = world * zoom + pan)
export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.panX, y: p.y * vp.zoom + vp.panY };
}

// screen -> world (world = (screen - pan) / zoom)
export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.panX) / vp.zoom, y: (p.y - vp.panY) / vp.zoom };
}

// Multiply zoom by `factor`, keeping the world point under `cursor` (screen coords) fixed.
export function zoomAt(vp: Viewport, cursor: Point, factor: number): Viewport {
  const nextZoom = clampZoom(vp.zoom * factor);
  const world = screenToWorld(cursor, vp);
  return {
    zoom: nextZoom,
    panX: cursor.x - world.x * nextZoom,
    panY: cursor.y - world.y * nextZoom,
  };
}

// Normalize a possibly-negative drag rectangle to a top-left origin with positive size.
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}
