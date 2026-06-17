import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    // CRM displays the full shared contact list. Each contact is augmented with
    // the timestamp of its most recent note (for sorting) and whether the current
    // user has an unread note (newer than their last read of that contact).
    const contacts = await ctx.db.query("contacts").order("desc").collect();
    const notes = await ctx.db.query("notes").collect();
    const lastNoteAt = new Map<string, number>();
    for (const n of notes) {
      const cur = lastNoteAt.get(n.contactId) ?? 0;
      if (n._creationTime > cur) lastNoteAt.set(n.contactId, n._creationTime);
    }
    const reads = await ctx.db
      .query("contactReads")
      .withIndex("by_user_contact", (q) => q.eq("userId", userId))
      .collect();
    const readAt = new Map(reads.map((r) => [r.contactId, r.lastReadAt]));
    return contacts.map((c) => {
      const last = lastNoteAt.get(c._id) ?? null;
      return {
        ...c,
        lastNoteAt: last,
        hasUnread: last !== null && last > (readAt.get(c._id) ?? 0),
      };
    });
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

export const markRead = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const existing = await ctx.db
      .query("contactReads")
      .withIndex("by_user_contact", (q) => q.eq("userId", userId).eq("contactId", id))
      .first();
    const lastReadAt = Date.now();
    if (existing) await ctx.db.patch("contactReads", existing._id, { lastReadAt });
    else await ctx.db.insert("contactReads", { userId, contactId: id, lastReadAt });
  },
});

export const setReminder = mutation({
  args: {
    id: v.id("contacts"),
    agareId: v.optional(v.id("users")),
    datum: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { id, agareId, datum, text }) => {
    await requireAuth(ctx);
    await ctx.db.patch("contacts", id, {
      reminderAgareId: agareId,
      reminderDatum: datum,
      reminderText: text.trim(),
    });
  },
});

export const clearReminder = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.patch("contacts", id, {
      reminderAgareId: undefined,
      reminderDatum: undefined,
      reminderText: undefined,
    });
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
    // Read markers aren't indexed by contact alone; scan and drop this contact's.
    const reads = await ctx.db.query("contactReads").collect();
    for (const r of reads) if (r.contactId === id) await ctx.db.delete("contactReads", r._id);
    await ctx.db.delete("contacts", id);
  },
});
