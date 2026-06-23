import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.helpers";

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
