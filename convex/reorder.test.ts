import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("tasks.reorder changes list order", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const a = await u.mutation(api.tasks.create, { titel: "A", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal" });
  const b = await u.mutation(api.tasks.create, { titel: "B", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal" });
  // A was created first so sorts before B initially.
  let list = await u.query(api.tasks.list, {});
  expect(list.map((x) => x._id)).toEqual([a, b]);
  // Move A after B by giving it a larger order.
  const bRow = list.find((x) => x._id === b)!;
  await u.mutation(api.tasks.reorder, { id: a, order: (bRow.order ?? bRow._creationTime) + 1 });
  list = await u.query(api.tasks.list, {});
  expect(list.map((x) => x._id)).toEqual([b, a]);
});

test("projects.reorder changes list order", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const a = await u.mutation(api.projects.create, { namn: "A", beskrivning: "" });
  const b = await u.mutation(api.projects.create, { namn: "B", beskrivning: "" });
  let list = await u.query(api.projects.list, {});
  const bRow = list.find((x) => x._id === b)!;
  await u.mutation(api.projects.reorder, { id: a, order: (bRow.order ?? bRow._creationTime) + 1 });
  list = await u.query(api.projects.list, {});
  expect(list.map((x) => x._id)).toEqual([b, a]);
});
