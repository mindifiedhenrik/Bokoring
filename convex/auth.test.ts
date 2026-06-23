import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.helpers";

test("signUp with a valid org code creates a membership and active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINACME" }),
  );
  await t.action(api.auth.signIn, {
    provider: "password",
    params: { email: "new@firma.se", password: "hunter2hunter", flow: "signUp", code: "JOINACME" },
  });
  const state = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "new@firma.se"))
      .first();
    const membership = user
      ? await ctx.db
          .query("memberships")
          .withIndex("by_user_org", (q) => q.eq("userId", user._id).eq("orgId", orgId))
          .first()
      : null;
    return { activeOrgId: user?.activeOrgId, hasMembership: !!membership };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
});

test("signUp with an unknown code is rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email: "x@firma.se", password: "hunter2hunter", flow: "signUp", code: "NOPECODE" },
    }),
  ).rejects.toThrow();
});
