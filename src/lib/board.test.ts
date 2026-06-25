import { expect, test } from "vitest";
import { screenToWorld, worldToScreen, zoomAt, clampZoom, normalizeRect, elementBounds, rectsIntersect, isDarkColor } from "./board";

test("isDarkColor picks dark vs light backgrounds", () => {
  expect(isDarkColor("#1f1b16")).toBe(true); // the palette's near-black
  expect(isDarkColor("#000000")).toBe(true);
  expect(isDarkColor("#ffe9a8")).toBe(false); // light yellow note
  expect(isDarkColor("#bbdefb")).toBe(false); // light blue
  expect(isDarkColor("#ffffff")).toBe(false);
});

test("worldToScreen and screenToWorld round-trip", () => {
  const vp = { panX: 30, panY: -12, zoom: 1.5 };
  const world = { x: 40, y: 80 };
  const screen = worldToScreen(world, vp);
  expect(screenToWorld(screen, vp)).toEqual(world);
});

test("zoomAt keeps the point under the cursor fixed", () => {
  const vp = { panX: 0, panY: 0, zoom: 1 };
  const cursor = { x: 200, y: 100 };
  const before = screenToWorld(cursor, vp);
  const next = zoomAt(vp, cursor, 2); // zoom in 2x at the cursor
  const after = screenToWorld(cursor, next);
  expect(after.x).toBeCloseTo(before.x, 6);
  expect(after.y).toBeCloseTo(before.y, 6);
  expect(next.zoom).toBe(2);
});

test("clampZoom bounds the zoom factor", () => {
  expect(clampZoom(0.01)).toBe(0.2);
  expect(clampZoom(99)).toBe(4);
  expect(clampZoom(1)).toBe(1);
});

test("normalizeRect turns a negative-size drag into a positive rect", () => {
  expect(normalizeRect({ x: 100, y: 100, w: -40, h: -20 })).toEqual({
    x: 60, y: 80, w: 40, h: 20,
  });
});

test("elementBounds returns the box for a rect as-is", () => {
  expect(elementBounds({ kind: "rect", x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 10, y: 20, w: 30, h: 40 });
});

test("elementBounds normalizes a negative-vector line", () => {
  expect(elementBounds({ kind: "line", x: 100, y: 100, w: -40, h: -20 })).toEqual({ x: 60, y: 80, w: 40, h: 20 });
});

test("rectsIntersect detects overlap and separation", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
  expect(rectsIntersect(a, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
});

test("rectsIntersect treats edge-only touching as non-overlap", () => {
  expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
});
