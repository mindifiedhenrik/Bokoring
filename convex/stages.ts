import { query, mutation, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrg, insertDefaultStages, PROJECT_COLORS } from "./helpers";

// An org has a handful of stages; 100 is a generous safety bound.
async function orgStages(ctx: QueryCtx, orgId: Id<"organizations">) {
  const rows = await ctx.db
    .query("stages")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(100);
  return rows.sort((a, b) => a.order - b.order);
}

async function ownStage(ctx: QueryCtx, orgId: Id<"organizations">, id: Id<"stages">) {
  const stage = await ctx.db.get("stages", id);
  if (!stage || stage.orgId !== orgId) throw new ConvexError("Steget saknas");
  return stage;
}

// Trimmed, non-empty, unique (case-insensitive) among the org's other stages.
function validName(stages: Doc<"stages">[], namn: string, selfId?: Id<"stages">) {
  const clean = namn.trim();
  if (!clean) throw new ConvexError("Namnet får inte vara tomt");
  if (clean.length > 60) throw new ConvexError("Namnet får vara högst 60 tecken");
  const clash = stages.find((s) => s._id !== selfId && s.namn.toLowerCase() === clean.toLowerCase());
  if (clash) throw new ConvexError(`Det finns redan ett steg som heter "${clash.namn}"`);
  return clean;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    return await orgStages(ctx, orgId);
  },
});

export const create = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const { orgId } = await requireOrg(ctx);
    let stages = await orgStages(ctx, orgId);
    if (stages.length === 0) {
      // Added before the backfill ran: seed the defaults so the backfill does
      // not dump every legacy lead into this single new stage.
      await insertDefaultStages(ctx, orgId);
      stages = await orgStages(ctx, orgId);
    }
    if (stages.length >= 50) throw new ConvexError("En pipeline kan ha högst 50 steg");
    const clean = validName(stages, namn);
    const order = stages.length ? stages[stages.length - 1].order + 1 : 0;
    const color = PROJECT_COLORS[stages.length % PROJECT_COLORS.length];
    return await ctx.db.insert("stages", { orgId, namn: clean, color, order });
  },
});

export const rename = mutation({
  args: { id: v.id("stages"), namn: v.string() },
  handler: async (ctx, { id, namn }) => {
    const { orgId } = await requireOrg(ctx);
    await ownStage(ctx, orgId, id);
    const clean = validName(await orgStages(ctx, orgId), namn, id);
    await ctx.db.patch("stages", id, { namn: clean });
    return null;
  },
});

export const setColor = mutation({
  args: { id: v.id("stages"), color: v.string() },
  handler: async (ctx, { id, color }) => {
    const { orgId } = await requireOrg(ctx);
    await ownStage(ctx, orgId, id);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new ConvexError("Ogiltig färg");
    await ctx.db.patch("stages", id, { color });
    return null;
  },
});

export const reorder = mutation({
  args: { id: v.id("stages"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    await ownStage(ctx, orgId, id);
    if (!Number.isFinite(order)) throw new ConvexError("Ogiltig ordning");
    await ctx.db.patch("stages", id, { order });
    return null;
  },
});

// Deletes a stage. Leads in it are moved to `moveToId` (required when the
// stage is non-empty) with a log entry each, in the same transaction.
export const remove = mutation({
  args: { id: v.id("stages"), moveToId: v.optional(v.id("stages")) },
  handler: async (ctx, { id, moveToId }) => {
    const { orgId } = await requireOrg(ctx);
    const stage = await ownStage(ctx, orgId, id);
    if ((await orgStages(ctx, orgId)).length <= 1) {
      throw new ConvexError("Det sista steget kan inte tas bort");
    }
    // Leads per org are in the tens; a single transaction is fine at this scale.
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_stageId", (q) => q.eq("stageId", id))
      .collect();
    if (leads.length > 0) {
      if (!moveToId) throw new ConvexError("Välj ett steg att flytta affärerna till");
      if (moveToId === id) throw new ConvexError("Välj ett annat steg");
      const target = await ownStage(ctx, orgId, moveToId);
      const ts = new Date().toISOString();
      for (const lead of leads) {
        await ctx.db.patch("leads", lead._id, {
          stageId: target._id,
          log: [...lead.log, { ts, from: stage.namn, to: target.namn }],
        });
      }
    }
    await ctx.db.delete("stages", id);
    return null;
  },
});
