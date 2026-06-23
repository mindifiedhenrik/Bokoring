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

test("milestones.setPosition moves the milestone, stores the lane, and logs the date change", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.setPosition, { id, datum: "2026-04-15", lane: 2 });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.datum).toBe("2026-04-15");
  expect(m.lane).toBe(2);
  expect(m.log.at(-1)).toMatchObject({ from: "2026-03-01", to: "2026-04-15" });
});

test("milestones.setPosition changing only the lane does not add a log entry", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  const before = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!.log.length;
  await u.mutation(api.milestones.setPosition, { id, datum: "2026-03-01", lane: 3 });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.lane).toBe(3);
  expect(m.log.length).toBe(before);
});

test("milestones.setLanes persists lanes for several milestones at once", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const a = await u.mutation(api.milestones.create, { titel: "A", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  const b = await u.mutation(api.milestones.create, { titel: "B", beskrivning: "", datum: "2026-03-02", color: "#c45b32" });
  await u.mutation(api.milestones.setLanes, { items: [{ id: a, lane: 0 }, { id: b, lane: 1 }] });
  const list = await u.query(api.milestones.list, {});
  expect(list.find((x) => x._id === a)!.lane).toBe(0);
  expect(list.find((x) => x._id === b)!.lane).toBe(1);
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

test("milestones.linkTask ignores a task from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "MSXA1111", email: "mxa@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "MSXB1111", email: "mxb@firma.se" });
  const projectIdB = await orgB.as.mutation(api.projects.create, { namn: "PB", beskrivning: "" });
  const taskIdB = await orgB.as.mutation(api.tasks.create, { titel: "TB", beskrivning: "", projectId: projectIdB, status: "Backlog", prioritet: "Normal" });
  const idA = await orgA.as.mutation(api.milestones.create, { titel: "MA", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await orgA.as.mutation(api.milestones.linkTask, { id: idA, taskId: taskIdB });
  const m = (await orgA.as.query(api.milestones.list, {})).find((x) => x._id === idA)!;
  expect(m.taskIds).toEqual([]);
});

test("removing a task scrubs it from milestones that link it", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const taskId = await u.mutation(api.tasks.create, { titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal" });
  const id = await u.mutation(api.milestones.create, { titel: "M", beskrivning: "", datum: "2026-03-01", color: "#c45b32" });
  await u.mutation(api.milestones.linkTask, { id, taskId });
  await u.mutation(api.tasks.remove, { id: taskId });
  const m = (await u.query(api.milestones.list, {})).find((x) => x._id === id)!;
  expect(m.taskIds).toEqual([]);
});
