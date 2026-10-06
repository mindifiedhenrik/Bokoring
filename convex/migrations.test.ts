import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.helpers";
import { insertDefaultStages } from "./helpers";

test("backfillOrgs creates one default org and enrols every user, idempotently", async () => {
  const t = convexTest(schema, modules);
  const { u1, u2 } = await t.run(async (ctx) => {
    const u1 = await ctx.db.insert("users", { email: "a@firma.se" });
    const u2 = await ctx.db.insert("users", { email: "b@firma.se" });
    return { u1, u2 };
  });

  await t.mutation(internal.migrations.backfillOrgs, {});

  const after1 = await t.run(async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const u1doc = await ctx.db.get("users", u1);
    const u2doc = await ctx.db.get("users", u2);
    const memberships = await ctx.db.query("memberships").collect();
    return { orgCount: orgs.length, a: u1doc?.activeOrgId, b: u2doc?.activeOrgId, mCount: memberships.length };
  });
  expect(after1.orgCount).toBe(1);
  expect(after1.a).toBeDefined();
  expect(after1.b).toBe(after1.a);
  expect(after1.mCount).toBe(2);

  await t.mutation(internal.migrations.backfillOrgs, {});
  const after2 = await t.run(async (ctx) => ({
    orgCount: (await ctx.db.query("organizations").collect()).length,
    mCount: (await ctx.db.query("memberships").collect()).length,
  }));
  expect(after2).toEqual({ orgCount: 1, mCount: 2 });
});

test("verifyOrgs reports clean once backfill has run", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: "a@firma.se" }));
  await t.mutation(internal.migrations.backfillOrgs, {});
  const report = await t.query(internal.migrations.verifyOrgs, {});
  expect(report.usersMissingMembership).toBe(0);
  expect(report.rowsMissingOrgId).toBe(0);
});

test("backfillStages seeds stages and maps steg → stageId by name, idempotently", async () => {
  const t = convexTest(schema, modules);
  const { orgId, known, unknown, missing } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "Legacy", joinCode: "LEGACY01" });
    const base = { orgId, beskrivning: "", sannolikhet: 10, datum: "2026-06-01", log: [] };
    const known = await ctx.db.insert("leads", { ...base, titel: "K", steg: "Offererat" });
    const unknown = await ctx.db.insert("leads", { ...base, titel: "U", steg: "Okänt steg" });
    const missing = await ctx.db.insert("leads", { ...base, titel: "M" });
    return { orgId, known, unknown, missing };
  });

  const first = await t.mutation(internal.migrations.backfillStages, {});
  expect(first).toEqual({ orgsSeeded: 1, leadsUpdated: 3 });

  const state = await t.run(async (ctx) => {
    const stages = (await ctx.db.query("stages").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect())
      .sort((a, b) => a.order - b.order);
    const name = async (id: typeof known) => {
      const lead = await ctx.db.get("leads", id);
      return stages.find((s) => s._id === lead?.stageId)?.namn;
    };
    return { count: stages.length, k: await name(known), u: await name(unknown), m: await name(missing) };
  });
  expect(state).toEqual({ count: 5, k: "Offererat", u: "Lead", m: "Lead" });

  const second = await t.mutation(internal.migrations.backfillStages, {});
  expect(second).toEqual({ orgsSeeded: 0, leadsUpdated: 0 });
});

test("verifyStages reports clean once backfill has run", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "V", joinCode: "VERIFY01" });
    await ctx.db.insert("leads", { orgId, titel: "L", beskrivning: "", sannolikhet: 10, datum: "2026-06-01", steg: "Lead", log: [] });
  });
  expect(await t.query(internal.migrations.verifyStages, {})).toEqual({ orgsWithoutStages: 1, leadsWithoutStageId: 1 });
  await t.mutation(internal.migrations.backfillStages, {});
  expect(await t.query(internal.migrations.verifyStages, {})).toEqual({ orgsWithoutStages: 0, leadsWithoutStageId: 0 });
});

test("backfillStages keeps an existing stageId even when steg disagrees", async () => {
  const t = convexTest(schema, modules);
  const { orgId, leadId, closedId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "Keep", joinCode: "KEEP0001" });
    const [, , , , closedId] = await insertDefaultStages(ctx, orgId);
    const leadId = await ctx.db.insert("leads", {
      orgId, titel: "L", beskrivning: "", sannolikhet: 10, datum: "2026-06-01", steg: "Lead", stageId: closedId, log: [],
    });
    return { orgId, leadId, closedId };
  });
  expect(orgId).toBeDefined();
  await t.mutation(internal.migrations.backfillStages, {});
  const lead = await t.run((ctx) => ctx.db.get("leads", leadId));
  expect(lead?.stageId).toBe(closedId);
});
