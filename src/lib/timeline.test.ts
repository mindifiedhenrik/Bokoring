import { expect, test } from "vitest";
import { addDays, clampZoomIndex, dateToX, daysBetween, monthTicks, xToDate, ZOOM_LEVELS } from "./timeline";

test("daysBetween counts whole days, signed", () => {
  expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
  expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
});

test("addDays moves forward and backward", () => {
  expect(addDays("2026-01-01", 10)).toBe("2026-01-11");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
});

test("dateToX and xToDate are inverses, rounding to nearest day", () => {
  expect(dateToX("2026-01-11", "2026-01-01", 8)).toBe(80);
  expect(xToDate(80, "2026-01-01", 8)).toBe("2026-01-11");
  expect(xToDate(83, "2026-01-01", 8)).toBe("2026-01-11");
});

test("clampZoomIndex stays within ZOOM_LEVELS", () => {
  expect(clampZoomIndex(-5)).toBe(0);
  expect(clampZoomIndex(99)).toBe(ZOOM_LEVELS.length - 1);
  expect(clampZoomIndex(2)).toBe(2);
});

test("monthTicks lists first-of-month dates within range", () => {
  expect(monthTicks("2026-01-15", "2026-04-02")).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  expect(monthTicks("2026-01-01", "2026-02-01")).toEqual(["2026-01-01", "2026-02-01"]);
});
