import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

const DEFAULTS = { archiveDays: 3, pileThreshold: 3 };

export const get = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    const base = row
      ? { archiveDays: row.archiveDays, pileThreshold: row.pileThreshold }
      : DEFAULTS;
    const org = await ctx.db.get("organizations", orgId);
    return { ...base, joinCode: org?.joinCode ?? null };
  },
});

export const set = mutation({
  args: { archiveDays: v.number(), pileThreshold: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    // Clamp server-side so the invariant holds regardless of caller.
    const clean = {
      archiveDays: Math.max(0, args.archiveDays),
      pileThreshold: Math.max(0, args.pileThreshold),
    };
    const row = await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (row) await ctx.db.patch("settings", row._id, clean);
    else await ctx.db.insert("settings", { ...clean, orgId });
  },
});
