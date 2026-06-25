import { expect, test } from "vitest";
import { screenToWorld, worldToScreen, zoomAt, clampZoom, normalizeRect } from "./board";

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
