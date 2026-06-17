import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("contacts.remove unlinks leads pointing to the contact", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });

  const contactId = await u.mutation(api.contacts.create, {
    namn: "Anna", foretag: "Acme", epost: "a@acme.se", telefon: "070",
  });
  const leadId = await u.mutation(api.leads.create, {
    titel: "Affär", beskrivning: "", contactId, sannolikhet: 20,
    datum: "2026-06-16", steg: "Lead",
  });

  await u.mutation(api.contacts.remove, { id: contactId });

  const leads = await u.query(api.leads.list, {});
  const lead = leads.find((l) => l._id === leadId)!;
  expect(lead.contactId).toBeUndefined();
  const contacts = await u.query(api.contacts.list, {});
  expect(contacts.find((c) => c._id === contactId)).toBeUndefined();
});

test("contacts functions reject unauthenticated callers", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.contacts.list, {})).rejects.toThrow("Inte inloggad");
});

test("contacts.list augmenterar med senaste anteckningens tidsstämpel", async () => {
  const t = convexTest(schema, modules);
  const { userId, contactId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@b.se" });
    const contactId = await ctx.db.insert("contacts", { namn: "C", foretag: "", epost: "", telefon: "" });
    return { userId, contactId };
  });
  const u = t.withIdentity({ subject: `${userId}|s` });

  let listed = await u.query(api.contacts.list, {});
  expect(listed.find((c) => c._id === contactId)!.lastNoteAt).toBeNull();

  await u.mutation(api.notes.add, { contactId, text: "En" });
  listed = await u.query(api.contacts.list, {});
  expect(listed.find((c) => c._id === contactId)!.lastNoteAt).toBeTypeOf("number");
});

test("contacts.setReminder och clearReminder sätter/nollställer påminnelsen", async () => {
  const t = convexTest(schema, modules);
  const { userId, contactId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@b.se" });
    const contactId = await ctx.db.insert("contacts", { namn: "C", foretag: "", epost: "", telefon: "" });
    return { userId, contactId };
  });
  const u = t.withIdentity({ subject: `${userId}|s` });

  await u.mutation(api.contacts.setReminder, {
    id: contactId, agareId: userId, datum: "2026-07-01", text: "  Ring upp  ",
  });
  let c = (await u.query(api.contacts.list, {})).find((x) => x._id === contactId)!;
  expect(c.reminderDatum).toBe("2026-07-01");
  expect(c.reminderText).toBe("Ring upp");
  expect(c.reminderAgareId).toBe(userId);

  await u.mutation(api.contacts.clearReminder, { id: contactId });
  c = (await u.query(api.contacts.list, {})).find((x) => x._id === contactId)!;
  expect(c.reminderDatum).toBeUndefined();
  expect(c.reminderText).toBeUndefined();
  expect(c.reminderAgareId).toBeUndefined();
});
