import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("archive sweep archives Done tasks older than the threshold", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  await u.mutation(api.settings.set, { archiveDays: 3, pileThreshold: 3 });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "Old", beskrivning: "", projectId, status: "Done", prioritet: "Normal",
  });

  // Backdate the task's only log entry to 5 days ago.
  await t.run(async (ctx) => {
    const oldTs = new Date(Date.now() - 5 * 86400000).toISOString();
    await ctx.db.patch("tasks", id, { log: [{ ts: oldTs, from: null, to: "Done" }] });
  });

  await t.mutation(internal.crons.archiveStaleDone, {});

  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.archived).toBe(true);
  expect(task.log.at(-1)).toMatchObject({ archived: true });
});
