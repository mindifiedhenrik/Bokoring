import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("boards.create then list returns the board", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.boards.create, { namn: "Sprint" });
  const boards = await u.query(api.boards.list, {});
  expect(boards.map((b) => b._id)).toContain(id);
  expect(boards.find((b) => b._id === id)!.namn).toBe("Sprint");
});

test("boards.rename changes the name", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.boards.create, { namn: "Old" });
  await u.mutation(api.boards.rename, { id, namn: "New" });
  const boards = await u.query(api.boards.list, {});
  expect(boards.find((b) => b._id === id)!.namn).toBe("New");
});

test("boards.remove cascades elements and presence", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const id = await u.mutation(api.boards.create, { namn: "B" });
  const el = await u.mutation(api.boardElements.create, {
    boardId: id, kind: "rect", x: 0, y: 0, w: 10, h: 10, color: "#6b8aa8",
  });
  await u.mutation(api.boardPresence.heartbeat, { boardId: id, x: 1, y: 2 });
  await u.mutation(api.boards.remove, { id });
  expect(await u.query(api.boards.list, {})).toHaveLength(0);
  // Elements for the board are gone (listByBoard throws for a missing board, so check via a fresh board count instead):
  const rows = await t.run(async (ctx) => ctx.db.query("boardElements").collect());
  expect(rows.find((r) => r._id === el)).toBeUndefined();
  const pres = await t.run(async (ctx) => ctx.db.query("boardPresence").collect());
  expect(pres).toHaveLength(0);
});

test("boards.list only returns the active org's boards", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "BRDA1111", email: "ba@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "BRDB1111", email: "bb@firma.se" });
  await orgA.as.mutation(api.boards.create, { namn: "A-board" });
  expect(await orgB.as.query(api.boards.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.boards.list, {})).map((b) => b.namn)).toEqual(["A-board"]);
});

test("boards.remove refuses a board from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "BRDC1111", email: "bc@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "BRDD1111", email: "bd@firma.se" });
  const id = await orgA.as.mutation(api.boards.create, { namn: "A" });
  await expect(orgB.as.mutation(api.boards.remove, { id })).rejects.toThrow();
});
