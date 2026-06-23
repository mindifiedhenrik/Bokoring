import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { userId, orgId } = await requireOrg(ctx);
    // CRM displays the org's contact list. Each contact is augmented with the
    // timestamp of its most recent note (for sorting) and whether the current
    // user has an unread note (newer than their last read of that contact).
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
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
    const { orgId } = await requireOrg(ctx);
    return await ctx.db.insert("contacts", { ...args, orgId });
  },
});

export const update = mutation({
  args: { id: v.id("contacts"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
    await ctx.db.patch("contacts", id, patch);
  },
});

export const markRead = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const { userId, orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", id);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
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
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
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
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
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
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) return;
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
