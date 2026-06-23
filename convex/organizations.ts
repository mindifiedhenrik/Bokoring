import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const findByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim()))
      .first();
  },
});
