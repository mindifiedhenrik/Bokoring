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
