import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { findUserByEmail } from "./auth";
import schema from "./schema";
import { modules } from "./test.helpers";

test("findUserByEmail returns the single user with a matching email", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "anna@firma.se" }),
  );
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "anna@firma.se"));
  expect(found?._id).toBe(userId);
});

test("findUserByEmail returns null when no user matches", async () => {
  const t = convexTest(schema, modules);
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "nobody@firma.se"));
  expect(found).toBeNull();
});

test("findUserByEmail returns null when the email is ambiguous", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { email: "dup@firma.se" });
    await ctx.db.insert("users", { email: "dup@firma.se" });
  });
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "dup@firma.se"));
  expect(found).toBeNull();
});

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
