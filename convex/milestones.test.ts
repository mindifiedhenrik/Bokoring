import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("milestones.create logs the initial date and starts with no tasks", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.datum).toBe("2026-03-01");
  expect(m.taskIds).toEqual([]);
  expect(m.log.at(-1)).toMatchObject({ from: null, to: "2026-03-01" });
});

test("milestones.list is sorted by date", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  await u.mutation(api.milestones.create, { titel: "Senare", beskrivning: "", datum: "2026-06-01", color: "#c45b32" });
  await u.mutation(api.milestones.create, { titel: "Tidigare", beskrivning: "", datum: "2026-02-01", color: "#c45b32" });
  const titles = (await u.query(api.milestones.list, {})).map((m) => m.titel);
  expect(titles).toEqual(["Tidigare", "Senare"]);
});

test("milestones.list only returns the active org's milestones", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "MSA11111", email: "ma@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "MSB11111", email: "mb@firma.se" });
  await orgA.as.mutation(api.milestones.create, { titel: "A-ms", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  expect(await orgB.as.query(api.milestones.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.milestones.list, {})).map((m) => m.titel)).toEqual(["A-ms"]);
});

test("milestones.setDate moves the milestone and logs the change", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.setDate, { id, datum: "2026-04-15" });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.datum).toBe("2026-04-15");
  expect(m.log.at(-1)).toMatchObject({ from: "2026-03-01", to: "2026-04-15" });
});

test("milestones.update changes fields and logs date changes", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.update, { id, titel: "Ny titel", beskrivning: "x", datum: "2026-05-01", color: "#4f7a52" });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.titel).toBe("Ny titel");
  expect(m.color).toBe("#4f7a52");
  expect(m.log.at(-1)).toMatchObject({ from: "2026-03-01", to: "2026-05-01" });
});

test("milestones.linkTask and unlinkTask manage the task list", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const taskId = await u.mutation(api.tasks.create, { titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal" });
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.linkTask, { id, taskId });
  let m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.taskIds).toEqual([taskId]);
  await u.mutation(api.milestones.linkTask, { id, taskId }); // duplicate is a no-op
  m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.taskIds).toEqual([taskId]);
  await u.mutation(api.milestones.unlinkTask, { id, taskId });
  m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.taskIds).toEqual([]);
});

test("milestones.remove deletes the milestone", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.remove, { id });
  expect(await u.query(api.milestones.list, {})).toHaveLength(0);
});
