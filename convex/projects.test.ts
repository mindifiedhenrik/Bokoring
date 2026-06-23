import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("projects.create assigns a palette color", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.projects.create, { namn: "P1", beskrivning: "" });
  const p = (await u.query(api.projects.list, {})).find((x) => x._id === id)!;
  expect(p.color).toBe("#6b8aa8");
});

test("projects.remove cascades to its tasks", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
  await u.mutation(api.projects.remove, { id: projectId });
  expect(await u.query(api.tasks.list, {})).toHaveLength(0);
  expect(await u.query(api.projects.list, {})).toHaveLength(0);
});

test("projects.list only returns the active org's projects", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "PRJA1111", email: "pa@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "PRJB1111", email: "pb@firma.se" });
  await orgA.as.mutation(api.projects.create, { namn: "A-proj", beskrivning: "" });
  expect(await orgB.as.query(api.projects.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.projects.list, {})).map((p) => p.namn)).toEqual(["A-proj"]);
});
