import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

const DEFAULTS = { archiveDays: 3, pileThreshold: 3 };

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const row = await ctx.db.query("settings").first();
    return row
      ? { archiveDays: row.archiveDays, pileThreshold: row.pileThreshold }
      : DEFAULTS;
  },
});

export const set = mutation({
  args: { archiveDays: v.number(), pileThreshold: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const row = await ctx.db.query("settings").first();
    if (row) await ctx.db.patch("settings", row._id, args);
    else await ctx.db.insert("settings", args);
  },
});
