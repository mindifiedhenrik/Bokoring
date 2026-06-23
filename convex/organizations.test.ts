import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("findByCode returns the org for a known code, null otherwise", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "ABC123" }),
  );
  const hit = await t.query(internal.organizations.findByCode, { code: "ABC123" });
  expect(hit?._id).toBe(orgId);
  const miss = await t.query(internal.organizations.findByCode, { code: "NOPE" });
  expect(miss).toBeNull();
});

test("create makes an org, a membership, and sets it active", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "founder@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  const { orgId, joinCode } = await as.mutation(api.organizations.create, { namn: "Min Org" });
  expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);
  const state = await t.run(async (ctx) => {
    const user = await ctx.db.get("users", userId);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    return { activeOrgId: user?.activeOrgId, hasMembership: !!membership };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
});

test("join adds a membership by code and switches active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "B", joinCode: "JOINME1" }));
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await as.mutation(api.organizations.join, { code: "JOINME1" });
  const user = await t.run((ctx) => ctx.db.get("users", userId));
  expect(user?.activeOrgId).toBe(orgId);
});

test("join rejects an unknown code", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.join, { code: "BADCODE0" })).rejects.toThrow("Ogiltig kod");
});

test("setActive rejects an org the user is not a member of", async () => {
  const t = convexTest(schema, modules);
  const otherOrg = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Other", joinCode: "OTHER111" }));
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.setActive, { orgId: otherOrg })).rejects.toThrow();
});

test("rotateCode replaces the active org's join code", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "C", joinCode: "OLDCODE1" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: uid, orgId });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  const { joinCode } = await as.mutation(api.organizations.rotateCode, {});
  expect(joinCode).not.toBe("OLDCODE1");
  const org = await t.run((ctx) => ctx.db.get("organizations", orgId));
  expect(org?.joinCode).toBe(joinCode);
});

test("myOrgs lists the user's orgs and the active one", async () => {
  const t = convexTest(schema, modules);
  const o1 = await t.run((ctx) => ctx.db.insert("organizations", { namn: "One", joinCode: "ONEONE11" }));
  const o2 = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Two", joinCode: "TWOTWO11" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: o1 });
    await ctx.db.insert("memberships", { userId: uid, orgId: o1 });
    await ctx.db.insert("memberships", { userId: uid, orgId: o2 });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  const result = await as.query(api.organizations.myOrgs, {});
  expect(result.activeOrgId).toBe(o1);
  expect(result.orgs.map((o) => o._id).sort()).toEqual([o1, o2].sort());
});

test("rename changes the active org's name", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Gammalt", joinCode: "RENAME11" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: uid, orgId });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  await as.mutation(api.organizations.rename, { namn: "  Nytt namn  " });
  const org = await t.run((ctx) => ctx.db.get("organizations", orgId));
  expect(org?.namn).toBe("Nytt namn");
});

test("rename rejects a blank name", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Org", joinCode: "RENAME22" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: uid, orgId });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.rename, { namn: "   " })).rejects.toThrow();
});
