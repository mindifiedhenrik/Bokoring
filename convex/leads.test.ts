import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

const base = { titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16" };

test("leads.create logs the initial stage name", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, { ...base, stageId: stages[0] });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.stageId).toBe(stages[0]);
  expect(lead.log).toHaveLength(1);
  expect(lead.log[0]).toMatchObject({ from: null, to: "Lead" });
});

test("leads.move changes stageId and logs stage names", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, { ...base, stageId: stages[0] });
  await as.mutation(api.leads.move, { id, stageId: stages[1] });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.stageId).toBe(stages[1]);
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Kvalificerat" });
});

test("leads.move logs the legacy steg name for a not-yet-backfilled lead", async () => {
  const t = convexTest(schema, modules);
  const { as, orgId, stages } = await setupOrg(t);
  const id = await t.run((ctx) =>
    ctx.db.insert("leads", { orgId, ...base, steg: "Förslag", log: [] }),
  );
  await as.mutation(api.leads.move, { id, stageId: stages[4] });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log.at(-1)).toMatchObject({ from: "Förslag", to: "Stängd" });
});

test("leads.update logs a stage change", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, { ...base, stageId: stages[0] });
  await as.mutation(api.leads.update, { id, ...base, titel: "Y", stageId: stages[2] });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.titel).toBe("Y");
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Förslag" });
});

test("leads.create rejects a stage from another org", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA3333", email: "a3@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB3333", email: "b3@firma.se" });
  await expect(a.as.mutation(api.leads.create, { ...base, stageId: b.stages[0] })).rejects.toThrow("Steget saknas");
});

test("leads.list only returns the active org's leads", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA1111", email: "a@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB1111", email: "b@firma.se" });
  await orgA.as.mutation(api.leads.create, { ...base, titel: "A-lead", stageId: orgA.stages[0] });
  expect(await orgB.as.query(api.leads.list, {})).toHaveLength(0);
  const aList = await orgA.as.query(api.leads.list, {});
  expect(aList.map((l) => l.titel)).toEqual(["A-lead"]);
});

test("leads.update refuses a lead from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA2222", email: "a2@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB2222", email: "b2@firma.se" });
  const id = await orgA.as.mutation(api.leads.create, { ...base, titel: "Secret", stageId: orgA.stages[0] });
  await expect(
    orgB.as.mutation(api.leads.update, { id, ...base, titel: "Hacked", sannolikhet: 99, stageId: orgB.stages[0] }),
  ).rejects.toThrow();
});

test("leads.update rejects another org's stageId on an own lead", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA4444", email: "a4@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB4444", email: "b4@firma.se" });
  const id = await a.as.mutation(api.leads.create, { ...base, stageId: a.stages[0] });
  await expect(a.as.mutation(api.leads.update, { id, ...base, stageId: b.stages[0] })).rejects.toThrow("Steget saknas");
});

test("leads.move rejects another org's stageId", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA5555", email: "a5@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB5555", email: "b5@firma.se" });
  const id = await a.as.mutation(api.leads.create, { ...base, stageId: a.stages[0] });
  await expect(a.as.mutation(api.leads.move, { id, stageId: b.stages[0] })).rejects.toThrow("Steget saknas");
});

test("leads.move to the same stage is a no-op", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, { ...base, stageId: stages[0] });
  await as.mutation(api.leads.move, { id, stageId: stages[0] });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log).toHaveLength(1);
});
