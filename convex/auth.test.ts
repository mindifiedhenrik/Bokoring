import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { findUserByEmail, googleProvider } from "./auth";
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

test("Google sign-in always shows the account chooser", () => {
  // Without prompt=select_account Google silently reuses the browser's
  // signed-in account, so a user who picked the wrong account can never
  // switch to another one.
  const options = (googleProvider as unknown as {
    options: { authorization: { params: Record<string, string> } };
  }).options;
  expect(options.authorization.params.prompt).toBe("select_account");
});
