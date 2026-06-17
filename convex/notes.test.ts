import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const { userId, contactId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "a@b.se" });
    const contactId = await ctx.db.insert("contacts", { namn: "C", foretag: "", epost: "", telefon: "" });
    return { userId, contactId };
  });
  const u = t.withIdentity({ subject: `${userId}|s` });
  return { t, u, userId, contactId };
}

test("notes.add trimmar texten och sätter författare; listByContact returnerar nyaste först", async () => {
  const { u, userId, contactId } = await setup();
  await u.mutation(api.notes.add, { contactId, text: "  Första raden\nmer text  " });
  await u.mutation(api.notes.add, { contactId, text: "Andra" });
  const notes = await u.query(api.notes.listByContact, { contactId });
  expect(notes).toHaveLength(2);
  expect(notes[0].text).toBe("Andra"); // nyaste först
  expect(notes[1].text).toBe("Första raden\nmer text");
  expect(notes[1].authorId).toBe(userId);
});

test("notes.add ignorerar tom text", async () => {
  const { u, contactId } = await setup();
  await u.mutation(api.notes.add, { contactId, text: "   " });
  expect(await u.query(api.notes.listByContact, { contactId })).toHaveLength(0);
});

test("contacts.remove raderar kontaktens anteckningar", async () => {
  const { t, u, contactId } = await setup();
  await u.mutation(api.notes.add, { contactId, text: "Kvar?" });
  await u.mutation(api.contacts.remove, { id: contactId });
  const remaining = await t.run(async (ctx) => ctx.db.query("notes").collect());
  expect(remaining).toHaveLength(0);
});
