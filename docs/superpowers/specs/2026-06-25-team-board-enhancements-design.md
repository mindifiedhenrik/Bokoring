# Team board enhancements — design

Builds on the shipped team board (`2026-06-25-team-board-design.md`). Eleven enhancements to editing, selection, and ergonomics. The board today: org-shared boards with note/text/line/rect/circle elements on a pan/zoom canvas (hybrid SVG shapes + HTML overlay), single-select with move/resize/delete, per-element color, live cursors. Files live in `src/components/board/`, backend in `convex/boards.ts` / `boardElements.ts` / `boardPresence.ts`.

## Enhancements

1. **Text on rectangles & circles** — editable centered labels, like notes.
2. **Wider click zone on rect/circle** — the whole bounding box is clickable, not just the stroke.
3. **Drag a color swatch → drop a note** of that color at the drop point.
4. **Multi-select** — Shift/⌘-click toggle + Shift/⌘-drag marquee; move/delete/recolor act on all selected.
5. **⌘-click** also toggles selection (alongside Shift-click).
6. **"?" help button** (far right of toolbar) opens a user guide modal.
7. **Auto-edit on create** — new text and note elements open their editor immediately.
8. **Esc / Space → select (pointer) mode**; Esc also exits editing / clears the marquee.
9. **Placement cursor** — drawing tools show a crosshair cursor over the canvas.
10. **Text size + bold** — per-element `fontSize` and `bold`, controlled from the toolbar.
11. **⌘-Z undo** — client-side, own-session actions, undo-only (no redo).
12. **Live draw preview** — while click-dragging to create a rectangle, line, or circle, show the shape forming under the cursor before release.

## Scope decisions (from brainstorming)

- Multi-select gesture: **Shift-drag marquee** (plain drag still pans); **Shift/⌘-click** toggles individual items. Click-vs-drag disambiguated by a ~4px movement threshold resolved on pointer-up; marquee only begins on empty canvas, toggle-click only on an element — so they never collide.
- Multi-**resize** is out of scope: resize handles appear only when exactly one element is selected.
- Undo is **best-effort, local, undo-only**: it reverts actions the current user took this session; it does not rewind teammates' live changes, and there is no redo. A resurrected (un-deleted) element gets a new id.
- Placement cursor is a **crosshair** (conventional "placing" cursor).
- Shape label text color is a fixed readable ink (`--ink`), independent of the shape's stroke color.

## Data model change

`convex/schema.ts` — add two optional fields to `boardElements` (optional so existing documents validate without migration):

```typescript
    fontSize: v.optional(v.number()),
    bold: v.optional(v.boolean()),
```

No new tables, no new indexes.

## Backend changes (`convex/boardElements.ts`)

Add the two optional fields to the validators of **both** `create` and `update`:

- `create` args gain `fontSize: v.optional(v.number())`, `bold: v.optional(v.boolean())`. They are inserted when present (spread of `args` already covers this once added to the validator).
- `update` args gain the same two optional fields; the existing "drop undefined keys" patch logic already handles partial updates.

No new functions. `text` is already optional on every kind, so labels on rect/circle need no backend change beyond what already exists.

Tests (`convex/boardElements.test.ts`): add a test that `create` + `update` persist `fontSize`/`bold`, and one that `update` can set `text` on a `rect` (documents that shape labels work end-to-end on the backend).

## Frontend architecture

### Refactor: extract interaction logic

`Canvas.tsx` already holds viewport wiring, pan, draw-create, drag move/resize, commit, keyboard, and rendering (~240 lines); these enhancements add marquee, multi-select drag, swatch-drop, and undo recording. To keep files focused, extract the interaction state machine into a hook:

- **`src/components/board/useCanvasInteractions.ts`** — owns pan state, draw-create, the drag state (move/resize, now multi-aware), and the marquee. Exposes `{ onPointerDown, onPointerMove, onPointerUp, marquee, dragPreview }` plus helpers `startMove(el, e)` / `startResize(el, corner, e)`. Takes the dependencies it needs (boardId, tool, color, selection get/set, viewport helpers, the mutations, font/bold defaults, and an `undo.record` callback). Pure-geometry math stays in `src/lib/board.ts`.
- **`Canvas.tsx`** — becomes mostly rendering: wires the hook's handlers onto the canvas div, renders shapes (SVG), HTML overlays (notes/text + new `ShapeFrame` for rect/circle), selection visuals, the marquee rectangle, and cursors.

This is a behaviour-preserving extraction done because we're already reworking the file — not a speculative rewrite.

### New components / hooks

- **`src/components/board/elements/ShapeFrame.tsx`** — a transparent HTML overlay positioned over a rect/circle's bounding box in the HTML layer. Renders the centered label, opens a `<textarea>` on double-click (same edit pattern as `NoteElement`), and is the element's hit area for select/move (spreads an `onPointerDown`). The visible outline stays in SVG (`ShapeElement`), which becomes `pointer-events: none` for rect/circle so the overlay owns interaction. Solves **#1** and **#2** together.
- **`src/components/board/BoardHelp.tsx`** — content for the help modal (tools list + keyboard/gesture shortcuts), rendered inside the existing `src/components/ui/Modal.tsx`.
- **`src/components/board/useUndo.ts`** — a small hook holding a stack (`useRef<Array<() => Promise<void>>>`). `record(inverse)` pushes an inverse thunk; `undo()` pops and runs the top thunk; `clear()` empties it (called on board switch). Undo-only, so thunks suffice — no redo stack.

### Selection model

Selection moves from a single `selectedId` to **`selectedIds: Id<"boardElements">[]`** held in `BoardView`:

- Plain click on an element → select only it (`[id]`).
- Shift/⌘-click on an element → toggle it in/out of `selectedIds`.
- Plain click / drag-release on empty canvas → clear selection (plain drag also pans).
- Shift/⌘-drag on empty canvas → marquee; on release, **add** all elements whose world bounds intersect the marquee to the selection.
- `editingId` stays single (you edit one element at a time).

`SelectionHandles` (resize) render only when `selectedIds.length === 1`. Every selected element shows a `.selected` highlight regardless of count.

### Interactions detail

- **Marquee:** Shift/⌘ + pointer-down on empty canvas records a start point; pointer-move past ~4px sets `marquee` (a screen-space rect derived from start→current). On pointer-up, convert to a world rect and select intersecting elements via `rectsIntersect(marquee, elementBounds(el))`. Under threshold → treated as a Shift/⌘-click on empty (no-op).
- **Multi-move:** pointer-down on a selected element (when `selectedIds.length > 1` and the element is in the selection) starts a move that captures every selected element's original position; pointer-move applies the same `dx/dy` to all (live preview); pointer-up commits one `update` per moved element. Pressing an unselected element with no modifier first selects just it, then moves it.
- **Swatch drop (#3):** in `Toolbar`, each swatch's pointer-down starts a "pending swatch drag" (color + start point) tracked in `BoardView`; a small colored ghost follows the cursor. If the pointer moves past the threshold it's a drag; releasing over the canvas calls a Canvas-provided `createNoteAt(clientX, clientY, color)` that converts to world coords and creates a note (auto-editing). Releasing under threshold = the swatch's existing click (set active color / recolor selection). Canvas exposes the drop handler because it owns the viewport→world conversion.
- **Auto-edit (#7):** `create` for `text` and `note` returns the new id; set `editingId` to it so the textarea mounts focused. The swatch-dropped note also auto-edits.
- **Esc / Space (#8):** a window keydown handler — ignored when `document.activeElement` is a `TEXTAREA` (so Space types and the textarea keeps its own behaviour). Space → set tool to `select`. Esc → if editing, blur/commit; else clear the marquee and set tool to `select`.
- **Placement cursor (#9):** `.board-canvas` cursor is `grab` for the select tool and `crosshair` for any drawing tool (driven by a class or inline style from `tool`).
- **Live draw preview (#12):** while a drawing tool drag is in progress, `useCanvasInteractions` exposes a transient `draft` element `{ kind, x, y, w, h, color }` recomputed on each pointer-move from `drawStart`→current world point (line keeps the raw vector; rect/circle use `normalizeRect`). `Canvas` renders the draft with the existing `ShapeElement` inside the SVG `<g>` (so it shares pan/zoom and looks identical to the committed shape), at reduced opacity to read as in-progress. On pointer-up the real element is created and `draft` is cleared. The draft is local only — not synced — matching the commit-on-drop model (teammates see the shape when it lands). Text/note tools have no draft (they place at a fixed default size).
- **Text size + bold (#10):** `Toolbar` gains an `A−` / `A+` pair and a `B` toggle on the left group. They set a `fontSize`/`bold` style that applies to newly created text-bearing elements and, when a selection exists, patch the selected element(s) via `update`. `NoteElement`, `TextElement`, and `ShapeFrame` render `style={{ fontSize, fontWeight: bold ? 700 : 400 }}`, falling back to per-kind defaults when the fields are absent.
- **Undo (#11):** action handlers call `undo.record(inverse)` after each mutation:
  - create → inverse `remove(id)`.
  - delete → inverse `create(savedFields)` (new id; undo-only).
  - move/resize → inverse `update(id, originalGeometry)` (orig captured at drag start; multi-move records a batch thunk updating each).
  - recolor / text / style → inverse `update(id, previousValue)` captured before the change.
  A window keydown handles `⌘Z` / `Ctrl+Z` (ignored when a TEXTAREA is focused, so native text undo wins) and calls `undo.undo()`. `BoardView` clears the stack when `activeId` changes.

### Help button (#6)

`Toolbar` renders a `?` button pushed to the far right (the tools/colors/style controls are left-aligned, the `?` is `margin-left: auto`). Clicking sets a `helpOpen` state in `BoardView`, which renders `<Modal onClose=...><BoardHelp/></Modal>`. The guide lists: the tools, double-click to edit, drag-a-color-to-drop-a-note, Shift/⌘-click + Shift/⌘-drag to multi-select, Delete/Backspace, Esc/Space for pointer mode, ⌘-Z undo, scroll to zoom, drag empty to pan.

### Pure helpers (`src/lib/board.ts`) + tests

- `elementBounds(el)` → `Rect` — the world-space bounding box of an element (`normalizeRect` for lines; `{x,y,w,h}` otherwise).
- `rectsIntersect(a: Rect, b: Rect)` → boolean — axis-aligned overlap test.
Unit tests in `src/lib/board.test.ts`: bounds for a normal rect and a negative-vector line; intersect true/false/edge-touching cases.

## Components touched (summary)

- `convex/schema.ts` — +2 optional fields.
- `convex/boardElements.ts` + `.test.ts` — validators + tests for fontSize/bold/label.
- `src/lib/board.ts` + `.test.ts` — `elementBounds`, `rectsIntersect`.
- `src/lib/constants.ts` — default font sizes per kind, font-size step bounds (e.g. `BOARD_FONT_SIZES` or min/max/step).
- `src/components/board/useCanvasInteractions.ts` (new), `useUndo.ts` (new).
- `src/components/board/Canvas.tsx` — slimmed to rendering + hook wiring; marquee + ShapeFrame + multi-select visuals + crosshair cursor + swatch-drop entry + live draw-preview draft.
- `src/components/board/ShapeFrame.tsx` (new), `BoardHelp.tsx` (new).
- `src/components/board/elements/NoteElement.tsx`, `TextElement.tsx`, `ShapeElement.tsx` — font/bold styling; ShapeElement rect/circle become `pointer-events: none`.
- `src/components/board/Toolbar.tsx` — draggable swatches, font-size +/−, bold toggle, `?` button.
- `src/components/board/BoardView.tsx` — `selectedIds`, `helpOpen`, swatch-drag state, undo wiring, font/bold active style, clears on board switch.
- `src/components/board/SelectionHandles.tsx` — render only when one selected (caller-gated).
- `src/index.css` — marquee rectangle, shape-frame label, swatch ghost, crosshair cursor, font/bold toolbar controls, `?` button, draft-shape opacity.

## Testing

- **Backend:** fontSize/bold persistence; setting `text` on a rect. (convex-test.)
- **Pure logic:** `elementBounds` + `rectsIntersect` unit tests; existing viewport-math tests stay green.
- **UI/interaction:** browser-verified manually by the user (the app is Google-login-only; no DOM-interaction harness in this repo). The plan will call out the exact click-throughs to confirm per enhancement.

## Out of scope (this round)

- Redo (Cmd-Shift-Z); undo of teammates' changes; persistent/server-side undo.
- Multi-element resize; rotation; alignment guides; grouping.
- Rich text within a single element (mixed sizes/weights), font family, text color picker for labels.
- Connectors/arrows, images, export.
