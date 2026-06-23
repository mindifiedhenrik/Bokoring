import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("contacts.remove unlinks leads pointing to the contact", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "Anna", foretag: "Acme", epost: "a@acme.se", telefon: "070",
  });
  const leadId = await as.mutation(api.leads.create, {
    titel: "Affär", beskrivning: "", contactId, sannolikhet: 20,
    datum: "2026-06-16", steg: "Lead",
  });

  await as.mutation(api.contacts.remove, { id: contactId });

  const leads = await as.query(api.leads.list, {});
  const lead = leads.find((l) => l._id === leadId)!;
  expect(lead.contactId).toBeUndefined();
  const contacts = await as.query(api.contacts.list, {});
  expect(contacts.find((c) => c._id === contactId)).toBeUndefined();
});

test("contacts functions reject unauthenticated callers", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.contacts.list, {})).rejects.toThrow("Inte inloggad");
});

test("contacts.list augmenterar med senaste anteckningens tidsstämpel", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  let listed = await as.query(api.contacts.list, {});
  expect(listed.find((c) => c._id === contactId)!.lastNoteAt).toBeNull();

  await as.mutation(api.notes.add, { contactId, text: "En" });
  listed = await as.query(api.contacts.list, {});
  expect(listed.find((c) => c._id === contactId)!.lastNoteAt).toBeTypeOf("number");
});

test("hasUnread blir sant vid ny anteckning och nollställs av markRead", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  const get = async () => (await as.query(api.contacts.list, {})).find((c) => c._id === contactId)!;

  expect((await get()).hasUnread).toBe(false); // inga anteckningar
  await as.mutation(api.notes.add, { contactId, text: "Ny" });
  expect((await get()).hasUnread).toBe(true); // ny oläst anteckning
  await as.mutation(api.contacts.markRead, { id: contactId });
  expect((await get()).hasUnread).toBe(false); // läst
});

test("contacts.setReminder och clearReminder sätter/nollställer påminnelsen", async () => {
  const t = convexTest(schema, modules);
  const { as, userId } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  await as.mutation(api.contacts.setReminder, {
    id: contactId, agareId: userId, datum: "2026-07-01", text: "  Ring upp  ",
  });
  let c = (await as.query(api.contacts.list, {})).find((x) => x._id === contactId)!;
  expect(c.reminderDatum).toBe("2026-07-01");
  expect(c.reminderText).toBe("Ring upp");
  expect(c.reminderAgareId).toBe(userId);

  await as.mutation(api.contacts.clearReminder, { id: contactId });
  c = (await as.query(api.contacts.list, {})).find((x) => x._id === contactId)!;
  expect(c.reminderDatum).toBeUndefined();
  expect(c.reminderText).toBeUndefined();
  expect(c.reminderAgareId).toBeUndefined();
});

test("contacts.list only returns the active org's contacts", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "CNTA1111", email: "ca@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "CNTB1111", email: "cb@firma.se" });
  await orgA.as.mutation(api.contacts.create, { namn: "A", foretag: "", epost: "", telefon: "" });
  expect(await orgB.as.query(api.contacts.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.contacts.list, {})).map((c) => c.namn)).toEqual(["A"]);
});
