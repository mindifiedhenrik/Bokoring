import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, PROJECT_COLORS } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("projects").order("asc").collect();
  },
});

export const create = mutation({
  args: { namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    // Pick the first palette color not already in use (avoids repeats until the palette is exhausted).
    const existing = await ctx.db.query("projects").collect();
    const used = new Set(existing.map((p) => p.color));
    const color =
      PROJECT_COLORS.find((c) => !used.has(c)) ??
      PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
    return await ctx.db.insert("projects", { ...args, color });
  },
});

export const update = mutation({
  args: { id: v.id("projects"), namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    await ctx.db.patch("projects", id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const t of tasks) await ctx.db.delete("tasks", t._id);
    await ctx.db.delete("projects", id);
  },
});
