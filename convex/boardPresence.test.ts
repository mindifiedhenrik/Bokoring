import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("heartbeat upserts a single row per user/board", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  await u.mutation(api.boardPresence.heartbeat, { boardId, x: 1, y: 1 });
  await u.mutation(api.boardPresence.heartbeat, { boardId, x: 5, y: 6 });
  const rows = await t.run(async (ctx) =>
    ctx.db.query("boardPresence").withIndex("by_board", (q) => q.eq("boardId", boardId)).collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ x: 5, y: 6 });
});

test("listByBoard excludes the caller's own cursor", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  await u.mutation(api.boardPresence.heartbeat, { boardId, x: 1, y: 1 });
  expect(await u.query(api.boardPresence.listByBoard, { boardId })).toHaveLength(0);
});

test("listByBoard returns other users' fresh cursors", async () => {
  const t = convexTest(schema, modules);
  const orgA1 = await setupOrg(t, { joinCode: "PRS11111", email: "p1@firma.se" });
  // Second member of the SAME org:
  const member2 = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "p2@firma.se", activeOrgId: orgA1.orgId });
    await ctx.db.insert("memberships", { userId, orgId: orgA1.orgId });
    return userId;
  });
  const as2 = t.withIdentity({ subject: `${member2}|s` });
  const boardId = await orgA1.as.mutation(api.boards.create, { namn: "B" });
  await as2.mutation(api.boardPresence.heartbeat, { boardId, x: 7, y: 8 });
  const seen = await orgA1.as.query(api.boardPresence.listByBoard, { boardId });
  expect(seen.map((c) => ({ x: c.x, y: c.y }))).toEqual([{ x: 7, y: 8 }]);
});

test("listByBoard returns [] for a board in another org (tolerant read)", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "PRSA1111", email: "pa@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "PRSB1111", email: "pb@firma.se" });
  const boardId = await orgA.as.mutation(api.boards.create, { namn: "A" });
  expect(await orgB.as.query(api.boardPresence.listByBoard, { boardId })).toEqual([]);
});
