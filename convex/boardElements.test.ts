import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./test.helpers";

test("create + listByBoard returns the element", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  const id = await u.mutation(api.boardElements.create, {
    boardId, kind: "note", x: 10, y: 20, w: 120, h: 96, text: "Hej", color: "#ffe9a8",
  });
  const els = await u.query(api.boardElements.listByBoard, { boardId });
  expect(els.map((e) => e._id)).toEqual([id]);
  expect(els[0]).toMatchObject({ kind: "note", x: 10, y: 20, text: "Hej" });
});

test("update patches only the given fields", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  const id = await u.mutation(api.boardElements.create, {
    boardId, kind: "rect", x: 0, y: 0, w: 50, h: 50, color: "#6b8aa8",
  });
  await u.mutation(api.boardElements.update, { id, x: 99, color: "#c45b32" });
  const el = (await u.query(api.boardElements.listByBoard, { boardId }))[0];
  expect(el).toMatchObject({ x: 99, y: 0, w: 50, color: "#c45b32" });
});

test("remove deletes the element", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  const id = await u.mutation(api.boardElements.create, {
    boardId, kind: "circle", x: 0, y: 0, w: 40, h: 40, color: "#4f7a52",
  });
  await u.mutation(api.boardElements.remove, { id });
  expect(await u.query(api.boardElements.listByBoard, { boardId })).toHaveLength(0);
});

test("listByBoard refuses a board from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ELA11111", email: "ea@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ELB11111", email: "eb@firma.se" });
  const boardId = await orgA.as.mutation(api.boards.create, { namn: "A" });
  await expect(
    orgB.as.query(api.boardElements.listByBoard, { boardId }),
  ).rejects.toThrow();
});

test("create refuses adding to another org's board", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ELC11111", email: "ec@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ELD11111", email: "ed@firma.se" });
  const boardId = await orgA.as.mutation(api.boards.create, { namn: "A" });
  await expect(
    orgB.as.mutation(api.boardElements.create, {
      boardId, kind: "rect", x: 0, y: 0, w: 10, h: 10, color: "#6b8aa8",
    }),
  ).rejects.toThrow();
});

test("update refuses an element from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ELE11111", email: "ee@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ELF11111", email: "ef@firma.se" });
  const boardId = await orgA.as.mutation(api.boards.create, { namn: "A" });
  const id = await orgA.as.mutation(api.boardElements.create, {
    boardId, kind: "rect", x: 0, y: 0, w: 10, h: 10, color: "#6b8aa8",
  });
  await expect(
    orgB.as.mutation(api.boardElements.update, { id, x: 1 }),
  ).rejects.toThrow();
});

test("create + update persist fontSize and bold", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  const id = await u.mutation(api.boardElements.create, {
    boardId, kind: "text", x: 0, y: 0, w: 200, h: 40, text: "Hi", color: "#1f1b16", fontSize: 24, bold: true,
  });
  let el = (await u.query(api.boardElements.listByBoard, { boardId }))[0];
  expect(el).toMatchObject({ fontSize: 24, bold: true });
  await u.mutation(api.boardElements.update, { id, fontSize: 12, bold: false });
  el = (await u.query(api.boardElements.listByBoard, { boardId }))[0];
  expect(el).toMatchObject({ fontSize: 12, bold: false });
});

test("a rectangle can carry a text label", async () => {
  const t = convexTest(schema, modules);
  const { as: u } = await setupOrg(t);
  const boardId = await u.mutation(api.boards.create, { namn: "B" });
  const id = await u.mutation(api.boardElements.create, {
    boardId, kind: "rect", x: 0, y: 0, w: 100, h: 60, color: "#6b8aa8",
  });
  await u.mutation(api.boardElements.update, { id, text: "Label" });
  const el = (await u.query(api.boardElements.listByBoard, { boardId }))[0];
  expect(el.text).toBe("Label");
});
