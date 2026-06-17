import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    await requireAuth(ctx);
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    // Newest first.
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const add = mutation({
  args: { contactId: v.id("contacts"), text: v.string() },
  handler: async (ctx, { contactId, text }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const trimmed = text.trim();
    if (!trimmed) return;
    await ctx.db.insert("notes", { contactId, text: trimmed, authorId: userId });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete("notes", id);
  },
});
