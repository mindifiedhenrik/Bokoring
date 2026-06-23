import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.helpers";

test("archiveStaleDone archives old Done tasks per org", async () => {
  const t = convexTest(schema, modules);
  const { orgId, oldId, recentId, todoId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "O", joinCode: "CRON1111" });
    await ctx.db.insert("settings", { orgId, archiveDays: 1, pileThreshold: 3 });
    const projectId = await ctx.db.insert("projects", { orgId, namn: "P", beskrivning: "", color: "#000" });
    const old = new Date(Date.now() - 5 * 86400000).toISOString();
    const recent = new Date().toISOString();
    const oldId = await ctx.db.insert("tasks", {
      orgId, titel: "old done", beskrivning: "", projectId, status: "Done",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: old, from: null, to: "Done" }],
    });
    // Recently moved Done task — within the threshold, must NOT be archived.
    const recentId = await ctx.db.insert("tasks", {
      orgId, titel: "recent done", beskrivning: "", projectId, status: "Done",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: recent, from: null, to: "Done" }],
    });
    // Old but not Done — must be left alone.
    const todoId = await ctx.db.insert("tasks", {
      orgId, titel: "old todo", beskrivning: "", projectId, status: "Todo",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: old, from: null, to: "Todo" }],
    });
    return { orgId, oldId, recentId, todoId };
  });
  await t.mutation(internal.crons.archiveStaleDone, {});
  const tasks = await t.run((ctx) =>
    ctx.db.query("tasks").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
  );
  const byId = (id: typeof oldId) => tasks.find((x) => x._id === id)!;
  expect(byId(oldId).archived).toBe(true);
  expect(byId(oldId).log.at(-1)).toMatchObject({ archived: true });
  expect(byId(recentId).archived).toBe(false);
  expect(byId(todoId).archived).toBe(false);
});

test("archiveStaleDone scopes each org to its own settings", async () => {
  const t = convexTest(schema, modules);
  const { orgAId, orgBId } = await t.run(async (ctx) => {
    // Org A: archiving disabled (archiveDays 0) — its old Done task must survive.
    const orgAId = await ctx.db.insert("organizations", { namn: "A", joinCode: "CRONAAAA" });
    await ctx.db.insert("settings", { orgId: orgAId, archiveDays: 0, pileThreshold: 3 });
    const projectAId = await ctx.db.insert("projects", { orgId: orgAId, namn: "PA", beskrivning: "", color: "#000" });
    const old = new Date(Date.now() - 10 * 86400000).toISOString();
    await ctx.db.insert("tasks", {
      orgId: orgAId, titel: "a done", beskrivning: "", projectId: projectAId, status: "Done",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: old, from: null, to: "Done" }],
    });
    // Org B: archiving on — its old Done task gets archived.
    const orgBId = await ctx.db.insert("organizations", { namn: "B", joinCode: "CRONBBBB" });
    await ctx.db.insert("settings", { orgId: orgBId, archiveDays: 1, pileThreshold: 3 });
    const projectBId = await ctx.db.insert("projects", { orgId: orgBId, namn: "PB", beskrivning: "", color: "#000" });
    await ctx.db.insert("tasks", {
      orgId: orgBId, titel: "b done", beskrivning: "", projectId: projectBId, status: "Done",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: old, from: null, to: "Done" }],
    });
    return { orgAId, orgBId };
  });
  await t.mutation(internal.crons.archiveStaleDone, {});
  const [taskA] = await t.run((ctx) =>
    ctx.db.query("tasks").withIndex("by_org", (q) => q.eq("orgId", orgAId)).collect(),
  );
  const [taskB] = await t.run((ctx) =>
    ctx.db.query("tasks").withIndex("by_org", (q) => q.eq("orgId", orgBId)).collect(),
  );
  expect(taskA.archived).toBe(false); // archiving disabled for org A
  expect(taskB.archived).toBe(true);
});
