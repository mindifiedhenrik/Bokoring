import { convexTest } from "convex-test";
import { expect, test } from "vitest";
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
