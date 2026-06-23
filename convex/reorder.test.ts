import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("tasks.reorder changes list order", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t, { joinCode: "RDR11111" });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const a = await u.mutation(api.tasks.create, { titel: "A", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal" });
  const b = await u.mutation(api.tasks.create, { titel: "B", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal" });
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
  const { as: u } = await setupOrg(t, { joinCode: "RDR22222" });
  const a = await u.mutation(api.projects.create, { namn: "A", beskrivning: "" });
  const b = await u.mutation(api.projects.create, { namn: "B", beskrivning: "" });
  let list = await u.query(api.projects.list, {});
  const bRow = list.find((x) => x._id === b)!;
  await u.mutation(api.projects.reorder, { id: a, order: (bRow.order ?? bRow._creationTime) + 1 });
  list = await u.query(api.projects.list, {});
  expect(list.map((x) => x._id)).toEqual([b, a]);
});
