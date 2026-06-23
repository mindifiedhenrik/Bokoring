import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("settings default per org, then persist independently", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "SETA1111", email: "sa@firma.se", namn: "A" });
  const orgB = await setupOrg(t, { joinCode: "SETB1111", email: "sb@firma.se", namn: "B" });
  expect(await orgA.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 3, pileThreshold: 3 });
  await orgA.as.mutation(api.settings.set, { archiveDays: 10, pileThreshold: 7 });
  expect(await orgA.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 10, pileThreshold: 7 });
  expect(await orgB.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 3, pileThreshold: 3 });
});

test("settings.get returns the org's join code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t, { joinCode: "SETC1111", email: "sc@firma.se" });
  expect((await as.query(api.settings.get, {})).joinCode).toBe("SETC1111");
});
