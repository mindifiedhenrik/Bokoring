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

// Minimal shape needed to compute a bounding box (a subset of a board element).
type BoundsInput = { kind: string; x: number; y: number; w: number; h: number };

// World-space bounding box of an element. Lines store a vector (possibly negative),
// so normalize them; other kinds already store a positive-size box.
export function elementBounds(el: BoundsInput): Rect {
  if (el.kind === "line") return normalizeRect({ x: el.x, y: el.y, w: el.w, h: el.h });
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

// Axis-aligned overlap test. Edge-only touching counts as non-overlap.
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// True when a hex color is dark enough that light text reads better on it. Used to flip a
// note's text to white on dark backgrounds. Unparseable input falls back to "not dark".
export function isDarkColor(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length < 6) return false;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return false;
  // Perceived (luma) brightness, 0–1.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
