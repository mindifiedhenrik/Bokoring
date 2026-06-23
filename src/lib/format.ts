type LogEntry = { ts: string; from?: string | null; to?: string; archived?: boolean; restored?: boolean; fromProject?: string; toProject?: string };
type WithLog = { log?: LogEntry[]; _creationTime?: number };

export function initials(name?: string) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
export function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return d; }
}
export function fmtTimestamp(ts: string) {
  try { return new Date(ts).toLocaleString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
}
export function lastMovedTs(t: WithLog) {
  const log = t.log ?? [];
  if (log.length) return new Date(log[log.length - 1].ts).getTime();
  return t._creationTime ?? Date.now();
}
export function daysSinceMove(t: WithLog) {
  return Math.max(0, Math.floor((Date.now() - lastMovedTs(t)) / 86400000));
}

// Date-proximity colour shared by contact reminders and roadmap milestone flags:
// red once the date has passed, yellow within two weeks, green further out.
export function dateProximityColor(datum: string, today?: string): "red" | "yellow" | "green" {
  const ref = today ?? new Date().toISOString().slice(0, 10);
  const days = Math.round((new Date(datum).getTime() - new Date(ref).getTime()) / 86400000);
  if (days < 0) return "red";
  if (days <= 14) return "yellow";
  return "green";
}
