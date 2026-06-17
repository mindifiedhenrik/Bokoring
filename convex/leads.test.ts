import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("leads.create logs the initial stage", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log).toHaveLength(1);
  expect(lead.log[0]).toMatchObject({ from: null, to: "Lead" });
});

test("leads.move appends a stage-change log entry", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  await u.mutation(api.leads.move, { id, steg: "Kvalificerat" });
  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.steg).toBe("Kvalificerat");
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Kvalificerat" });
});
