import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("leads.create logs the initial stage", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log).toHaveLength(1);
  expect(lead.log[0]).toMatchObject({ from: null, to: "Lead" });
});

test("leads.move appends a stage-change log entry", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  await as.mutation(api.leads.move, { id, steg: "Kvalificerat" });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.steg).toBe("Kvalificerat");
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Kvalificerat" });
});

test("leads.list only returns the active org's leads", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA1111", email: "a@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB1111", email: "b@firma.se" });
  await orgA.as.mutation(api.leads.create, {
    titel: "A-lead", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  const bList = await orgB.as.query(api.leads.list, {});
  expect(bList).toHaveLength(0);
  const aList = await orgA.as.query(api.leads.list, {});
  expect(aList.map((l) => l.titel)).toEqual(["A-lead"]);
});

test("leads.update refuses a lead from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA2222", email: "a2@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB2222", email: "b2@firma.se" });
  const id = await orgA.as.mutation(api.leads.create, {
    titel: "Secret", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  await expect(
    orgB.as.mutation(api.leads.update, {
      id, titel: "Hacked", beskrivning: "", sannolikhet: 99, datum: "2026-06-16", steg: "Lead",
    }),
  ).rejects.toThrow();
});
