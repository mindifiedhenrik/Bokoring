# Team Board (Miro-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realtime, org-shared Miro-style board page where users add/delete boards and place editable post-it notes, text, and simple shapes (lines, rectangles, circles) on a pan/zoom canvas, with live cursors.

**Architecture:** Three Convex tables (`boards`, `boardElements`, `boardPresence`), all org-scoped via `requireOrg`, one document per element so concurrent edits don't contend. Frontend renders a hybrid canvas: an SVG layer for shapes (crisp at any zoom) and an absolutely-positioned HTML overlay for notes/text (native `<textarea>` editing), both sharing one pan/zoom transform. Element geometry is edited locally during a drag and committed once on pointer-up; cursors stream live via a throttled heartbeat.

**Tech Stack:** Convex 1.41 (queries/mutations), React 19, TypeScript, Vite, Vitest + convex-test. No router (view switching is state in `App.tsx`). Hand-rolled CSS classes in `src/index.css`.

---

## File structure

**Backend (`convex/`)**
- `schema.ts` (modify) — add `boards`, `boardElements`, `boardPresence` tables + indexes.
- `boards.ts` (create) — `list`, `create`, `rename`, `remove` (cascade).
- `boardElements.ts` (create) — `listByBoard`, `create`, `update`, `remove`.
- `boardPresence.ts` (create) — `heartbeat`, `listByBoard`.
- `boards.test.ts`, `boardElements.test.ts`, `boardPresence.test.ts` (create).

**Frontend (`src/`)**
- `lib/board.ts` (create) — pure geometry/viewport math (no React).
- `lib/board.test.ts` (create) — unit tests for the math.
- `lib/constants.ts` (modify) — add `BOARD_COLORS`, `BOARD_TOOLS`.
- `components/board/BoardView.tsx` (create) — page shell, owns selection/tool/color state.
- `components/board/BoardTabs.tsx` (create) — board switcher + add/delete.
- `components/board/Toolbar.tsx` (create) — tool buttons + color palette.
- `components/board/Canvas.tsx` (create) — pan/zoom surface, pointer handling, layers.
- `components/board/useViewport.ts` (create) — React wrapper over `lib/board.ts` math.
- `components/board/usePresence.ts` (create) — heartbeat + others' cursors.
- `components/board/Cursors.tsx` (create) — render other users' cursors.
- `components/board/SelectionHandles.tsx` (create) — bounding box + resize handles.
- `components/board/elements/NoteElement.tsx`, `TextElement.tsx`, `ShapeElement.tsx` (create).
- `App.tsx` (modify) — add `"board"` to `View`, render `<BoardView />`.
- `components/Sidebar.tsx` (modify) — add `"board"` to `View`, add "Tavla" nav item.
- `index.css` (modify) — board styles.

**Note on testing strategy:** Backend functions and the pure math in `lib/board.ts` are covered by Vitest (TDD). Canvas interaction (pointer/drag) is verified in the browser via the preview workflow at the end of each interaction task — there is no DOM-interaction unit harness in this repo, so do not invent one.

---

## Task 1: Schema — board tables

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the three tables to the schema**

In `convex/schema.ts`, add these table definitions inside the `defineSchema({ ... })` object (place them after the `settings` table, before the closing `})`):

```typescript
  boards: defineTable({
    orgId: v.id("organizations"),
    namn: v.string(),
    order: v.number(),
  }).index("by_org", ["orgId"]),
  boardElements: defineTable({
    orgId: v.id("organizations"),
    boardId: v.id("boards"),
    kind: v.union(
      v.literal("note"),
      v.literal("text"),
      v.literal("line"),
      v.literal("rect"),
      v.literal("circle"),
    ),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    text: v.optional(v.string()),
    color: v.string(),
    order: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_org", ["orgId"]),
  boardPresence: defineTable({
    orgId: v.id("organizations"),
    boardId: v.id("boards"),
    userId: v.id("users"),
    x: v.number(),
    y: v.number(),
    updatedAt: v.number(),
  })
    .index("by_board", ["boardId"])
    .index("by_user_board", ["userId", "boardId"]),
```

- [ ] **Step 2: Typecheck the schema**

Run: `npx tsc --noEmit -p convex/tsconfig.json`
Expected: PASS (no errors). If `convex dev` is running it will also push the schema; that's fine.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(board): add boards, boardElements, boardPresence schema"
```

---

## Task 2: `convex/boards.ts` — board CRUD

**Files:**
- Create: `convex/boards.ts`
- Test: `convex/boards.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `convex/boards.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/boards.test.ts`
Expected: FAIL — `api.boards` does not exist yet.

- [ ] **Step 3: Implement `convex/boards.ts`**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("boards")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const { orgId } = await requireOrg(ctx);
    return await ctx.db.insert("boards", { orgId, namn, order: Date.now() });
  },
});

export const rename = mutation({
  args: { id: v.id("boards"), namn: v.string() },
  handler: async (ctx, { id, namn }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boards", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Tavla saknas");
    await ctx.db.patch("boards", id, { namn });
  },
});

async function deleteByBoard(
  ctx: { db: any },
  table: "boardElements" | "boardPresence",
  boardId: Id<"boards">,
) {
  // Batch-delete to stay within transaction limits (Convex queries have no .delete()).
  while (true) {
    const batch = await ctx.db
      .query(table)
      .withIndex("by_board", (q: any) => q.eq("boardId", boardId))
      .take(100);
    if (batch.length === 0) break;
    for (const row of batch) await ctx.db.delete(table, row._id);
    if (batch.length < 100) break;
  }
}

export const remove = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boards", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Tavla saknas");
    await deleteByBoard(ctx, "boardElements", id);
    await deleteByBoard(ctx, "boardPresence", id);
    await ctx.db.delete("boards", id);
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/boards.test.ts`
Expected: PASS (all 5 tests). The cascade test depends on `boardElements.create` and `boardPresence.heartbeat`, which are implemented in Tasks 3–4. If you run this task in isolation before those exist, this one test will fail to resolve `api.boardElements`/`api.boardPresence` — that is expected; re-run after Task 4. The other 4 tests pass now.

- [ ] **Step 5: Commit**

```bash
git add convex/boards.ts convex/boards.test.ts
git commit -m "feat(board): boards CRUD with cascading delete"
```

---

## Task 3: `convex/boardElements.ts` — element CRUD

**Files:**
- Create: `convex/boardElements.ts`
- Test: `convex/boardElements.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `convex/boardElements.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/boardElements.test.ts`
Expected: FAIL — `api.boardElements` does not exist yet.

- [ ] **Step 3: Implement `convex/boardElements.ts`**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";
import { Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";

const kindValidator = v.union(
  v.literal("note"),
  v.literal("text"),
  v.literal("line"),
  v.literal("rect"),
  v.literal("circle"),
);

async function requireBoard(ctx: QueryCtx, orgId: Id<"organizations">, boardId: Id<"boards">) {
  const board = await ctx.db.get("boards", boardId);
  if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
  return board;
}

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { orgId } = await requireOrg(ctx);
    await requireBoard(ctx, orgId, boardId);
    const rows = await ctx.db
      .query("boardElements")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: {
    boardId: v.id("boards"),
    kind: kindValidator,
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    text: v.optional(v.string()),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    await requireBoard(ctx, orgId, args.boardId);
    return await ctx.db.insert("boardElements", { ...args, orgId, order: Date.now() });
  },
});

export const update = mutation({
  args: {
    id: v.id("boardElements"),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    text: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boardElements", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Elementet saknas");
    // Drop undefined keys so patch only touches provided fields.
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await ctx.db.patch("boardElements", id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("boardElements") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("boardElements", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Elementet saknas");
    await ctx.db.delete("boardElements", id);
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/boardElements.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/boardElements.ts convex/boardElements.test.ts
git commit -m "feat(board): board element CRUD"
```

---

## Task 4: `convex/boardPresence.ts` — live cursors

**Files:**
- Create: `convex/boardPresence.ts`
- Test: `convex/boardPresence.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `convex/boardPresence.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/boardPresence.test.ts`
Expected: FAIL — `api.boardPresence` does not exist yet.

- [ ] **Step 3: Implement `convex/boardPresence.ts`**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

const STALE_MS = 10_000;

export const heartbeat = mutation({
  args: { boardId: v.id("boards"), x: v.number(), y: v.number() },
  handler: async (ctx, { boardId, x, y }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const board = await ctx.db.get("boards", boardId);
    if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
    const existing = await ctx.db
      .query("boardPresence")
      .withIndex("by_user_board", (q) => q.eq("userId", userId).eq("boardId", boardId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("boardPresence", existing._id, { x, y, updatedAt: now });
    } else {
      await ctx.db.insert("boardPresence", { orgId, boardId, userId, x, y, updatedAt: now });
    }
  },
});

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const { orgId, userId } = await requireOrg(ctx);
    const board = await ctx.db.get("boards", boardId);
    if (!board || board.orgId !== orgId) throw new Error("Tavla saknas");
    const cutoff = Date.now() - STALE_MS;
    // One row per active user — bounded by org membership, so collect() is safe here.
    const rows = await ctx.db
      .query("boardPresence")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    const others = rows.filter((r) => r.userId !== userId && r.updatedAt >= cutoff);
    const withNames = await Promise.all(
      others.map(async (r) => {
        const profile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user", (q) => q.eq("userId", r.userId))
          .unique();
        const user = await ctx.db.get("users", r.userId);
        return {
          userId: r.userId,
          x: r.x,
          y: r.y,
          name: profile?.displayName ?? user?.email ?? "Användare",
        };
      }),
    );
    return withNames;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/boardPresence.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Re-run the full backend suite (covers Task 2's cascade test)**

Run: `npx vitest run convex/boards.test.ts convex/boardElements.test.ts convex/boardPresence.test.ts`
Expected: PASS (all tests across the three files).

- [ ] **Step 6: Commit**

```bash
git add convex/boardPresence.ts convex/boardPresence.test.ts
git commit -m "feat(board): live cursor presence"
```

---

## Task 5: Pure viewport/geometry math + constants

**Files:**
- Create: `src/lib/board.ts`
- Test: `src/lib/board.test.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/board.test.ts`:

```typescript
import { expect, test } from "vitest";
import { screenToWorld, worldToScreen, zoomAt, clampZoom, normalizeRect } from "./board";

test("worldToScreen and screenToWorld round-trip", () => {
  const vp = { panX: 30, panY: -12, zoom: 1.5 };
  const world = { x: 40, y: 80 };
  const screen = worldToScreen(world, vp);
  expect(screenToWorld(screen, vp)).toEqual(world);
});

test("zoomAt keeps the point under the cursor fixed", () => {
  const vp = { panX: 0, panY: 0, zoom: 1 };
  const cursor = { x: 200, y: 100 };
  const before = screenToWorld(cursor, vp);
  const next = zoomAt(vp, cursor, 2); // zoom in 2x at the cursor
  const after = screenToWorld(cursor, next);
  expect(after.x).toBeCloseTo(before.x, 6);
  expect(after.y).toBeCloseTo(before.y, 6);
  expect(next.zoom).toBe(2);
});

test("clampZoom bounds the zoom factor", () => {
  expect(clampZoom(0.01)).toBe(0.2);
  expect(clampZoom(99)).toBe(4);
  expect(clampZoom(1)).toBe(1);
});

test("normalizeRect turns a negative-size drag into a positive rect", () => {
  expect(normalizeRect({ x: 100, y: 100, w: -40, h: -20 })).toEqual({
    x: 60, y: 80, w: 40, h: 20,
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/board.test.ts`
Expected: FAIL — `./board` does not exist.

- [ ] **Step 3: Implement `src/lib/board.ts`**

```typescript
export type Point = { x: number; y: number };
export type Viewport = { panX: number; panY: number; zoom: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// world -> screen (screen = world * zoom + pan)
export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.panX, y: p.y * vp.zoom + vp.panY };
}

// screen -> world (world = (screen - pan) / zoom)
export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.panX) / vp.zoom, y: (p.y - vp.panY) / vp.zoom };
}

// Multiply zoom by `factor`, keeping the world point under `cursor` (screen coords) fixed.
export function zoomAt(vp: Viewport, cursor: Point, factor: number): Viewport {
  const nextZoom = clampZoom(vp.zoom * factor);
  const world = screenToWorld(cursor, vp);
  return {
    zoom: nextZoom,
    panX: cursor.x - world.x * nextZoom,
    panY: cursor.y - world.y * nextZoom,
  };
}

// Normalize a possibly-negative drag rectangle to a top-left origin with positive size.
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/board.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Add board constants**

In `src/lib/constants.ts`, append:

```typescript
// Board element color palette (presentation-only; backend stores whatever string the client sends).
export const BOARD_COLORS = ["#ffe9a8", "#f7c9d6", "#c8e6c9", "#bbdefb", "#d1c4e9", "#ffccbc", "#1f1b16"];

export const BOARD_TOOLS = ["select", "note", "text", "rect", "circle", "line"] as const;
export type BoardTool = (typeof BOARD_TOOLS)[number];
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/board.ts src/lib/board.test.ts src/lib/constants.ts
git commit -m "feat(board): viewport math, geometry helpers, palette constants"
```

---

## Task 6: App + Sidebar wiring with a placeholder BoardView

**Files:**
- Create: `src/components/board/BoardView.tsx` (placeholder for now)
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create a minimal `BoardView.tsx`**

```tsx
export default function BoardView() {
  return <div className="board-view">Tavla</div>;
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

In `src/App.tsx`:
- Change the `View` type to: `type View = "kanban" | "contacts" | "tasks" | "roadmap" | "board";`
- Add the import: `import BoardView from "./components/board/BoardView";`
- In the `<main>` block add: `{view === "board" && <BoardView />}`

- [ ] **Step 3: Add the nav item in `Sidebar.tsx`**

In `src/components/Sidebar.tsx`:
- Change the `View` type to include `"board"` (same union as App).
- Add a query for board count near the others: `const boards = useQuery(api.boards.list) ?? [];`
- Add this nav item after the Roadmap nav item (before the settings button):

```tsx
      <div
        className={"nav-item" + (view === "board" ? " active" : "")}
        onClick={() => onNavigate("board")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <rect x="7" y="7" width="4" height="4" rx="1"/>
          <circle cx="16" cy="9" r="2"/>
          <line x1="7" y1="15" x2="17" y2="15"/>
        </svg>
        <span>Tavla</span>
        <span className="count">{boards.length}</span>
      </div>
```

- [ ] **Step 4: Verify it builds and the nav item appears**

Run: `npx tsc --noEmit`
Expected: PASS.

Then verify in the browser (preview workflow): start the dev server, confirm a "Tavla" item shows in the sidebar and clicking it shows the "Tavla" placeholder in the main area with no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/components/board/BoardView.tsx
git commit -m "feat(board): add Tavla nav item and route"
```

---

## Task 7: Board tabs (add / switch / delete)

**Files:**
- Create: `src/components/board/BoardTabs.tsx`
- Modify: `src/components/board/BoardView.tsx`

- [ ] **Step 1: Implement `BoardTabs.tsx`**

```tsx
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useToast } from "../../context/ToastContext";

type Board = { _id: Id<"boards">; namn: string };

export default function BoardTabs({
  boards, activeId, onSelect,
}: {
  boards: Board[];
  activeId: Id<"boards"> | null;
  onSelect: (id: Id<"boards">) => void;
}) {
  const create = useMutation(api.boards.create);
  const remove = useMutation(api.boards.remove);
  const toast = useToast();

  const addBoard = async () => {
    const namn = window.prompt("Namn på tavlan?", "Ny tavla")?.trim();
    if (!namn) return;
    const id = await create({ namn });
    onSelect(id);
  };

  const deleteBoard = async (id: Id<"boards">, namn: string) => {
    if (!window.confirm(`Ta bort tavlan "${namn}" och allt innehåll?`)) return;
    await remove({ id });
    toast("Tavla borttagen");
  };

  return (
    <div className="board-tabs">
      {boards.map((b) => (
        <div
          key={b._id}
          className={"board-tab" + (b._id === activeId ? " active" : "")}
          onClick={() => onSelect(b._id)}
        >
          <span>{b.namn}</span>
          {b._id === activeId && (
            <button
              className="board-tab-del"
              title="Ta bort tavla"
              onClick={(e) => { e.stopPropagation(); deleteBoard(b._id, b.namn); }}
            >×</button>
          )}
        </div>
      ))}
      <button className="board-tab-add" onClick={addBoard}>+ Ny tavla</button>
    </div>
  );
}
```

- [ ] **Step 2: Update `BoardView.tsx` to load boards and host the tabs**

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import BoardTabs from "./BoardTabs";

export default function BoardView() {
  const boards = useQuery(api.boards.list) ?? [];
  const [activeId, setActiveId] = useState<Id<"boards"> | null>(null);

  // Default to the first board once boards load / after deletion.
  useEffect(() => {
    if (boards.length === 0) { setActiveId(null); return; }
    if (!activeId || !boards.some((b) => b._id === activeId)) {
      setActiveId(boards[0]._id);
    }
  }, [boards, activeId]);

  return (
    <div className="board-view">
      <BoardTabs boards={boards} activeId={activeId} onSelect={setActiveId} />
      {activeId === null ? (
        <div className="board-empty">Ingen tavla ännu. Skapa en med "+ Ny tavla".</div>
      ) : (
        <div className="board-placeholder">Tavla vald: {activeId}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Run the preview workflow: typecheck (`npx tsc --noEmit`), then in the browser create a board via "+ Ny tavla", confirm a tab appears and is active, switch between two boards, delete the active board and confirm it disappears and selection falls back. Check the console for errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/BoardTabs.tsx src/components/board/BoardView.tsx
git commit -m "feat(board): board tabs with add/switch/delete"
```

---

## Task 8: Toolbar (tool selection + color palette)

**Files:**
- Create: `src/components/board/Toolbar.tsx`

- [ ] **Step 1: Implement `Toolbar.tsx`**

```tsx
import { BOARD_COLORS, type BoardTool } from "../../lib/constants";

const TOOL_LABELS: Record<BoardTool, string> = {
  select: "Markera",
  note: "Notis",
  text: "Text",
  rect: "Rektangel",
  circle: "Cirkel",
  line: "Linje",
};

const TOOL_ICON: Record<BoardTool, string> = {
  select: "↖", note: "▣", text: "T", rect: "▭", circle: "◯", line: "／",
};

export default function Toolbar({
  tool, color, onTool, onColor,
}: {
  tool: BoardTool;
  color: string;
  onTool: (t: BoardTool) => void;
  onColor: (c: string) => void;
}) {
  return (
    <div className="board-toolbar">
      <div className="board-tools">
        {(Object.keys(TOOL_LABELS) as BoardTool[]).map((t) => (
          <button
            key={t}
            className={"board-tool" + (t === tool ? " active" : "")}
            title={TOOL_LABELS[t]}
            onClick={() => onTool(t)}
          >{TOOL_ICON[t]}</button>
        ))}
      </div>
      <div className="board-colors">
        {BOARD_COLORS.map((c) => (
          <button
            key={c}
            className={"board-swatch" + (c === color ? " active" : "")}
            style={{ background: c }}
            title={c}
            onClick={() => onColor(c)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it from `BoardView.tsx` and hold tool/color state**

In `BoardView.tsx` add imports and state:

```tsx
import { BOARD_COLORS, type BoardTool } from "../../lib/constants";
import Toolbar from "./Toolbar";
```

Inside the component (after the `activeId` state):

```tsx
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
```

Render `<Toolbar tool={tool} color={color} onTool={setTool} onColor={setColor} />` between `<BoardTabs .../>` and the placeholder/empty block.

- [ ] **Step 3: Verify in the browser**

Typecheck, then confirm the toolbar renders, a tool highlights when clicked, and a color swatch highlights when clicked. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/Toolbar.tsx src/components/board/BoardView.tsx
git commit -m "feat(board): toolbar with tools and color palette"
```

---

## Task 9: Canvas — viewport, rendering layers, element components

**Files:**
- Create: `src/components/board/useViewport.ts`
- Create: `src/components/board/elements/ShapeElement.tsx`
- Create: `src/components/board/elements/NoteElement.tsx`
- Create: `src/components/board/elements/TextElement.tsx`
- Create: `src/components/board/Canvas.tsx`
- Modify: `src/components/board/BoardView.tsx`

This task renders existing elements with working pan/zoom but no creation/selection yet.

- [ ] **Step 1: Implement `useViewport.ts`**

```tsx
import { useCallback, useState } from "react";
import { screenToWorld, worldToScreen, zoomAt, type Point, type Viewport } from "../../lib/board";

export function useViewport() {
  const [vp, setVp] = useState<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  const pan = useCallback((dx: number, dy: number) => {
    setVp((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
  }, []);
  const zoom = useCallback((cursor: Point, factor: number) => {
    setVp((v) => zoomAt(v, cursor, factor));
  }, []);
  const toWorld = useCallback((p: Point) => screenToWorld(p, vp), [vp]);
  const toScreen = useCallback((p: Point) => worldToScreen(p, vp), [vp]);
  return { vp, pan, zoom, toWorld, toScreen };
}
```

- [ ] **Step 2: Implement `elements/ShapeElement.tsx`**

```tsx
import type { Doc } from "../../../../convex/_generated/dataModel";

// Renders one shape element as an SVG primitive in world coordinates.
// (x,y,w,h) are world coords; the parent <g> applies the pan/zoom transform.
export default function ShapeElement({ el, selected }: { el: Doc<"boardElements">; selected: boolean }) {
  const stroke = el.color;
  const sw = selected ? 3 : 2;
  if (el.kind === "line") {
    return <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />;
  }
  if (el.kind === "rect") {
    return <rect x={el.x} y={el.y} width={Math.max(1, el.w)} height={Math.max(1, el.h)} fill="none" stroke={stroke} strokeWidth={sw} rx={4} />;
  }
  // circle: bounding box (x,y,w,h) -> ellipse
  return (
    <ellipse
      cx={el.x + el.w / 2}
      cy={el.y + el.h / 2}
      rx={Math.max(1, Math.abs(el.w / 2))}
      ry={Math.max(1, Math.abs(el.h / 2))}
      fill="none" stroke={stroke} strokeWidth={sw}
    />
  );
}
```

- [ ] **Step 3: Implement `elements/NoteElement.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";

export default function NoteElement({
  el, selected, editing, onCommitText, onStartEdit,
}: {
  el: Doc<"boardElements">;
  selected: boolean;
  editing: boolean;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
}) {
  const [draft, setDraft] = useState(el.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { setDraft(el.text ?? ""); ref.current?.focus(); } }, [editing, el.text]);

  return (
    <div
      className={"board-note" + (selected ? " selected" : "")}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, background: el.color }}
      onDoubleClick={onStartEdit}
      data-element-id={el._id}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitText(draft)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } }}
        />
      ) : (
        <div className="board-note-text">{el.text}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `elements/TextElement.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";

export default function TextElement({
  el, selected, editing, onCommitText, onStartEdit,
}: {
  el: Doc<"boardElements">;
  selected: boolean;
  editing: boolean;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
}) {
  const [draft, setDraft] = useState(el.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { setDraft(el.text ?? ""); ref.current?.focus(); } }, [editing, el.text]);

  return (
    <div
      className={"board-text" + (selected ? " selected" : "")}
      style={{ left: el.x, top: el.y, width: el.w, color: el.color }}
      onDoubleClick={onStartEdit}
      data-element-id={el._id}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitText(draft)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } }}
        />
      ) : (
        <div className="board-text-content">{el.text || "Text"}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `Canvas.tsx` (render-only pan/zoom)**

```tsx
import { useRef } from "react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useViewport } from "./useViewport";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";

type El = Doc<"boardElements">;

export default function Canvas({ elements }: { elements: El[] }) {
  const { vp, pan, zoom } = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Pan only when the empty canvas is the target.
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("board-svg")) {
      dragging.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) {
      pan(e.clientX - dragging.current.x, e.clientY - dragging.current.y);
      dragging.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = () => { dragging.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoom(cursor, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  const transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
  const shapes = elements.filter((el) => el.kind === "line" || el.kind === "rect" || el.kind === "circle");
  const htmlEls = elements.filter((el) => el.kind === "note" || el.kind === "text");

  return (
    <div
      ref={ref}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <svg className="board-svg" width="100%" height="100%">
        <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>
          {shapes.map((el) => (
            <ShapeElement key={el._id} el={el} selected={false} />
          ))}
        </g>
      </svg>
      <div className="board-html-layer" style={{ transform, transformOrigin: "0 0" }}>
        {htmlEls.map((el) =>
          el.kind === "note" ? (
            <NoteElement key={el._id} el={el} selected={false} editing={false} onCommitText={() => {}} onStartEdit={() => {}} />
          ) : (
            <TextElement key={el._id} el={el} selected={false} editing={false} onCommitText={() => {}} onStartEdit={() => {}} />
          ),
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Load elements in `BoardView.tsx` and render the canvas**

In `BoardView.tsx`:
- Add import: `import Canvas from "./Canvas";`
- Add the elements query (skips when no board is active):

```tsx
  const elements = useQuery(api.boardElements.listByBoard, activeId ? { boardId: activeId } : "skip") ?? [];
```

- Replace the `board-placeholder` block with: `<Canvas elements={elements} />`

- [ ] **Step 7: Verify pan/zoom in the browser**

Typecheck, then (with a board selected) confirm: dragging the empty canvas pans, mouse-wheel zooms toward the cursor, and the page has no console errors. There are no elements to see yet — that's fine.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/useViewport.ts src/components/board/Canvas.tsx src/components/board/elements src/components/board/BoardView.tsx
git commit -m "feat(board): canvas with pan/zoom and element rendering"
```

---

## Task 10: Create elements with the tools

**Files:**
- Modify: `src/components/board/Canvas.tsx`
- Modify: `src/components/board/BoardView.tsx`

- [ ] **Step 1: Pass tool/color/board props and a create handler into Canvas**

In `BoardView.tsx`, change the Canvas render to:

```tsx
<Canvas boardId={activeId} elements={elements} tool={tool} color={color} onToolDone={() => setTool("select")} />
```

(`onToolDone` lets the canvas snap back to the select tool after placing a one-shot element; keep the drawing tool active otherwise — see Step 2.)

- [ ] **Step 2: Implement creation in `Canvas.tsx`**

Update the component signature and add creation logic. Replace the top of the component and the pointer handlers:

```tsx
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { normalizeRect } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";

export default function Canvas({
  boardId, elements, tool, color,
}: {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  color: string;
}) {
  const { vp, pan, zoom, toWorld } = useViewport();
  const create = useMutation(api.boardElements.create);
  const ref = useRef<HTMLDivElement>(null);
  const panState = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const screenInCanvas = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
```

Replace `onPointerDown`/`onPointerMove`/`onPointerUp` with:

```tsx
  const onPointerDown = (e: React.PointerEvent) => {
    const onEmpty = e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("board-svg");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      if (onEmpty) panState.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // Drawing tools start from the world point under the cursor.
    const w = toWorld(screenInCanvas(e));
    drawStart.current = w;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panState.current) {
      pan(e.clientX - panState.current.x, e.clientY - panState.current.y);
      panState.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    panState.current = null;
    const start = drawStart.current;
    drawStart.current = null;
    if (tool === "select" || !start) return;
    const end = toWorld(screenInCanvas(e));

    if (tool === "note") {
      await create({ boardId, kind: "note", x: start.x, y: start.y, w: 160, h: 120, text: "", color });
    } else if (tool === "text") {
      await create({ boardId, kind: "text", x: start.x, y: start.y, w: 200, h: 40, text: "", color });
    } else if (tool === "line") {
      await create({ boardId, kind: "line", x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, color });
    } else {
      // rect / circle: normalize the drag box; fall back to a default size on a bare click.
      let r = normalizeRect({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
      if (r.w < 4 && r.h < 4) r = { x: start.x, y: start.y, w: 120, h: 90 };
      await create({ boardId, kind: tool, x: r.x, y: r.y, w: r.w, h: r.h, color });
    }
  };
```

Note: `tool` and `color` are now props (remove the old render-only signature). The `onWheel` handler and the JSX layers are unchanged from Task 9 except that `Canvas` no longer needs `onToolDone` — drawing tools stay active so the user can place several; they switch tools manually. (Remove the `onToolDone` prop from the `BoardView` render in Step 1 if you did not use it.)

- [ ] **Step 3: Reconcile the BoardView render**

Ensure the `BoardView.tsx` Canvas render matches the final props:

```tsx
<Canvas boardId={activeId} elements={elements} tool={tool} color={color} />
```

- [ ] **Step 4: Verify in the browser**

Typecheck, then: pick the Notis tool and click → a note appears; pick Rektangel and drag → a rectangle appears; pick Cirkel and drag → an ellipse; pick Linje and drag → a line; pick Text and click → a text element. Confirm they persist on reload (realtime/Convex) and there are no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/Canvas.tsx src/components/board/BoardView.tsx
git commit -m "feat(board): create notes, text and shapes with the tools"
```

---

## Task 11: Select, move, resize, delete

**Files:**
- Create: `src/components/board/SelectionHandles.tsx`
- Modify: `src/components/board/Canvas.tsx`

- [ ] **Step 1: Implement `SelectionHandles.tsx` (SVG, world coords)**

```tsx
import type { Doc } from "../../../convex/_generated/dataModel";
import { normalizeRect } from "../../lib/board";

// Renders a selection box + corner handles for an element, inside the SVG <g>.
// onResizeStart reports which corner the user grabbed.
export default function SelectionHandles({
  el, onResizeStart,
}: {
  el: Doc<"boardElements">;
  onResizeStart: (corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => void;
}) {
  const box = el.kind === "line"
    ? normalizeRect({ x: el.x, y: el.y, w: el.w, h: el.h })
    : { x: el.x, y: el.y, w: Math.max(1, el.w), h: Math.max(1, el.h) };
  const corners: Array<{ id: "nw" | "ne" | "sw" | "se"; cx: number; cy: number }> = [
    { id: "nw", cx: box.x, cy: box.y },
    { id: "ne", cx: box.x + box.w, cy: box.y },
    { id: "sw", cx: box.x, cy: box.y + box.h },
    { id: "se", cx: box.x + box.w, cy: box.y + box.h },
  ];
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#c45b32" strokeDasharray="4 3" strokeWidth={1} />
      {corners.map((c) => (
        <rect
          key={c.id}
          x={c.cx - 5} y={c.cy - 5} width={10} height={10}
          fill="#fffdf8" stroke="#c45b32" strokeWidth={1}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(c.id, e); }}
        />
      ))}
    </g>
  );
}
```

Note: handle sizes are in world units, so they shrink/grow with zoom. That is acceptable for v1.

- [ ] **Step 2: Add selection/move/resize state to `Canvas.tsx`**

Add props for selection (lifted to `BoardView` so the Toolbar's color can recolor the selected element later):

```tsx
  selectedId, onSelect,
}: {
  // ...existing props...
  selectedId: Id<"boardElements"> | null;
  onSelect: (id: Id<"boardElements"> | null) => void;
}) {
```

Add mutation + drag refs near the others:

```tsx
  const update = useMutation(api.boardElements.update);
  const removeEl = useMutation(api.boardElements.remove);
  const [drag, setDrag] = useState<null | {
    id: Id<"boardElements">;
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startWorld: { x: number; y: number };
    orig: { x: number; y: number; w: number; h: number };
    live: { x: number; y: number; w: number; h: number };
  }>(null);
```

- [ ] **Step 3: Wire element selection + move start**

Give each rendered element an `onPointerDown` that selects and starts a move when the select tool is active. In the HTML layer, pass an `onPointerDown` to `NoteElement`/`TextElement` wrappers; in the SVG layer wrap each `ShapeElement` in a `<g onPointerDown=...>`. Use this shared handler:

```tsx
  const startMove = (el: El, e: React.PointerEvent) => {
    if (tool !== "select") return;
    e.stopPropagation();
    (ref.current as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(el._id);
    setDrag({
      id: el._id, mode: "move",
      startWorld: toWorld(screenInCanvas(e)),
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
      live: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };
```

For shapes, render inside the `<g transform=...>`:

```tsx
{shapes.map((el) => (
  <g key={el._id} onPointerDown={(e) => startMove(el, e)} style={{ cursor: tool === "select" ? "move" : "crosshair" }}>
    <ShapeElement el={drag?.id === el._id ? { ...el, ...drag.live } : el} selected={el._id === selectedId} />
  </g>
))}
{selectedId && (() => {
  const sel = elements.find((x) => x._id === selectedId);
  return sel ? <SelectionHandles el={drag?.id === sel._id ? { ...sel, ...drag.live } : sel} onResizeStart={(corner, e) => startResize(sel, corner, e)} /> : null;
})()}
```

For HTML elements, pass `onPointerDown={(e) => startMove(el, e)}` down to `NoteElement`/`TextElement` (add an optional `onPointerDown` prop to each and spread it on the root div), and render the live override the same way: `el={drag?.id === el._id ? { ...el, ...drag.live } : el}`.

- [ ] **Step 4: Implement resize start, drag move, and commit-on-up**

```tsx
  const startResize = (el: El, corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
    (ref.current as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(el._id);
    setDrag({
      id: el._id, mode: corner,
      startWorld: toWorld(screenInCanvas(e)),
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
      live: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };
```

Extend `onPointerMove` to update the live drag geometry:

```tsx
    if (drag) {
      const w = toWorld(screenInCanvas(e));
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      const o = drag.orig;
      let live = { ...o };
      if (drag.mode === "move") {
        live = { ...o, x: o.x + dx, y: o.y + dy };
      } else {
        // Resize from a corner; allow negative -> handled at commit via normalizeRect for box shapes.
        if (drag.mode === "nw") live = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
        if (drag.mode === "ne") live = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
        if (drag.mode === "sw") live = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
        if (drag.mode === "se") live = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      }
      setDrag({ ...drag, live });
      return;
    }
```

Extend `onPointerUp` (before the drawing logic) to commit a move/resize:

```tsx
    if (drag) {
      const el = elements.find((x) => x._id === drag.id);
      let geo = drag.live;
      // Keep box shapes/notes positive; lines may stay as a vector.
      if (el && el.kind !== "line") geo = normalizeRect(geo);
      await update({ id: drag.id, x: geo.x, y: geo.y, w: geo.w, h: geo.h });
      setDrag(null);
      return;
    }
```

Also: clicking empty canvas with the select tool should clear selection — in `onPointerDown`, when `tool === "select"` and `onEmpty`, call `onSelect(null)` before starting the pan.

- [ ] **Step 5: Delete via keyboard**

In `Canvas.tsx`, add an effect:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const active = document.activeElement;
        if (active && active.tagName === "TEXTAREA") return; // don't delete while editing text
        removeEl({ id: selectedId });
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeEl, onSelect]);
```

(Add `import { useEffect } from "react";`.)

- [ ] **Step 6: Lift selection state into `BoardView.tsx`**

```tsx
  const [selectedId, setSelectedId] = useState<Id<"boardElements"> | null>(null);
```

Pass `selectedId={selectedId} onSelect={setSelectedId}` to `<Canvas .../>`. Clear selection when the active board changes (extend the existing effect or add `useEffect(() => setSelectedId(null), [activeId])`).

- [ ] **Step 7: Verify in the browser**

Typecheck, then with the Markera tool: click an element to select (handles appear), drag it to move (commits on release, persists on reload), drag a corner to resize, press Delete to remove it, click empty space to deselect. No console errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/SelectionHandles.tsx src/components/board/Canvas.tsx src/components/board/BoardView.tsx src/components/board/elements
git commit -m "feat(board): select, move, resize and delete elements"
```

---

## Task 12: Text editing + recolor selected element

**Files:**
- Modify: `src/components/board/Canvas.tsx`
- Modify: `src/components/board/BoardView.tsx`

- [ ] **Step 1: Track which element is being edited in `Canvas.tsx`**

```tsx
  const [editingId, setEditingId] = useState<Id<"boardElements"> | null>(null);
```

Pass `editing={el._id === editingId}`, `onStartEdit={() => { onSelect(el._id); setEditingId(el._id); }}`, and an `onCommitText` that writes and clears editing:

```tsx
  const commitText = async (id: Id<"boardElements">, text: string) => {
    await update({ id, text });
    setEditingId(null);
  };
```

Wire `onCommitText={(text) => commitText(el._id, text)}` into both `NoteElement` and `TextElement`. Clear `editingId` when selection is cleared.

- [ ] **Step 2: Recolor the selected element when a swatch is clicked**

Lift this into `BoardView.tsx`: change `onColor` so that when an element is selected, it patches that element's color too:

```tsx
  const updateEl = useMutation(api.boardElements.update);
  const handleColor = (c: string) => {
    setColor(c);
    if (selectedId) updateEl({ id: selectedId, color: c });
  };
```

Add `import { useMutation } from "convex/react";` and pass `onColor={handleColor}` to `<Toolbar .../>`.

- [ ] **Step 3: Verify in the browser**

Typecheck, then: double-click a note → edit text → blur commits and the text persists on reload; double-click a text element and edit; select a shape and click a color swatch → the shape recolors and persists. Confirm typing Backspace inside the textarea does NOT delete the element. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/board/Canvas.tsx src/components/board/BoardView.tsx
git commit -m "feat(board): text editing and recolor selected element"
```

---

## Task 13: Live cursors

**Files:**
- Create: `src/components/board/usePresence.ts`
- Create: `src/components/board/Cursors.tsx`
- Modify: `src/components/board/Canvas.tsx`

- [ ] **Step 1: Implement `usePresence.ts` (throttled heartbeat + others)**

```tsx
import { useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Point } from "../../lib/board";

export function usePresence(boardId: Id<"boards"> | null) {
  const heartbeat = useMutation(api.boardPresence.heartbeat);
  const others = useQuery(api.boardPresence.listByBoard, boardId ? { boardId } : "skip") ?? [];
  const last = useRef(0);
  const report = useCallback((world: Point) => {
    if (!boardId) return;
    const now = Date.now();
    if (now - last.current < 60) return; // throttle to ~16/sec
    last.current = now;
    heartbeat({ boardId, x: world.x, y: world.y });
  }, [boardId, heartbeat]);
  return { others, report };
}
```

- [ ] **Step 2: Implement `Cursors.tsx` (renders inside the SVG `<g>`, world coords)**

```tsx
type Cursor = { userId: string; x: number; y: number; name: string };

export default function Cursors({ cursors }: { cursors: Cursor[] }) {
  return (
    <g className="board-cursors">
      {cursors.map((c) => (
        <g key={c.userId} transform={`translate(${c.x}, ${c.y})`}>
          <path d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L11 11 Z" fill="#8a567a" stroke="#fff" strokeWidth={0.5} />
          <text x={12} y={14} fontSize={11} fill="#8a567a" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>{c.name}</text>
        </g>
      ))}
    </g>
  );
}
```

Note: cursor glyph scales with zoom (it lives in the transformed `<g>`). Acceptable for v1.

- [ ] **Step 3: Wire presence into `Canvas.tsx`**

- Add `import { usePresence } from "./usePresence";` and `import Cursors from "./Cursors";`.
- Inside the component: `const { others, report } = usePresence(boardId);`
- In `onPointerMove`, after the existing logic (regardless of drag), report the cursor: `report(toWorld(screenInCanvas(e)));`
- Render `<Cursors cursors={others} />` as the last child inside the SVG `<g transform=...>` (so it shares pan/zoom).

- [ ] **Step 4: Verify with two sessions**

Typecheck. Then open the app in two browser profiles (or two windows signed in as two members of the same org), open the same board in both, and move the mouse in one — confirm the other shows a moving labeled cursor within ~1s, and it disappears after the mover leaves/goes idle (>10s). No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/usePresence.ts src/components/board/Cursors.tsx src/components/board/Canvas.tsx
git commit -m "feat(board): live cursors via presence heartbeat"
```

---

## Task 14: Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append board styles using existing CSS variables**

Add to `src/index.css`:

```css
/* ---- Team board ---- */
.board-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.board-tabs { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--card); flex-wrap: wrap; }
.board-tab { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: var(--radius-sm); background: var(--paper); border: 1px solid var(--line); cursor: pointer; font-size: 13px; }
.board-tab.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.board-tab-del { border: none; background: transparent; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; }
.board-tab-add { padding: 5px 12px; border-radius: var(--radius-sm); border: 1px dashed var(--line); background: transparent; color: var(--ink-soft); cursor: pointer; font-size: 13px; }
.board-toolbar { display: flex; align-items: center; gap: 16px; padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--card); }
.board-tools, .board-colors { display: flex; gap: 6px; }
.board-tool { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; }
.board-tool.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.board-swatch { width: 24px; height: 24px; border-radius: 6px; border: 2px solid var(--line); cursor: pointer; padding: 0; }
.board-swatch.active { border-color: var(--ink); box-shadow: var(--shadow-sm); }
.board-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); }
.board-canvas { position: relative; flex: 1; min-height: 0; overflow: hidden; background:
    radial-gradient(circle, var(--line) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--paper); touch-action: none; cursor: grab; }
.board-svg { position: absolute; inset: 0; }
.board-html-layer { position: absolute; inset: 0; pointer-events: none; }
.board-html-layer > * { pointer-events: auto; position: absolute; }
.board-note { border-radius: 4px; box-shadow: var(--shadow-md); padding: 8px; box-sizing: border-box; overflow: hidden; font-size: 13px; color: var(--ink); }
.board-note.selected { outline: 2px solid var(--accent); }
.board-note textarea, .board-text textarea { width: 100%; height: 100%; border: none; background: transparent; resize: none; outline: none; font: inherit; color: inherit; }
.board-note-text { white-space: pre-wrap; word-break: break-word; }
.board-text { font-size: 16px; }
.board-text.selected { outline: 1px dashed var(--accent); }
.board-text-content { white-space: pre-wrap; word-break: break-word; }
.board-cursors text { user-select: none; }
```

- [ ] **Step 2: Final full verification**

- Run the whole test suite: `npm test` — Expected: PASS (all existing + new board tests).
- Run: `npx tsc --noEmit` — Expected: PASS.
- Browser pass: create a board, add a note/text/rect/circle/line, edit text, move/resize, recolor, delete, switch boards, delete a board. Confirm the grid canvas, toolbar, and tabs look consistent with the app's warm theme and there are no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(board): board styling"
```

---

## Self-review notes (addressed)

- **Spec coverage:** boards add/delete (Tasks 2, 7), post-it notes (Tasks 3, 9, 10, 12), text (same), shapes line/rect/circle (Tasks 3, 9, 10), pan/zoom/select/move/resize (Tasks 5, 9, 11), color palette per element (Tasks 5, 8, 12), realtime sharing (Convex queries are reactive by default — Tasks 2–4, 7, 9), live cursors (Tasks 4, 13), Option-A layout and Tavla nav (Tasks 6–8), styling (Task 14), tests (Tasks 2–5).
- **Type consistency:** `boardElements` fields (`x,y,w,h,text,color,kind,order`) are identical across schema, mutations, and components; `BoardTool` is the single source for tool ids; viewport math names (`worldToScreen`/`screenToWorld`/`zoomAt`/`clampZoom`/`normalizeRect`) match between `lib/board.ts`, its test, and `useViewport.ts`.
- **Out of scope (v1):** fills, stroke width, font size, live-streamed dragging, persisted viewport, multi-select, undo/redo, connectors/arrows, images, export.
```
