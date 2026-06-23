// Pure date/zoom math for the roadmap timeline. No DOM, no Convex — unit-testable.
// All dates are "YYYY-MM-DD" strings interpreted as UTC midnight.

const MS_PER_DAY = 86400000;

// Zoom levels expressed as pixels-per-day, most zoomed out first.
export const ZOOM_LEVELS = [2, 4, 8, 16, 32] as const;
export const DEFAULT_ZOOM_INDEX = 2; // 8 px/day

// Approximate milestone card footprint (card width + gutter) used by auto-arrange
// to decide whether two milestones can share a row without overlapping.
export const CARD_WIDTH_PX = 165;

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

// Padded [startDate, endDate] window that always includes `today` plus every
// milestone date, with margin on both sides.
export function timelineWindow(dates: string[], today: string): { startDate: string; endDate: string } {
  const all = [today, ...dates];
  const min = all.reduce((a, b) => (a < b ? a : b));
  const max = all.reduce((a, b) => (a > b ? a : b));
  return { startDate: addDays(min, -30), endDate: addDays(max, 60) };
}

// Assign each milestone the lowest row (lane) in which its card does not overlap
// another card already placed in that row. Processed in date order; two cards
// overlap when their x positions are closer than `cardWidthPx`.
export function autoArrange(
  items: { id: string; datum: string }[],
  startDate: string,
  pxPerDay: number,
  cardWidthPx: number,
): { id: string; lane: number }[] {
  const sorted = [...items].sort((a, b) => a.datum.localeCompare(b.datum));
  const laneLastX: number[] = []; // rightmost card x placed in each lane so far
  return sorted.map((it) => {
    const x = dateToX(it.datum, startDate, pxPerDay);
    let lane = laneLastX.findIndex((rx) => x - rx >= cardWidthPx);
    if (lane === -1) lane = laneLastX.length;
    laneLastX[lane] = x;
    return { id: it.id, lane };
  });
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
