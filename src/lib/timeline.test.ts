import { expect, test } from "vitest";
import { addDays, autoArrange, clampZoomIndex, dateToX, daysBetween, monthTicks, timelineWindow, xToDate, ZOOM_LEVELS } from "./timeline";

test("timelineWindow pads 30 days before the earliest and 60 after the latest", () => {
  expect(timelineWindow(["2026-03-01", "2026-05-01"], "2026-04-01")).toEqual({
    startDate: "2026-01-30",
    endDate: "2026-06-30",
  });
});

test("autoArrange packs non-overlapping milestones into the lowest free lane", () => {
  const items = [
    { id: "a", datum: "2026-01-01" },
    { id: "b", datum: "2026-01-05" }, // 40px from a (<100) -> new lane
    { id: "c", datum: "2026-01-20" }, // 190px from a (>=100) -> back to lane 0
  ];
  expect(autoArrange(items, "2026-01-01", 10, 100)).toEqual([
    { id: "a", lane: 0 },
    { id: "b", lane: 1 },
    { id: "c", lane: 0 },
  ]);
});

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
