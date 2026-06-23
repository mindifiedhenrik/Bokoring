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

export const update = mutation({
  args: { id: v.id("milestones"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("milestones", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Milstolpe saknas");
    const log = [...prev.log];
    if (prev.datum !== patch.datum) {
      log.push({ ts: new Date().toISOString(), from: prev.datum, to: patch.datum });
    }
    await ctx.db.patch("milestones", id, { ...patch, log });
  },
});

export const setDate = mutation({
  args: { id: v.id("milestones"), datum: v.string() },
  handler: async (ctx, { id, datum }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("milestones", id);
    if (!prev || prev.orgId !== orgId || prev.datum === datum) return;
    const log = [...prev.log, { ts: new Date().toISOString(), from: prev.datum, to: datum }];
    await ctx.db.patch("milestones", id, { datum, log });
  },
});

export const remove = mutation({
  args: { id: v.id("milestones") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("milestones", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("milestones", id);
  },
});

export const linkTask = mutation({
  args: { id: v.id("milestones"), taskId: v.id("tasks") },
  handler: async (ctx, { id, taskId }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("milestones", id);
    if (!prev || prev.orgId !== orgId) return;
    const task = await ctx.db.get("tasks", taskId);
    if (!task || task.orgId !== orgId) return;
    if (prev.taskIds.includes(taskId)) return;
    await ctx.db.patch("milestones", id, { taskIds: [...prev.taskIds, taskId] });
  },
});

export const unlinkTask = mutation({
  args: { id: v.id("milestones"), taskId: v.id("tasks") },
  handler: async (ctx, { id, taskId }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("milestones", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("milestones", id, { taskIds: prev.taskIds.filter((t) => t !== taskId) });
  },
});
