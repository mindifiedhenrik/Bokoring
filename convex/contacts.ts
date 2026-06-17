import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    // CRM displays the full shared contact list.
    return await ctx.db.query("contacts").order("desc").collect();
  },
});

const fields = {
  namn: v.string(),
  foretag: v.string(),
  epost: v.string(),
  telefon: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.insert("contacts", args);
  },
});

export const update = mutation({
  args: { id: v.id("contacts"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    await ctx.db.patch("contacts", id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const linked = await ctx.db
      .query("leads")
      .withIndex("by_contact", (q) => q.eq("contactId", id))
      .collect();
    for (const l of linked) await ctx.db.patch("leads", l._id, { contactId: undefined });
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", id))
      .collect();
    for (const n of notes) await ctx.db.delete("notes", n._id);
    await ctx.db.delete("contacts", id);
  },
});
