import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("tasks.create logs the initial status", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.log.at(-1)).toMatchObject({ from: null, to: "Backlog" });
});

test("tasks.move logs status change", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
  await u.mutation(api.tasks.move, { id, projectId, status: "Todo" });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.status).toBe("Todo");
  expect(task.log.at(-1)).toMatchObject({ from: "Backlog", to: "Todo" });
});

test("tasks.move across projects logs a project move", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const otherId = await u.mutation(api.projects.create, { namn: "P2", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Todo", prioritet: "Normal",
  });
  await u.mutation(api.tasks.move, { id, projectId: otherId, status: "Todo" });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.projectId).toBe(otherId);
  expect(task.log.at(-1)).toMatchObject({ fromProject: "P", toProject: "P2" });
});

test("tasks.restore unarchives and appends a restored entry", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Done", prioritet: "Normal",
  });
  await u.mutation(api.tasks.restore, { id });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.archived).toBe(false);
  expect(task.log.at(-1)).toMatchObject({ restored: true });
});

test("tasks.list only returns the active org's tasks", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "TSKA1111", email: "ta@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "TSKB1111", email: "tb@firma.se" });
  const projectId = await orgA.as.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  await orgA.as.mutation(api.tasks.create, {
    titel: "A-task", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
  expect(await orgB.as.query(api.tasks.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.tasks.list, {})).map((x) => x.titel)).toEqual(["A-task"]);
});
