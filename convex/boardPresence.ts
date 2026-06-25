import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

const STALE_MS = 10_000;

export const heartbeat = mutation({
  args: { boardId: v.id("boards"), x: v.number(), y: v.number() },
  handler: async (ctx, { boardId, x, y }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const board = await ctx.db.get("boards", boardId);
    if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
    const existing = await ctx.db
      .query("boardPresence")
      .withIndex("by_user_board", (q) => q.eq("userId", userId).eq("boardId", boardId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("boardPresence", existing._id, { x, y, updatedAt: now });
    } else {
      await ctx.db.insert("boardPresence", { orgId, boardId, userId, x, y, updatedAt: now });
    }
  },
});

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const board = await ctx.db.get("boards", boardId);
    if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
    const cutoff = Date.now() - STALE_MS;
    // One row per active user — bounded by org membership, so collect() is safe here.
    const rows = await ctx.db
      .query("boardPresence")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const others = rows.filter((r) => r.userId !== userId && r.updatedAt >= cutoff);
    const withNames = await Promise.all(
      others.map(async (r) => {
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user", (q) => q.eq("userId", r.userId))
          .unique();
        const user = await ctx.db.get("users", r.userId);
        return {
          userId: r.userId,
          x: r.x,
          y: r.y,
          name: profile?.displayName ?? user?.email ?? "Användare",
        };
      }),
    );
    return withNames;
  },
});
