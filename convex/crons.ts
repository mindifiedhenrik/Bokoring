import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY_MS = 86400000;

// Archive Done tasks whose last move is older than the configured threshold.
export const archiveStaleDone = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    const days = settings?.archiveDays ?? 3;
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * DAY_MS;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "Done"))
      .collect();
    for (const t of tasks) {
      if (t.archived) continue;
      const lastTs = t.log.length
        ? new Date(t.log[t.log.length - 1].ts).getTime()
        : t._creationTime;
      if (lastTs <= cutoff) {
        const now = new Date().toISOString();
        await ctx.db.patch("tasks", t._id, {
          archived: true,
          archivedAt: now,
          log: [...t.log, { ts: now, archived: true }],
        });
      }
    }
  },
});

const crons = cronJobs();
crons.interval("archive stale done tasks", { hours: 24 }, internal.crons.archiveStaleDone, {});
export default crons;
