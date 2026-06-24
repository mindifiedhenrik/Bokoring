import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { findLinkableUserByEmail, findUserByEmail } from "./auth";
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

test("findLinkableUserByEmail links a verified single match", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "verified@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    }),
  );
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "verified@firma.se"),
  );
  expect(found?._id).toBe(userId);
});

test("findLinkableUserByEmail returns null for an unverified match", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: "unverified@firma.se" }));
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "unverified@firma.se"),
  );
  expect(found).toBeNull();
});

test("findLinkableUserByEmail returns null when the email is ambiguous", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      email: "dup2@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    });
    await ctx.db.insert("users", {
      email: "dup2@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    });
  });
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "dup2@firma.se"),
  );
  expect(found).toBeNull();
});

test("signUp with a valid org code creates a membership and active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINACME" }),
  );
  await t.action(api.auth.signIn, {
    provider: "password",
    params: { email: "new@firma.se", password: "hunter2hunter", flow: "signUp", joinCode: "JOINACME" },
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
    return {
      activeOrgId: user?.activeOrgId,
      hasMembership: !!membership,
      emailVerificationTime: user?.emailVerificationTime,
    };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
  // Sign-up creates the row + membership but does NOT verify the email — this is
  // the attacker-seeded-row property the linking hardening defends against.
  expect(state.emailVerificationTime).toBeUndefined();
});

test("signUp with an unknown code is rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email: "x@firma.se", password: "hunter2hunter", flow: "signUp", joinCode: "NOPECODE" },
    }),
  ).rejects.toThrow();
});
