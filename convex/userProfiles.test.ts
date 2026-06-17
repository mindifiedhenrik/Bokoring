import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("setMyName upsertar och myProfile läser tillbaka namnet", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "maria@firma.se" })
  );
  const u = t.withIdentity({ subject: `${userId}|s1` });

  expect(await u.query(api.userProfiles.myProfile, {})).toMatchObject({
    displayName: "",
    email: "maria@firma.se",
  });

  await u.mutation(api.userProfiles.setMyName, { displayName: "  Maria Ek  " });
  expect(await u.query(api.userProfiles.myProfile, {})).toMatchObject({
    displayName: "Maria Ek",
  });

  await u.mutation(api.userProfiles.setMyName, { displayName: "Maria E" });
  const rows = await t.run(async (ctx) => ctx.db.query("userProfiles").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].displayName).toBe("Maria E");
});
