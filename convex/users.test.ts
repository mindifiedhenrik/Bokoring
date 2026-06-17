import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("users.list ger displayName från profil, annars e-post-prefix", async () => {
  const t = convexTest(schema, modules);
  const { a } = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "anna@firma.se" });
    const b = await ctx.db.insert("users", { email: "bo@firma.se" });
    await ctx.db.insert("userProfiles", { userId: a, displayName: "Anna A" });
    return { a, b };
  });
  const u = t.withIdentity({ subject: `${a}|s` });
  const list = await u.query(api.users.list, {});
  expect(list.find((x) => x.email === "anna@firma.se")!.displayName).toBe("Anna A");
  expect(list.find((x) => x.email === "bo@firma.se")!.displayName).toBe("bo");
});

test("users.remove vägrar radera sig själv", async () => {
  const t = convexTest(schema, modules);
  const me = await t.run(async (ctx) => ctx.db.insert("users", { email: "me@firma.se" }));
  const u = t.withIdentity({ subject: `${me}|s` });
  await expect(u.mutation(api.users.remove, { userId: me })).rejects.toThrow();
});

test("users.remove nollställer ansvarig på leads och tasks", async () => {
  const t = convexTest(schema, modules);
  const { me, victim, projectId } = await t.run(async (ctx) => {
    const me = await ctx.db.insert("users", { email: "me@firma.se" });
    const victim = await ctx.db.insert("users", { email: "v@firma.se" });
    const projectId = await ctx.db.insert("projects", { namn: "P", beskrivning: "", color: "#000" });
    return { me, victim, projectId };
  });
  const u = t.withIdentity({ subject: `${me}|s` });
  const leadId = await u.mutation(api.leads.create, {
    titel: "L", beskrivning: "", sannolikhet: 10, agareId: victim, datum: "2026-06-17", steg: "Lead",
  });
  const taskId = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agareId: victim, prioritet: "Normal",
  });

  await u.mutation(api.users.remove, { userId: victim });

  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === leadId)!;
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === taskId)!;
  expect(lead.agareId).toBeUndefined();
  expect(task.agareId).toBeUndefined();
  const remaining = await t.run(async (ctx) => ctx.db.get("users", victim));
  expect(remaining).toBeNull();
});
