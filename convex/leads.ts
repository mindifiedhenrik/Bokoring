import { query, mutation, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  contactId: v.optional(v.id("contacts")),
  sannolikhet: v.number(),
  agareId: v.optional(v.id("users")),
  datum: v.string(),
  stageId: v.id("stages"),
};

async function ownStage(ctx: QueryCtx, orgId: Id<"organizations">, id: Id<"stages">) {
  const stage = await ctx.db.get("stages", id);
  if (!stage || stage.orgId !== orgId) throw new ConvexError("Steget saknas");
  return stage;
}

// Name of the lead's current stage for the log. Falls back to the legacy
// `steg` string for leads the stage backfill hasn't reached yet.
async function currentStageName(ctx: QueryCtx, lead: Doc<"leads">) {
  if (lead.stageId) return (await ctx.db.get("stages", lead.stageId))?.namn ?? null;
  return lead.steg ?? null;
}

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const stage = await ownStage(ctx, orgId, args.stageId);
    const log = [{ ts: new Date().toISOString(), from: null, to: stage.namn }];
    return await ctx.db.insert("leads", { ...args, orgId, log, order: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("leads"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Lead saknas");
    const stage = await ownStage(ctx, orgId, patch.stageId);
    const log = [...prev.log];
    if (prev.stageId !== patch.stageId) {
      log.push({ ts: new Date().toISOString(), from: await currentStageName(ctx, prev), to: stage.namn });
    }
    await ctx.db.patch("leads", id, { ...patch, log });
    return null;
  },
});

export const move = mutation({
  args: { id: v.id("leads"), stageId: v.id("stages"), order: v.optional(v.number()) },
  handler: async (ctx, { id, stageId, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId || prev.stageId === stageId) return null;
    const stage = await ownStage(ctx, orgId, stageId);
    const log = [...prev.log, { ts: new Date().toISOString(), from: await currentStageName(ctx, prev), to: stage.namn }];
    await ctx.db.patch("leads", id, { stageId, log, ...(order !== undefined ? { order } : {}) });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id("leads"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("leads", id, { order });
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("leads", id);
  },
});
