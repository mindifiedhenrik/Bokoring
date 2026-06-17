import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("tasks").order("asc").collect();
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  projectId: v.id("projects"),
  status: v.string(),
  agare: v.string(),
  prioritet: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.status }];
    return await ctx.db.insert("tasks", { ...args, archived: false, log });
  },
});

export const update = mutation({
  args: { id: v.id("tasks"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev) throw new Error("Uppgift saknas");
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== patch.projectId) {
      const fromP = await ctx.db.get("projects", prev.projectId);
      const toP = await ctx.db.get("projects", patch.projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== patch.status) {
      log.push({ ts, from: prev.status, to: patch.status });
    }
    await ctx.db.patch("tasks", id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("tasks"), projectId: v.id("projects"), status: v.string() },
  handler: async (ctx, { id, projectId, status }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev) return;
    if (prev.projectId === projectId && prev.status === status) return;
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== projectId) {
      const fromP = await ctx.db.get("projects", prev.projectId);
      const toP = await ctx.db.get("projects", projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== status) {
      log.push({ ts, from: prev.status, to: status });
    }
    await ctx.db.patch("tasks", id, { projectId, status, log });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete("tasks", id);
  },
});

export const restore = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev) return;
    const log = [...prev.log, { ts: new Date().toISOString(), restored: true }];
    await ctx.db.patch("tasks", id, { archived: false, archivedAt: null, log });
  },
});
