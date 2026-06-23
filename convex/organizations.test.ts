import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
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
