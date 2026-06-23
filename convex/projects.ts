import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, PROJECT_COLORS } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: { namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    // Pick the first palette color not already in use within this org.
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const used = new Set(existing.map((p) => p.color));
    const color =
      PROJECT_COLORS.find((c) => !used.has(c)) ??
      PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
    return await ctx.db.insert("projects", { ...args, orgId, color, order: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("projects"), namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Projekt saknas");
    await ctx.db.patch("projects", id, patch);
  },
});

export const reorder = mutation({
  args: { id: v.id("projects"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("projects", id, { order });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) return;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const t of tasks) await ctx.db.delete("tasks", t._id);
    await ctx.db.delete("projects", id);
  },
});
