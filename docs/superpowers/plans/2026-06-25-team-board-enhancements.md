# Team Board Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add twelve editing/selection/ergonomics enhancements to the team board: text on rect/circle, wider hit zones, drag-a-color-to-drop-a-note, multi-select (Shift/⌘ click + marquee), help modal, auto-edit on create, Esc/Space pointer mode, placement cursor, text size + bold, ⌘-Z undo, and a live draw preview.

**Architecture:** One additive schema change (`fontSize`, `bold` on `boardElements`). Interaction logic moves out of `Canvas.tsx` into a `useCanvasInteractions` hook; pure geometry/selection math goes to `src/lib/board.ts` (unit-tested); undo is a small `useUndo` hook. Rect/circle gain a transparent HTML `ShapeFrame` overlay (the wide hit zone + editable label); their SVG outline becomes non-interactive. Selection becomes an id-array held in `BoardView`. Commit-on-drop and local-only previews are preserved.

**Tech Stack:** Convex 1.41, React 19, TypeScript, Vite, Vitest + convex-test. Hand-rolled CSS in `src/index.css`.

---

## File structure

**Backend**
- `convex/schema.ts` (modify) — `fontSize`, `bold` optional on `boardElements`.
- `convex/boardElements.ts` (modify) — those fields on `create`/`update` validators.
- `convex/boardElements.test.ts` (modify) — persistence + shape-label tests.

**Pure logic / constants**
- `src/lib/board.ts` (modify) — `elementBounds`, `rectsIntersect`.
- `src/lib/board.test.ts` (modify) — tests for the two helpers.
- `src/lib/constants.ts` (modify) — font defaults + bounds.

**Components / hooks**
- `src/components/board/elements/NoteElement.tsx`, `TextElement.tsx` (modify) — font/bold styling.
- `src/components/board/elements/ShapeElement.tsx` (modify) — rect/circle `pointer-events: none`.
- `src/components/board/elements/ShapeFrame.tsx` (create) — rect/circle HTML overlay (hit zone + label).
- `src/components/board/useUndo.ts` (create) — undo stack hook.
- `src/components/board/useUndo.test.tsx` (create) — hook unit test.
- `src/components/board/BoardHelp.tsx` (create) — help guide content.
- `src/components/board/Toolbar.tsx` (modify) — font size, bold, "?", draggable swatches.
- `src/components/board/useCanvasInteractions.ts` (create) — pan/draw/draft/drag/marquee/create logic.
- `src/components/board/Canvas.tsx` (modify) — render via the hook; multi-select visuals, marquee, draft, ShapeFrame, keyboard, crosshair, `createNoteAt` via ref.
- `src/components/board/BoardView.tsx` (modify) — `selectedIds`, font/bold/help state, swatch-drag + ghost, undo wiring.
- `src/index.css` (modify) — styles.

**Testing strategy:** Backend + pure helpers + the undo hook are unit-tested (TDD). Canvas interaction is browser-verified manually by the user (Google-login-only app; no DOM-interaction harness in this repo). Each UI task lists the exact click-throughs to confirm. After every task run `npx tsc --noEmit` and `npm run build`.

---

## Task 1: Schema + backend fields for fontSize/bold

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/boardElements.ts`
- Test: `convex/boardElements.test.ts`

- [ ] **Step 1: Add the two optional fields to the schema**

In `convex/schema.ts`, inside the `boardElements` table definition, add after the `color: v.string(),` line:

```typescript
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
```

- [ ] **Step 2: Add a failing test for persistence + shape labels**

In `convex/boardElements.test.ts`, add:

```typescript
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run convex/boardElements.test.ts`
Expected: FAIL — `create`/`update` reject `fontSize`/`bold` (validator error).

- [ ] **Step 4: Add the fields to the create/update validators**

In `convex/boardElements.ts`, add to the `create` args object (after `color: v.string(),`):

```typescript
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
```

And to the `update` args object (after `color: v.optional(v.string()),`):

```typescript
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
```

No handler changes needed: `create` already does `ctx.db.insert("boardElements", { ...args, orgId, order })`, and `update` already strips undefined keys before patching.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run convex/boardElements.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p convex/tsconfig.json` (expect clean). If `convex dev` isn't running, run `npx convex dev --once` to push.

```bash
git add convex/schema.ts convex/boardElements.ts convex/boardElements.test.ts
git commit -m "feat(board): add fontSize and bold to elements"
```

---

## Task 2: Pure helpers — elementBounds, rectsIntersect + constants

**Files:**
- Modify: `src/lib/board.ts`
- Test: `src/lib/board.test.ts`
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/board.test.ts`:

```typescript
import { elementBounds, rectsIntersect } from "./board";

test("elementBounds returns the box for a rect as-is", () => {
  expect(elementBounds({ kind: "rect", x: 10, y: 20, w: 30, h: 40 })).toEqual({ x: 10, y: 20, w: 30, h: 40 });
});

test("elementBounds normalizes a negative-vector line", () => {
  expect(elementBounds({ kind: "line", x: 100, y: 100, w: -40, h: -20 })).toEqual({ x: 60, y: 80, w: 40, h: 20 });
});

test("rectsIntersect detects overlap and separation", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
  expect(rectsIntersect(a, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
});

test("rectsIntersect treats edge-only touching as non-overlap", () => {
  expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/board.test.ts`
Expected: FAIL — `elementBounds`/`rectsIntersect` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/board.ts`:

```typescript
// Minimal shape needed to compute a bounding box (a subset of a board element).
type BoundsInput = { kind: string; x: number; y: number; w: number; h: number };

// World-space bounding box of an element. Lines store a vector (possibly negative),
// so normalize them; other kinds already store a positive-size box.
export function elementBounds(el: BoundsInput): Rect {
  if (el.kind === "line") return normalizeRect({ x: el.x, y: el.y, w: el.w, h: el.h });
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

// Axis-aligned overlap test. Edge-only touching counts as non-overlap.
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/board.test.ts`
Expected: PASS (existing + 4 new tests).

- [ ] **Step 5: Add font constants**

Append to `src/lib/constants.ts`:

```typescript
// Board text sizing. Defaults per kind when an element has no explicit fontSize.
export const BOARD_FONT_DEFAULT: Record<string, number> = { note: 13, text: 16, rect: 13, circle: 13 };
export const BOARD_FONT_MIN = 10;
export const BOARD_FONT_MAX = 48;
export const BOARD_FONT_STEP = 2;
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit` (expect clean).

```bash
git add src/lib/board.ts src/lib/board.test.ts src/lib/constants.ts
git commit -m "feat(board): elementBounds, rectsIntersect, font constants"
```

---

## Task 3: Element font/bold styling + ShapeFrame overlay

**Files:**
- Modify: `src/components/board/elements/NoteElement.tsx`
- Modify: `src/components/board/elements/TextElement.tsx`
- Modify: `src/components/board/elements/ShapeElement.tsx`
- Create: `src/components/board/elements/ShapeFrame.tsx`

- [ ] **Step 1: Apply font/bold in NoteElement**

In `NoteElement.tsx`, change the root div's `style` to include font sizing (default 13 via the constant):

```tsx
import { BOARD_FONT_DEFAULT } from "../../../lib/constants";
```

```tsx
      style={{
        left: el.x, top: el.y, width: el.w, height: el.h, background: el.color,
        fontSize: el.fontSize ?? BOARD_FONT_DEFAULT.note,
        fontWeight: el.bold ? 700 : 400,
      }}
```

- [ ] **Step 2: Apply font/bold in TextElement**

In `TextElement.tsx`:

```tsx
import { BOARD_FONT_DEFAULT } from "../../../lib/constants";
```

```tsx
      style={{
        left: el.x, top: el.y, width: el.w, color: el.color,
        fontSize: el.fontSize ?? BOARD_FONT_DEFAULT.text,
        fontWeight: el.bold ? 700 : 400,
      }}
```

- [ ] **Step 3: Make rect/circle SVG outlines non-interactive**

In `ShapeElement.tsx`, add `pointerEvents: "none"` to the `rect` and `ellipse` (so the HTML `ShapeFrame` owns their interaction). Leave `line` interactive. Change the rect return to include `style={{ pointerEvents: "none" }}` and likewise the ellipse:

```tsx
  if (el.kind === "rect") {
    return <rect x={el.x} y={el.y} width={Math.max(1, el.w)} height={Math.max(1, el.h)} fill="none" stroke={stroke} strokeWidth={sw} rx={4} style={{ pointerEvents: "none" }} />;
  }
  return (
    <ellipse
      cx={el.x + el.w / 2}
      cy={el.y + el.h / 2}
      rx={Math.max(1, Math.abs(el.w / 2))}
      ry={Math.max(1, Math.abs(el.h / 2))}
      fill="none" stroke={stroke} strokeWidth={sw}
      style={{ pointerEvents: "none" }}
    />
  );
```

- [ ] **Step 4: Create ShapeFrame.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { BOARD_FONT_DEFAULT } from "../../../lib/constants";

// Transparent HTML overlay covering a rect/circle's bounding box. Provides the wide
// hit area (select/move) and an editable centered label. The visible outline is the
// SVG ShapeElement underneath (pointer-events: none).
export default function ShapeFrame({
  el, selected, editing, onCommitText, onStartEdit, onPointerDown,
}: {
  el: Doc<"boardElements">;
  selected: boolean;
  editing: boolean;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const [draftText, setDraftText] = useState(el.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { setDraftText(el.text ?? ""); ref.current?.focus(); } }, [editing, el.text]);

  return (
    <div
      className={"board-shape-frame" + (selected ? " selected" : "") + (el.kind === "circle" ? " circle" : "")}
      style={{
        left: el.x, top: el.y, width: Math.max(1, el.w), height: Math.max(1, el.h),
        fontSize: el.fontSize ?? BOARD_FONT_DEFAULT.rect,
        fontWeight: el.bold ? 700 : 400,
      }}
      onDoubleClick={onStartEdit}
      onPointerDown={onPointerDown}
      data-element-id={el._id}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={() => onCommitText(draftText)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } }}
        />
      ) : (
        <div className="board-shape-text">{el.text}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, build, commit**

Run: `npx tsc --noEmit` and `npm run build` (expect clean/success). ShapeFrame isn't rendered yet (wired in Task 7) — this task just adds the styling and the component.

```bash
git add src/components/board/elements
git commit -m "feat(board): font/bold styling and ShapeFrame overlay component"
```

---

## Task 4: useUndo hook

**Files:**
- Create: `src/components/board/useUndo.ts`
- Test: `src/components/board/useUndo.test.tsx`

- [ ] **Step 1: Write a failing test**

`useUndo.test.tsx` (uses React Testing Library's `act`/`renderHook` is not installed; instead test the stack logic via a tiny manual harness with `react` test utilities already available through vitest + jsdom). This repo runs vitest in `edge-runtime`; to keep it simple, test the pure stack behaviour by exercising the hook through a minimal render using React's `act` from `react-dom/test-utils` is also unavailable. Therefore implement the stack as a **plain function factory** that the hook wraps, and unit-test the factory:

Create the test for a factory `createUndoStack`:

```tsx
import { expect, test, vi } from "vitest";
import { createUndoStack } from "./useUndo";

test("undo runs the most recent inverse and pops it", async () => {
  const stack = createUndoStack();
  const a = vi.fn(); const b = vi.fn();
  stack.record(a);
  stack.record(b);
  await stack.undo();
  expect(b).toHaveBeenCalledTimes(1);
  expect(a).not.toHaveBeenCalled();
  await stack.undo();
  expect(a).toHaveBeenCalledTimes(1);
  await stack.undo(); // empty: no throw
});

test("clear empties the stack", async () => {
  const stack = createUndoStack();
  const a = vi.fn();
  stack.record(a);
  stack.clear();
  await stack.undo();
  expect(a).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/board/useUndo.test.tsx`
Expected: FAIL — `createUndoStack` not exported.

- [ ] **Step 3: Implement useUndo.ts**

```tsx
import { useRef } from "react";

export type Inverse = () => Promise<void> | void;

// Plain factory (testable without React): a LIFO stack of inverse operations.
export function createUndoStack() {
  const stack: Inverse[] = [];
  return {
    record(inverse: Inverse) { stack.push(inverse); },
    async undo() {
      const inverse = stack.pop();
      if (inverse) await inverse();
    },
    clear() { stack.length = 0; },
  };
}

// React hook wrapper: a single stable stack instance per mounted board.
export function useUndo() {
  const ref = useRef<ReturnType<typeof createUndoStack> | null>(null);
  if (ref.current === null) ref.current = createUndoStack();
  return ref.current;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/board/useUndo.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/board/useUndo.ts src/components/board/useUndo.test.tsx
git commit -m "feat(board): undo stack hook"
```

---

## Task 5: Toolbar — font size, bold, help button, draggable swatches + BoardHelp

**Files:**
- Modify: `src/components/board/Toolbar.tsx`
- Create: `src/components/board/BoardHelp.tsx`

- [ ] **Step 1: Create BoardHelp.tsx**

```tsx
// Static help content rendered inside the shared Modal.
export default function BoardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="board-help">
      <h2>Tavla – guide</h2>
      <ul>
        <li><b>Verktyg:</b> välj Notis, Text, Rektangel, Cirkel eller Linje och klicka/dra på ytan.</li>
        <li><b>Rita:</b> dra för att skapa rektangel, cirkel eller linje – formen visas medan du drar.</li>
        <li><b>Redigera text:</b> dubbelklicka på en notis, text eller form.</li>
        <li><b>Färg:</b> klicka på en färg för att färga markeringen; <b>dra en färg</b> till ytan för att släppa en notis i den färgen.</li>
        <li><b>Textstorlek / fet:</b> A− / A+ och <b>B</b> i verktygsfältet.</li>
        <li><b>Markera flera:</b> Shift- eller ⌘-klicka objekt, eller Shift/⌘-dra en ruta över ytan.</li>
        <li><b>Flytta / ändra storlek:</b> dra ett objekt; dra hörnen för att ändra storlek (ett objekt i taget).</li>
        <li><b>Ta bort:</b> Delete eller Backspace.</li>
        <li><b>Pekläge:</b> Esc eller mellanslag växlar till Markera.</li>
        <li><b>Ångra:</b> ⌘Z (Ctrl+Z).</li>
        <li><b>Panorera:</b> dra på tom yta. <b>Zooma:</b> rulla med mushjulet.</li>
      </ul>
      <button className="board-help-close" onClick={onClose}>Stäng</button>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite Toolbar.tsx**

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
  tool, color, bold, fontSize, onTool, onColor, onSwatchPointerDown, onFontStep, onBold, onHelp,
}: {
  tool: BoardTool;
  color: string;
  bold: boolean;
  fontSize: number;
  onTool: (t: BoardTool) => void;
  onColor: (c: string) => void;
  onSwatchPointerDown: (c: string, e: React.PointerEvent) => void;
  onFontStep: (delta: number) => void;
  onBold: () => void;
  onHelp: () => void;
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

      <div className="board-text-controls">
        <button className="board-tool" title="Mindre text" onClick={() => onFontStep(-1)}>A−</button>
        <span className="board-font-size">{fontSize}</span>
        <button className="board-tool" title="Större text" onClick={() => onFontStep(1)}>A+</button>
        <button className={"board-tool" + (bold ? " active" : "")} title="Fet" onClick={onBold} style={{ fontWeight: 700 }}>B</button>
      </div>

      <div className="board-colors">
        {BOARD_COLORS.map((c) => (
          <button
            key={c}
            className={"board-swatch" + (c === color ? " active" : "")}
            style={{ background: c }}
            title={c + " (klicka: färga · dra: släpp notis)"}
            onClick={() => onColor(c)}
            onPointerDown={(e) => onSwatchPointerDown(c, e)}
          />
        ))}
      </div>

      <button className="board-help-btn" title="Hjälp" onClick={onHelp}>?</button>
    </div>
  );
}
```

Note: the swatch keeps `onClick` (fires on a plain click that didn't become a drag) AND `onPointerDown` (begins a potential drag). `BoardView` (Task 8) suppresses the click when a drag actually happened.

- [ ] **Step 3: Typecheck, build, commit**

Run: `npx tsc --noEmit` — this will FAIL because `BoardView` doesn't yet pass the new Toolbar props. That's expected; this task's Toolbar is consumed in Task 8. To keep the tree compiling between tasks, temporarily render is unchanged — so instead, defer the commit: **do Step 3 only after confirming the file compiles in isolation** by checking there are no syntax errors via `npx tsc --noEmit 2>&1 | grep Toolbar` (expect no syntax errors in Toolbar.tsx itself; the only errors should be the missing-props error in BoardView.tsx).

Commit now (BoardView is updated in Task 8, which restores a clean typecheck):

```bash
git add src/components/board/Toolbar.tsx src/components/board/BoardHelp.tsx
git commit -m "feat(board): toolbar font/bold/help controls and help guide"
```

> Sequencing note: Tasks 5–8 form one coherent unit (Toolbar API + Canvas hook + BoardView wiring). `tsc`/`build` is expected to be red between Task 5 and Task 8 because the Toolbar/Canvas signatures change ahead of their `BoardView` call sites. The implementer should complete Tasks 6, 7, and 8 before relying on a green `tsc`. Each task still commits independently.

---

## Task 6: useCanvasInteractions hook

**Files:**
- Create: `src/components/board/useCanvasInteractions.ts`

This hook owns all pointer-driven canvas behaviour: pan, draw + live draft, single/multi move, resize, marquee select, click-toggle select, element creation (with auto-edit), swatch-drop creation, and undo recording.

- [ ] **Step 1: Implement the hook**

```tsx
import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { normalizeRect, elementBounds, rectsIntersect, screenToWorld, type Viewport } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";

type El = Doc<"boardElements">;
type Geo = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
const THRESH = 4;

export type Draft = { kind: "line" | "rect" | "circle"; x: number; y: number; w: number; h: number; color: string } | null;
export type Marquee = { x: number; y: number; w: number; h: number } | null; // screen-space

export type InteractionOpts = {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  setTool: (t: BoardTool) => void;
  color: string;
  fontSize: number;
  bold: boolean;
  vp: Viewport;
  pan: (dx: number, dy: number) => void;
  selectedIds: Id<"boardElements">[];
  setSelectedIds: (ids: Id<"boardElements">[]) => void;
  setEditingId: (id: Id<"boardElements"> | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  record: (inverse: () => Promise<void> | void) => void;
};

export function useCanvasInteractions(opts: InteractionOpts) {
  const {
    boardId, elements, tool, color, fontSize, bold, vp, pan,
    selectedIds, setSelectedIds, setEditingId, containerRef, record,
  } = opts;
  const create = useMutation(api.boardElements.create);
  const update = useMutation(api.boardElements.update);
  const removeEl = useMutation(api.boardElements.remove);

  const toWorld = useCallback((p: { x: number; y: number }) => screenToWorld(p, vp), [vp]);
  const screenInCanvas = (e: { clientX: number; clientY: number }) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const panStart = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<null | {
    mode: "move" | Corner;
    startWorld: { x: number; y: number };
    items: Array<{ id: Id<"boardElements">; kind: string; orig: Geo }>;
  }>(null);

  const [draft, setDraft] = useState<Draft>(null);
  const [marquee, setMarquee] = useState<Marquee>(null);
  const [live, setLive] = useState<Record<string, Geo>>({});

  const isToggle = (e: React.PointerEvent | { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    e.shiftKey || e.metaKey || e.ctrlKey;

  // --- element pointer-down: select-toggle or start a move ---
  const startMove = (el: El, e: React.PointerEvent) => {
    if (tool !== "select") return; // let it bubble so drawing tools can draw over elements
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    e.stopPropagation();
    if (isToggle(e)) {
      setSelectedIds(
        selectedIds.includes(el._id)
          ? selectedIds.filter((id) => id !== el._id)
          : [...selectedIds, el._id],
      );
      return;
    }
    containerRef.current!.setPointerCapture(e.pointerId);
    const moveIds = selectedIds.includes(el._id) && selectedIds.length > 0 ? selectedIds : [el._id];
    if (!selectedIds.includes(el._id)) setSelectedIds([el._id]);
    const items = moveIds
      .map((id) => elements.find((x) => x._id === id))
      .filter((m): m is El => !!m)
      .map((m) => ({ id: m._id, kind: m.kind, orig: { x: m.x, y: m.y, w: m.w, h: m.h } }));
    dragRef.current = { mode: "move", startWorld: toWorld(screenInCanvas(e)), items };
    setLive(Object.fromEntries(items.map((it) => [it.id, it.orig])));
  };

  const startResize = (el: El, corner: Corner, e: React.PointerEvent) => {
    e.stopPropagation();
    containerRef.current!.setPointerCapture(e.pointerId);
    setSelectedIds([el._id]);
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    dragRef.current = { mode: corner, startWorld: toWorld(screenInCanvas(e)), items: [{ id: el._id, kind: el.kind, orig }] };
    setLive({ [el._id]: orig });
  };

  // --- canvas pointer-down: draw / pan / marquee ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool !== "select") {
      containerRef.current!.setPointerCapture(e.pointerId);
      drawStart.current = toWorld(screenInCanvas(e));
      return;
    }
    const target = e.target as HTMLElement;
    const onEmpty = target === e.currentTarget || target.classList.contains("board-svg");
    if (!onEmpty) return; // element's own startMove handles it
    containerRef.current!.setPointerCapture(e.pointerId);
    if (isToggle(e)) {
      marqueeStart.current = screenInCanvas(e);
    } else {
      setSelectedIds([]);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const sp = screenInCanvas(e);
    if (dragRef.current) {
      const w = toWorld(sp); const d = dragRef.current;
      const dx = w.x - d.startWorld.x; const dy = w.y - d.startWorld.y;
      const next: Record<string, Geo> = {};
      for (const it of d.items) {
        const o = it.orig;
        if (d.mode === "move") next[it.id] = { ...o, x: o.x + dx, y: o.y + dy };
        else if (d.mode === "nw") next[it.id] = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
        else if (d.mode === "ne") next[it.id] = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
        else if (d.mode === "sw") next[it.id] = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
        else next[it.id] = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      }
      setLive(next);
      return;
    }
    if (drawStart.current) {
      if (tool === "note" || tool === "text" || tool === "select") return;
      const w = toWorld(sp); const s = drawStart.current;
      if (tool === "line") setDraft({ kind: "line", x: s.x, y: s.y, w: w.x - s.x, h: w.y - s.y, color });
      else setDraft({ kind: tool, color, ...normalizeRect({ x: s.x, y: s.y, w: w.x - s.x, h: w.y - s.y }) });
      return;
    }
    if (marqueeStart.current) {
      const s = marqueeStart.current;
      setMarquee({ x: Math.min(s.x, sp.x), y: Math.min(s.y, sp.y), w: Math.abs(sp.x - s.x), h: Math.abs(sp.y - s.y) });
      return;
    }
    if (panStart.current) {
      pan(e.clientX - panStart.current.x, e.clientY - panStart.current.y);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    // 1. commit a move/resize
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      const liveMap = live;
      const moved = d.items.some((it) => {
        const g = liveMap[it.id];
        return g && (g.x !== it.orig.x || g.y !== it.orig.y || g.w !== it.orig.w || g.h !== it.orig.h);
      });
      const inverses = d.items.map((it) => ({ id: it.id, geo: it.orig }));
      for (const it of d.items) {
        let g = liveMap[it.id] ?? it.orig;
        if (it.kind !== "line") g = normalizeRect(g);
        try { await update({ id: it.id, x: g.x, y: g.y, w: g.w, h: g.h }); } catch { /* gone */ }
      }
      if (moved) record(async () => { for (const inv of inverses) { try { await update({ id: inv.id, ...inv.geo }); } catch { /* gone */ } } });
      setLive({});
      return;
    }
    // 2. commit a marquee selection
    if (marqueeStart.current) {
      marqueeStart.current = null;
      const m = marquee; setMarquee(null);
      if (m && (m.w > THRESH || m.h > THRESH)) {
        const tl = toWorld({ x: m.x, y: m.y });
        const br = toWorld({ x: m.x + m.w, y: m.y + m.h });
        const worldRect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
        const hits = elements.filter((el) => rectsIntersect(worldRect, elementBounds(el))).map((el) => el._id);
        setSelectedIds(Array.from(new Set([...selectedIds, ...hits])));
      }
      return;
    }
    // 3. end a pan
    if (panStart.current) { panStart.current = null; return; }
    // 4. finish a draw -> create
    const s = drawStart.current; drawStart.current = null;
    setDraft(null);
    if (tool === "select" || !s) return;
    const end = toWorld(screenInCanvas(e));
    let newId: Id<"boardElements"> | undefined;
    if (tool === "note") {
      newId = await create({ boardId, kind: "note", x: s.x, y: s.y, w: 160, h: 120, text: "", color, fontSize, bold });
      setEditingId(newId);
    } else if (tool === "text") {
      newId = await create({ boardId, kind: "text", x: s.x, y: s.y, w: 200, h: 40, text: "", color, fontSize, bold });
      setEditingId(newId);
    } else if (tool === "line") {
      newId = await create({ boardId, kind: "line", x: s.x, y: s.y, w: end.x - s.x, h: end.y - s.y, color });
    } else {
      let r = normalizeRect({ x: s.x, y: s.y, w: end.x - s.x, h: end.y - s.y });
      if (r.w < 4 && r.h < 4) r = { x: s.x, y: s.y, w: 120, h: 90 };
      newId = await create({ boardId, kind: tool, x: r.x, y: r.y, w: r.w, h: r.h, color, fontSize, bold });
    }
    if (newId) { const id = newId; record(() => removeEl({ id })); setSelectedIds([newId]); }
  };

  // --- swatch drop: create a note of `dropColor` at a screen point ---
  const createNoteAt = async (clientX: number, clientY: number, dropColor: string) => {
    const r = containerRef.current!.getBoundingClientRect();
    const w = toWorld({ x: clientX - r.left, y: clientY - r.top });
    const id = await create({ boardId, kind: "note", x: w.x, y: w.y, w: 160, h: 120, text: "", color: dropColor, fontSize, bold });
    record(() => removeEl({ id }));
    setSelectedIds([id]);
    setEditingId(id);
  };

  return { onPointerDown, onPointerMove, onPointerUp, startMove, startResize, draft, marquee, live, createNoteAt };
}
```

- [ ] **Step 2: Typecheck the hook in isolation**

Run: `npx tsc --noEmit 2>&1 | grep useCanvasInteractions`
Expected: no syntax/type errors originating in `useCanvasInteractions.ts` itself (errors elsewhere from the in-progress Toolbar/Canvas changes are expected until Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/board/useCanvasInteractions.ts
git commit -m "feat(board): canvas interactions hook (pan/draw/drag/marquee/create)"
```

---

## Task 7: Canvas.tsx — render via the hook (multi-select, marquee, draft, ShapeFrame, keyboard, cursor, ref)

**Files:**
- Modify: `src/components/board/Canvas.tsx`

- [ ] **Step 1: Rewrite Canvas.tsx**

```tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { BoardTool } from "../../lib/constants";
import { useViewport } from "./useViewport";
import { useCanvasInteractions } from "./useCanvasInteractions";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";
import ShapeFrame from "./elements/ShapeFrame";
import SelectionHandles from "./SelectionHandles";
import { usePresence } from "./usePresence";
import Cursors from "./Cursors";

type El = Doc<"boardElements">;
type Geo = { x: number; y: number; w: number; h: number };

export type CanvasHandle = { createNoteAt: (clientX: number, clientY: number, color: string) => void };

type Props = {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  setTool: (t: BoardTool) => void;
  color: string;
  fontSize: number;
  bold: boolean;
  selectedIds: Id<"boardElements">[];
  setSelectedIds: (ids: Id<"boardElements">[]) => void;
  record: (inverse: () => Promise<void> | void) => void;
  undo: () => void;
};

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { boardId, elements, tool, setTool, color, fontSize, bold, selectedIds, setSelectedIds, record, undo }, fwdRef,
) {
  const { vp, pan, zoom } = useViewport();
  const { others, report } = usePresence(boardId);
  const update = useMutation(api.boardElements.update);
  const create = useMutation(api.boardElements.create);
  const removeEl = useMutation(api.boardElements.remove);
  const ref = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<Id<"boardElements"> | null>(null);

  const ix = useCanvasInteractions({
    boardId, elements, tool, setTool, color, fontSize, bold, vp, pan,
    selectedIds, setSelectedIds, setEditingId, containerRef: ref, record,
  });

  useImperativeHandle(fwdRef, () => ({ createNoteAt: ix.createNoteAt }), [ix.createNoteAt]);

  const geoOf = (el: El): El => (ix.live[el._id] ? { ...el, ...ix.live[el._id] } : el);
  const commitText = async (id: Id<"boardElements">, text: string) => {
    const prev = elements.find((e) => e._id === id)?.text ?? "";
    await update({ id, text });
    record(() => { update({ id, text: prev }); });
    setEditingId(null);
  };

  // wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      zoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [zoom]);

  // keyboard: delete (multi), Esc/Space -> select, Cmd/Ctrl+Z -> undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editing = document.activeElement?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (editing) return; // let the textarea do its own undo
        e.preventDefault();
        undo();
        return;
      }
      if (editing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        const saved = elements.filter((el) => selectedIds.includes(el._id));
        for (const el of saved) removeEl({ id: el._id });
        record(async () => {
          for (const el of saved) {
            await create({
              boardId, kind: el.kind, x: el.x, y: el.y, w: el.w, h: el.h,
              text: el.text, color: el.color, fontSize: el.fontSize, bold: el.bold,
            });
          }
        });
        setSelectedIds([]);
      } else if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, elements, boardId, removeEl, create, record, setSelectedIds, setTool, undo]);

  // clear editing when its element leaves the selection
  useEffect(() => {
    if (editingId && !selectedIds.includes(editingId)) setEditingId(null);
  }, [selectedIds, editingId]);

  const transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
  const lines = elements.filter((el) => el.kind === "line");
  const boxes = elements.filter((el) => el.kind === "rect" || el.kind === "circle");
  const notesTexts = elements.filter((el) => el.kind === "note" || el.kind === "text");
  const sel = (id: Id<"boardElements">) => selectedIds.includes(id);
  const single = selectedIds.length === 1 ? elements.find((e) => e._id === selectedIds[0]) : null;

  return (
    <div
      ref={ref}
      className={"board-canvas" + (tool === "select" ? "" : " placing")}
      onPointerDown={ix.onPointerDown}
      onPointerMove={(e) => { report(useViewportWorld(e)); ix.onPointerMove(e); }}
      onPointerUp={ix.onPointerUp}
    >
      <svg className="board-svg" width="100%" height="100%">
        <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>
          {lines.map((el) => (
            <g key={el._id} onPointerDown={(e) => ix.startMove(el, e)} style={{ cursor: tool === "select" ? "move" : "crosshair" }}>
              <ShapeElement el={geoOf(el)} selected={sel(el._id)} />
            </g>
          ))}
          {boxes.map((el) => (
            <ShapeElement key={el._id} el={geoOf(el)} selected={sel(el._id)} />
          ))}
          {ix.draft && (
            <g opacity={0.6}>
              <ShapeElement el={{ ...ix.draft, _id: "draft" as Id<"boardElements">, text: undefined } as unknown as El} selected={false} />
            </g>
          )}
          {single && (
            <SelectionHandles el={geoOf(single)} onResizeStart={(corner, e) => ix.startResize(single, corner, e)} />
          )}
          <Cursors cursors={others} />
        </g>
      </svg>

      <div className="board-html-layer" style={{ transform, transformOrigin: "0 0" }}>
        {boxes.map((el) => (
          <ShapeFrame
            key={el._id}
            el={geoOf(el)}
            selected={sel(el._id)}
            editing={el._id === editingId}
            onCommitText={(text) => commitText(el._id, text)}
            onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
            onPointerDown={(e) => ix.startMove(el, e)}
          />
        ))}
        {notesTexts.map((el) =>
          el.kind === "note" ? (
            <NoteElement
              key={el._id}
              el={geoOf(el)}
              selected={sel(el._id)}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
              onPointerDown={(e) => ix.startMove(el, e)}
            />
          ) : (
            <TextElement
              key={el._id}
              el={geoOf(el)}
              selected={sel(el._id)}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
              onPointerDown={(e) => ix.startMove(el, e)}
            />
          ),
        )}
      </div>

      {ix.marquee && (
        <div className="board-marquee" style={{ left: ix.marquee.x, top: ix.marquee.y, width: ix.marquee.w, height: ix.marquee.h }} />
      )}
    </div>
  );
});

export default Canvas;
```

> **Fix the presence-report call:** the snippet above shows `report(useViewportWorld(e))` for illustration — that is NOT valid (hooks can't be called in handlers). Implement it correctly: compute the world point inline using the same conversion the hook uses. Add near the top of the component:
> ```tsx
> import { screenToWorld } from "../../lib/board";
> const reportMove = (e: React.PointerEvent) => {
>   const r = ref.current!.getBoundingClientRect();
>   report(screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, vp));
> };
> ```
> and use `onPointerMove={(e) => { reportMove(e); ix.onPointerMove(e); }}`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "Canvas|useCanvasInteractions"`
Expected: no errors from these files (BoardView call-site errors remain until Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/components/board/Canvas.tsx
git commit -m "feat(board): canvas renders via interactions hook with multi-select, marquee, draft"
```

---

## Task 8: BoardView.tsx — selection set, font/bold, help, swatch drag + ghost, undo wiring

**Files:**
- Modify: `src/components/board/BoardView.tsx`

- [ ] **Step 1: Rewrite BoardView.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BOARD_COLORS, BOARD_FONT_DEFAULT, BOARD_FONT_MIN, BOARD_FONT_MAX, BOARD_FONT_STEP, type BoardTool } from "../../lib/constants";
import Modal from "../ui/Modal";
import BoardTabs from "./BoardTabs";
import Toolbar from "./Toolbar";
import BoardHelp from "./BoardHelp";
import Canvas, { type CanvasHandle } from "./Canvas";
import { useUndo } from "./useUndo";

const THRESH = 4;

export default function BoardView() {
  const boards = useQuery(api.boards.list) ?? [];
  const [activeId, setActiveId] = useState<Id<"boards"> | null>(null);
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [fontSize, setFontSize] = useState<number>(BOARD_FONT_DEFAULT.text);
  const [bold, setBold] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Id<"boardElements">[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const elements = useQuery(api.boardElements.listByBoard, activeId ? { boardId: activeId } : "skip") ?? [];
  const updateEl = useMutation(api.boardElements.update);
  const undo = useUndo();
  const canvasRef = useRef<CanvasHandle>(null);

  // swatch drag (press a color, drag onto the canvas to drop a note)
  const [ghost, setGhost] = useState<{ x: number; y: number; color: string } | null>(null);
  const swatch = useRef<{ color: string; startX: number; startY: number; dragging: boolean } | null>(null);

  useEffect(() => {
    if (boards.length === 0) { setActiveId(null); return; }
    if (!activeId || !boards.some((b) => b._id === activeId)) setActiveId(boards[0]._id);
  }, [boards, activeId]);

  useEffect(() => { setSelectedIds([]); undo.clear(); }, [activeId, undo]);

  const applyToSelection = (patch: { color?: string; fontSize?: number; bold?: boolean }) => {
    const targets = elements.filter((el) => selectedIds.includes(el._id));
    if (targets.length === 0) return;
    const inverses = targets.map((el) => ({ id: el._id, color: el.color, fontSize: el.fontSize, bold: el.bold }));
    for (const el of targets) updateEl({ id: el._id, ...patch });
    undo.record(async () => {
      for (const inv of inverses) {
        await updateEl({ id: inv.id, color: inv.color, fontSize: inv.fontSize ?? undefined, bold: inv.bold ?? undefined });
      }
    });
  };

  const handleColor = (c: string) => { setColor(c); applyToSelection({ color: c }); };
  const handleFontStep = (delta: number) => {
    const next = Math.min(BOARD_FONT_MAX, Math.max(BOARD_FONT_MIN, fontSize + delta * BOARD_FONT_STEP));
    setFontSize(next);
    applyToSelection({ fontSize: next });
  };
  const handleBold = () => { const next = !bold; setBold(next); applyToSelection({ bold: next }); };

  // swatch drag lifecycle
  const onSwatchPointerDown = (c: string, e: React.PointerEvent) => {
    swatch.current = { color: c, startX: e.clientX, startY: e.clientY, dragging: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = swatch.current; if (!s) return;
      if (!s.dragging && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > THRESH) s.dragging = true;
      if (s.dragging) setGhost({ x: e.clientX, y: e.clientY, color: s.color });
    };
    const up = (e: PointerEvent) => {
      const s = swatch.current; swatch.current = null; setGhost(null);
      if (!s || !s.dragging) return; // a plain click is handled by the swatch's onClick
      const node = document.querySelector(".board-canvas") as HTMLElement | null;
      if (!node) return;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        canvasRef.current?.createNoteAt(e.clientX, e.clientY, s.color);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  return (
    <div className="board-view">
      <BoardTabs boards={boards} activeId={activeId} onSelect={setActiveId} />
      <Toolbar
        tool={tool} color={color} bold={bold} fontSize={fontSize}
        onTool={setTool} onColor={handleColor} onSwatchPointerDown={onSwatchPointerDown}
        onFontStep={handleFontStep} onBold={handleBold} onHelp={() => setHelpOpen(true)}
      />
      {activeId === null ? (
        <div className="board-empty">Ingen tavla ännu. Skapa en med "+ Ny tavla".</div>
      ) : (
        <Canvas
          ref={canvasRef}
          boardId={activeId} elements={elements} tool={tool} setTool={setTool}
          color={color} fontSize={fontSize} bold={bold}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          record={undo.record} undo={undo.undo}
        />
      )}
      {ghost && (
        <div className="board-swatch-ghost" style={{ left: ghost.x, top: ghost.y, background: ghost.color }} />
      )}
      {helpOpen && <Modal onClose={() => setHelpOpen(false)}><BoardHelp onClose={() => setHelpOpen(false)} /></Modal>}
    </div>
  );
}
```

- [ ] **Step 2: Full typecheck + build (the Tasks 5–8 unit should now be green)**

Run: `npx tsc --noEmit` (expect clean) and `npm run build` (expect success).

- [ ] **Step 3: Commit**

```bash
git add src/components/board/BoardView.tsx
git commit -m "feat(board): multi-select state, font/bold, help, swatch-drag, undo wiring"
```

---

## Task 9: Styles

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append board enhancement styles**

```css
/* ---- Team board: enhancements ---- */
.board-canvas.placing { cursor: crosshair; }
.board-text-controls { display: flex; align-items: center; gap: 4px; }
.board-font-size { min-width: 22px; text-align: center; font-size: 12px; color: var(--ink-soft); }
.board-help-btn { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line); background: var(--paper); cursor: pointer; font-weight: 700; }
.board-help-btn:hover { background: var(--card); }
.board-marquee { position: absolute; border: 1px solid var(--accent); background: rgba(196,91,50,.10); pointer-events: none; }
.board-swatch-ghost { position: fixed; width: 26px; height: 26px; border-radius: 4px; box-shadow: var(--shadow-md); pointer-events: none; transform: translate(-50%, -50%); z-index: 50; }
/* rect/circle label overlay */
.board-shape-frame { display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 6px; text-align: center; color: var(--ink); overflow: hidden; }
.board-shape-frame.selected { outline: 1px dashed var(--accent); outline-offset: 2px; }
.board-shape-text { white-space: pre-wrap; word-break: break-word; }
.board-shape-frame textarea { width: 100%; height: 100%; border: none; background: transparent; resize: none; outline: none; font: inherit; color: inherit; text-align: center; }
/* help modal */
.board-help h2 { margin: 0 0 12px; }
.board-help ul { margin: 0 0 16px; padding-left: 18px; line-height: 1.7; }
.board-help-close { padding: 8px 16px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--accent); color: #fff; cursor: pointer; }
```

- [ ] **Step 2: Build + commit**

Run: `npx tsc --noEmit` and `npm run build` (expect clean/success).

```bash
git add src/index.css
git commit -m "feat(board): styles for enhancements"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS (existing + new backend, board-math, and useUndo tests).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` and `npm run build`
Expected: clean / success.

- [ ] **Step 3: Push Convex functions if needed**

If `convex dev` is not running: `npx convex dev --once` (deploys the schema change).

- [ ] **Step 4: Browser checklist (controller hands this to the user — Google-login-only app)**

Confirm each enhancement on a board:
1. Draw a rectangle/circle/line — the shape is visible *while dragging* (draft), then lands on release.
2. Double-click a rectangle and a circle — type a label; it persists on reload.
3. Click anywhere inside a rectangle/circle (not just the outline) selects it.
4. Drag a color swatch onto the canvas — a note of that color appears at the drop point and opens for editing.
5. Add a text element — its editor opens automatically.
6. Shift-click and ⌘-click toggle items in/out of a multi-selection; Shift/⌘-drag on empty canvas marquee-selects; moving one selected item moves all; Delete removes all; a color/size/bold change applies to all.
7. Resize handles appear only when exactly one item is selected.
8. A−/A+ change text size; B toggles bold (on selection and for new elements).
9. "?" opens the guide modal.
10. Esc and Space switch to the Markera (select) tool; typing a space inside a textarea still types a space.
11. A drawing tool shows a crosshair cursor over the canvas.
12. ⌘Z (Ctrl+Z) undoes the last create/move/resize/delete/recolor/text/style change; inside a textarea ⌘Z does native text undo.

- [ ] **Step 5: Final commit (if any docs/notes)** — none expected; the work is committed per task.

---

## Self-review notes (addressed)

- **Spec coverage:** text on rect/circle (Tasks 3, 7 — ShapeFrame), wider hit zone (Tasks 3, 7 — overlay + SVG pointer-events none), drag-color→note (Tasks 5, 6, 8 — onSwatchPointerDown → createNoteAt), multi-select incl. ⌘-click + marquee (Tasks 2, 6, 7, 8), help "?" (Tasks 5, 8), auto-edit on create (Task 6), Esc/Space→select (Task 7), placement cursor (Tasks 7, 9), text size+bold (Tasks 1, 2, 3, 5, 6, 8), ⌘-Z undo (Tasks 4, 6, 7, 8), live draw preview (Tasks 6, 7).
- **Type consistency:** `fontSize: number | undefined` on the doc, `fontSize: number` in component/toolbar/interaction props (BoardView always supplies a concrete number; absent-on-doc falls back via `BOARD_FONT_DEFAULT`). `selectedIds: Id<"boardElements">[]` is used consistently across BoardView, Canvas, and the hook. `record`/`undo` come from `useUndo()` (`record`, `undo`, `clear`). `CanvasHandle.createNoteAt(clientX, clientY, color)` matches the hook's `createNoteAt` and BoardView's call.
- **Known sequencing:** Tasks 5–8 change interlocking signatures; `tsc` is intentionally red between them and green again after Task 8 (called out inline).
- **Out of scope (unchanged):** redo, multi-resize, persistent/server undo, rotation, grouping, rich text, connectors, images, export.
```
