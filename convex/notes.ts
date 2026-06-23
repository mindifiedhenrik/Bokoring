import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", contactId);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const add = mutation({
  args: { contactId: v.id("contacts"), text: v.string() },
  handler: async (ctx, { contactId, text }) => {
    const { userId, orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", contactId);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
    const trimmed = text.trim();
    if (!trimmed) return;
    await ctx.db.insert("notes", { contactId, text: trimmed, authorId: userId, orgId });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("notes", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("notes", id);
  },
});
