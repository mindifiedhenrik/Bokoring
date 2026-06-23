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
