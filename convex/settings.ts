import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

const DEFAULTS = { archiveDays: 3, pileThreshold: 3 };

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const row = await ctx.db.query("settings").first();
    const base = row
      ? { archiveDays: row.archiveDays, pileThreshold: row.pileThreshold }
      : DEFAULTS;
    // Surfaced so members can share the invite code; everyone here is already
    // a full member of the shared workspace.
    return { ...base, signupCode: process.env.SIGNUP_CODE ?? null };
  },
});

export const set = mutation({
  args: { archiveDays: v.number(), pileThreshold: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    // Clamp server-side so the invariant holds regardless of caller.
    const clean = {
      archiveDays: Math.max(0, args.archiveDays),
      pileThreshold: Math.max(0, args.pileThreshold),
    };
    const row = await ctx.db.query("settings").first();
    if (row) await ctx.db.patch("settings", row._id, clean);
    else await ctx.db.insert("settings", clean);
  },
});
