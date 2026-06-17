import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("leads").order("desc").collect();
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  contactId: v.optional(v.id("contacts")),
  sannolikhet: v.number(),
  agare: v.string(),
  datum: v.string(),
  steg: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.steg }];
    return await ctx.db.insert("leads", { ...args, log });
  },
});

export const update = mutation({
  args: { id: v.id("leads"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev) throw new Error("Lead saknas");
    const log = [...prev.log];
    if (prev.steg !== patch.steg) {
      log.push({ ts: new Date().toISOString(), from: prev.steg, to: patch.steg });
    }
    await ctx.db.patch("leads", id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("leads"), steg: v.string() },
  handler: async (ctx, { id, steg }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.steg === steg) return;
    const log = [...prev.log, { ts: new Date().toISOString(), from: prev.steg, to: steg }];
    await ctx.db.patch("leads", id, { steg, log });
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete("leads", id);
  },
});
