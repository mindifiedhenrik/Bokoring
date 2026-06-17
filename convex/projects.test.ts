import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("projects.create assigns a palette color", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.projects.create, { namn: "P1", beskrivning: "" });
  const p = (await u.query(api.projects.list, {})).find((x) => x._id === id)!;
  expect(p.color).toBe("#6b8aa8");
});

test("projects.remove cascades to its tasks", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal",
  });
  await u.mutation(api.projects.remove, { id: projectId });
  expect(await u.query(api.tasks.list, {})).toHaveLength(0);
  expect(await u.query(api.projects.list, {})).toHaveLength(0);
});
