import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("milestones")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort(
      (a, b) => a.datum.localeCompare(b.datum) || (a.order ?? a._creationTime) - (b.order ?? b._creationTime),
    );
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  datum: v.string(),
  color: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.datum }];
    return await ctx.db.insert("milestones", { ...args, orgId, taskIds: [], log, order: Date.now() });
  },
});
