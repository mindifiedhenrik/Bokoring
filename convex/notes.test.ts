import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("notes.add trimmar texten och sätter författare; listByContact returnerar nyaste först", async () => {
  const t = convexTest(schema, modules);
  const { as, userId } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  await as.mutation(api.notes.add, { contactId, text: "  Första raden\nmer text  " });
  await as.mutation(api.notes.add, { contactId, text: "Andra" });
  const notes = await as.query(api.notes.listByContact, { contactId });
  expect(notes).toHaveLength(2);
  expect(notes[0].text).toBe("Andra"); // nyaste först
  expect(notes[1].text).toBe("Första raden\nmer text");
  expect(notes[1].authorId).toBe(userId);
});

test("notes.add ignorerar tom text", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  await as.mutation(api.notes.add, { contactId, text: "   " });
  expect(await as.query(api.notes.listByContact, { contactId })).toHaveLength(0);
});

test("contacts.remove raderar kontaktens anteckningar", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);

  const contactId = await as.mutation(api.contacts.create, {
    namn: "C", foretag: "", epost: "", telefon: "",
  });

  await as.mutation(api.notes.add, { contactId, text: "Kvar?" });
  await as.mutation(api.contacts.remove, { id: contactId });
  const remaining = await t.run(async (ctx) => ctx.db.query("notes").collect());
  expect(remaining).toHaveLength(0);
});

test("notes.listByContact refuses a contact from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "NOTA1111", email: "na@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "NOTB1111", email: "nb@firma.se" });
  const contactId = await orgA.as.mutation(api.contacts.create, { namn: "A", foretag: "", epost: "", telefon: "" });
  await expect(orgB.as.query(api.notes.listByContact, { contactId })).rejects.toThrow();
});
