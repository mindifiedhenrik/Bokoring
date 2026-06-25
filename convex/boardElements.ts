import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";
import { Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";

const kindValidator = v.union(
  v.literal("note"),
  v.literal("text"),
  v.literal("line"),
  v.literal("rect"),
  v.literal("circle"),
);

async function requireBoard(ctx: QueryCtx, orgId: Id<"organizations">, boardId: Id<"boards">) {
  const board = await ctx.db.get("boards", boardId);
  if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
  return board;
}

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { orgId } = await requireOrg(ctx);
    await requireBoard(ctx, orgId, boardId);
    const rows = await ctx.db
      .query("boardElements")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    kind: kindValidator,
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    text: v.optional(v.string()),
    color: v.string(),
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    await requireBoard(ctx, orgId, args.boardId);
    return await ctx.db.insert("boardElements", { ...args, orgId, order: args.order ?? Date.now() });
  },
});

export const update = mutation({
  args: {
    id: v.id("boardElements"),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    text: v.optional(v.string()),
    color: v.optional(v.string()),
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boardElements", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Elementet saknas");
    // Drop undefined keys so patch only touches provided fields.
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch("boardElements", id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("boardElements") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boardElements", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Elementet saknas");
    await ctx.db.delete("boardElements", id);
  },
});
