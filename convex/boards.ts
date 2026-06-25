import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("boards")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db.insert("boards", { orgId, namn, order: Date.now() });
  },
});

export const rename = mutation({
  args: { id: v.id("boards"), namn: v.string() },
  handler: async (ctx, { id, namn }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boards", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Tavla saknas");
    await ctx.db.patch("boards", id, { namn });
  },
});

async function deleteByBoard(
  ctx: { db: any },
  table: "boardElements" | "boardPresence",
  boardId: Id<"boards">,
) {
  // Batch-delete to stay within transaction limits (Convex queries have no .delete()).
  while (true) {
    const batch = await ctx.db
      .query(table)
      .withIndex("by_board", (q: any) => q.eq("boardId", boardId))
      .take(100);
    if (batch.length === 0) break;
    for (const row of batch) await ctx.db.delete(table, row._id);
    if (batch.length < 100) break;
  }
}

export const remove = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boards", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Tavla saknas");
    await deleteByBoard(ctx, "boardElements", id);
    await deleteByBoard(ctx, "boardPresence", id);
    await ctx.db.delete("boards", id);
  },
});
