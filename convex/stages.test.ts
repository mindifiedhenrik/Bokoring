import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

const names = (rows: { namn: string }[]) => rows.map((s) => s.namn);

test("list returns the org's stages in order", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  expect(names(await as.query(api.stages.list, {}))).toEqual(["Lead", "Kvalificerat", "Förslag", "Offererat", "Stängd"]);
});

test("list is scoped to the active org", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA0001", email: "a@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB0001", email: "b@firma.se" });
  await a.as.mutation(api.stages.create, { namn: "Bara A" });
  expect(names(await b.as.query(api.stages.list, {}))).not.toContain("Bara A");
});

test("create appends a trimmed stage last", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  const id = await as.mutation(api.stages.create, { namn: "  Förhandling  " });
  const list = await as.query(api.stages.list, {});
  expect(list.at(-1)?._id).toBe(id);
  expect(list.at(-1)?.namn).toBe("Förhandling");
  expect(list.at(-1)?.color).toMatch(/^#[0-9a-f]{6}$/);
});

test("create rejects empty and duplicate (case-insensitive) names", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  await expect(as.mutation(api.stages.create, { namn: "   " })).rejects.toThrow("Namnet får inte vara tomt");
  await expect(as.mutation(api.stages.create, { namn: "lead" })).rejects.toThrow('Det finns redan ett steg som heter "Lead"');
});

test("rename changes the name and leads keep their stageId", async () => {
  const t = convexTest(schema, modules);
  const { as, orgId, stages } = await setupOrg(t);
  const leadId = await t.run((ctx) =>
    ctx.db.insert("leads", { orgId, titel: "L", beskrivning: "", sannolikhet: 10, datum: "2026-10-06", stageId: stages[0], log: [] }),
  );
  await as.mutation(api.stages.rename, { id: stages[0], namn: "Inkommande" });
  expect(names(await as.query(api.stages.list, {}))[0]).toBe("Inkommande");
  const lead = await t.run((ctx) => ctx.db.get("leads", leadId));
  expect(lead?.stageId).toBe(stages[0]);
});

test("rename rejects empty and duplicate names but allows re-casing itself", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  await expect(as.mutation(api.stages.rename, { id: stages[0], namn: "" })).rejects.toThrow("Namnet får inte vara tomt");
  await expect(as.mutation(api.stages.rename, { id: stages[0], namn: "STÄNGD" })).rejects.toThrow('Det finns redan ett steg som heter "Stängd"');
  await as.mutation(api.stages.rename, { id: stages[0], namn: "LEAD" });
  expect(names(await as.query(api.stages.list, {}))[0]).toBe("LEAD");
});

test("setColor and reorder patch the stage", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  await as.mutation(api.stages.setColor, { id: stages[0], color: "#3f7e8c" });
  await as.mutation(api.stages.reorder, { id: stages[0], order: 10 });
  const list = await as.query(api.stages.list, {});
  expect(list.at(-1)?._id).toBe(stages[0]);
  expect(list.at(-1)?.color).toBe("#3f7e8c");
});

test("stage mutations reject another org's stage", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA0002", email: "a2@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB0002", email: "b2@firma.se" });
  await expect(b.as.mutation(api.stages.rename, { id: a.stages[0], namn: "X" })).rejects.toThrow("Steget saknas");
  await expect(b.as.mutation(api.stages.setColor, { id: a.stages[0], color: "#000000" })).rejects.toThrow("Steget saknas");
  await expect(b.as.mutation(api.stages.reorder, { id: a.stages[0], order: 1 })).rejects.toThrow("Steget saknas");
  await expect(b.as.mutation(api.stages.remove, { id: a.stages[0] })).rejects.toThrow("Steget saknas");
});

test("remove deletes an empty stage", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  await as.mutation(api.stages.remove, { id: stages[2] });
  expect(names(await as.query(api.stages.list, {}))).toEqual(["Lead", "Kvalificerat", "Offererat", "Stängd"]);
});

test("remove moves leads to the target stage and logs the move", async () => {
  const t = convexTest(schema, modules);
  const { as, orgId, stages } = await setupOrg(t);
  const leadId = await t.run((ctx) =>
    ctx.db.insert("leads", { orgId, titel: "L", beskrivning: "", sannolikhet: 10, datum: "2026-10-06", stageId: stages[1], log: [] }),
  );
  await expect(as.mutation(api.stages.remove, { id: stages[1] })).rejects.toThrow("Välj ett steg att flytta affärerna till");
  await expect(as.mutation(api.stages.remove, { id: stages[1], moveToId: stages[1] })).rejects.toThrow("Välj ett annat steg");
  await as.mutation(api.stages.remove, { id: stages[1], moveToId: stages[3] });
  const lead = await t.run((ctx) => ctx.db.get("leads", leadId));
  expect(lead?.stageId).toBe(stages[3]);
  expect(lead?.log.at(-1)).toMatchObject({ from: "Kvalificerat", to: "Offererat" });
  expect(names(await as.query(api.stages.list, {}))).not.toContain("Kvalificerat");
});

test("remove rejects a target stage from another org", async () => {
  const t = convexTest(schema, modules);
  const a = await setupOrg(t, { joinCode: "ORGA0003", email: "a3@firma.se" });
  const b = await setupOrg(t, { joinCode: "ORGB0003", email: "b3@firma.se" });
  await t.run((ctx) =>
    ctx.db.insert("leads", { orgId: a.orgId, titel: "L", beskrivning: "", sannolikhet: 10, datum: "2026-10-06", stageId: a.stages[0], log: [] }),
  );
  await expect(a.as.mutation(api.stages.remove, { id: a.stages[0], moveToId: b.stages[0] })).rejects.toThrow("Steget saknas");
});

test("remove refuses to delete the last stage", async () => {
  const t = convexTest(schema, modules);
  const { as, stages } = await setupOrg(t);
  for (const id of stages.slice(1)) await as.mutation(api.stages.remove, { id });
  await expect(as.mutation(api.stages.remove, { id: stages[0] })).rejects.toThrow("Det sista steget kan inte tas bort");
});
