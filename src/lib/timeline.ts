// Pure date/zoom math for the roadmap timeline. No DOM, no Convex — unit-testable.
// All dates are "YYYY-MM-DD" strings interpreted as UTC midnight.

const MS_PER_DAY = 86400000;

// Zoom levels expressed as pixels-per-day, most zoomed out first.
export const ZOOM_LEVELS = [2, 4, 8, 16, 32] as const;
export const DEFAULT_ZOOM_INDEX = 2; // 8 px/day

// Whole days from a to b (b - a). Can be negative.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / MS_PER_DAY);
}

// Add (or subtract) whole days, returning a "YYYY-MM-DD" string.
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// Horizontal pixel offset of `date` from `startDate`.
export function dateToX(date: string, startDate: string, pxPerDay: number): number {
  return daysBetween(startDate, date) * pxPerDay;
}

// Inverse of dateToX: the date at pixel offset `x` from `startDate`.
export function xToDate(x: number, startDate: string, pxPerDay: number): string {
  return addDays(startDate, Math.round(x / pxPerDay));
}

// Clamp a zoom index into the valid ZOOM_LEVELS range.
export function clampZoomIndex(i: number): number {
  return Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
}

// First-of-month dates within [startDate, endDate] inclusive.
export function monthTicks(startDate: string, endDate: string): string[] {
  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  const s = new Date(startMs);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  let cur = Date.UTC(y, m, 1);
  if (cur < startMs) {
    m++;
    if (m > 11) { m = 0; y++; }
    cur = Date.UTC(y, m, 1);
  }
  const ticks: string[] = [];
  while (cur <= endMs) {
    ticks.push(new Date(cur).toISOString().slice(0, 10));
    m++;
    if (m > 11) { m = 0; y++; }
    cur = Date.UTC(y, m, 1);
  }
  return ticks;
}
