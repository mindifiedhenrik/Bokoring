# Team board (Miro-style) — design

## Goal

Add a new page to the app: a collaborative, Miro-style team board. Users can:

- Add and delete boards.
- Place **post-it notes** (editable text on a colored background).
- Place free **text**.
- Draw simple **shapes**: lines, rectangles, circles.
- Pan and zoom an effectively-infinite canvas; select, move, and resize elements.
- See **other people's cursors live** while they work on the same board.

Boards and their contents are realtime-shared within the organization, matching the
rest of the app ("Delad arbetsyta · realtidssynk via Convex").

## Scope decisions

- **Sync model:** realtime shared per-org **plus live cursors**.
- **Canvas:** full navigation — pan (drag empty canvas), zoom (scroll), select, move, resize.
- **Styling:** a **color palette per element**. One `color` field per element, interpreted by kind
  (note = background, text = text color, shape = stroke). Shapes are **outline-only** (no fill toggle).
- **Rendering:** **hybrid** — an SVG layer for shapes (crisp at any zoom) and an absolutely-positioned
  HTML overlay for notes/text (native `<textarea>` editing), both sharing one pan/zoom transform.
- **Layout:** Option A — board **tabs across the top** (+ "Ny tavla", delete), a **horizontal tool row**
  beneath, canvas fills the rest. The app's existing left sidebar stays.
- **Element drag:** **commit on drop** (not streamed live). Cursors stream live; element geometry is
  written once on pointer-up. Far fewer writes; each element is its own document so concurrent edits are safe.
- **View state (pan/zoom):** client-only, not persisted.

## Data model (Convex)

All tables scoped to `orgId` and guarded by `requireOrg`, following existing modules.

### `boards`
```
orgId:  v.id("organizations")
namn:   v.string()
order:  v.number()        // tab order
```
Index: `by_org` (`orgId`).

### `boardElements`
One document per element so moves/edits don't contend on a shared board doc.
```
orgId:   v.id("organizations")
boardId: v.id("boards")
kind:    v.union("note", "text", "line", "rect", "circle")   // string literals via v.literal
x, y:    v.number()       // world coordinates (top-left, or line start)
w, h:    v.number()       // size; for `line`, the vector to the endpoint (may be negative)
text:    v.optional(v.string())   // note / text only
color:   v.string()       // from the fixed palette
order:   v.number()       // z-index
```
Indexes: `by_board` (`boardId`), `by_org` (`orgId`).

### `boardPresence`
Live cursors. One document per (user, board).
```
orgId:     v.id("organizations")
boardId:   v.id("boards")
userId:    v.id("users")
x, y:      v.number()     // world coordinates
updatedAt: v.number()     // Date.now()
```
Indexes: `by_board` (`boardId`), `by_user_board` (`userId`, `boardId`).
Entries older than ~10s are treated as stale: filtered out of the `listByBoard` result.

## Backend functions

**`convex/boards.ts`**
- `list` — boards for the active org, sorted by `order` then `_creationTime`.
- `create({ namn })` — insert with `order = Date.now()`. Returns the new id.
- `rename({ id, namn })` — guarded by org.
- `remove({ id })` — verify org, then cascade-delete all `boardElements` and `boardPresence`
  rows for the board before deleting the board itself.

**`convex/boardElements.ts`**
- `listByBoard({ boardId })` — verify the board belongs to the caller's org, return its elements sorted by `order`.
- `create({ boardId, kind, x, y, w, h, text?, color })` — insert with `order = Date.now()`.
- `update({ id, x?, y?, w?, h?, text?, color? })` — patch provided fields; org-guarded.
- `remove({ id })` — org-guarded delete.

**`convex/boardPresence.ts`**
- `heartbeat({ boardId, x, y })` — upsert the caller's row for the board (insert or patch),
  set `updatedAt = Date.now()`. Client throttles to ~60ms.
- `listByBoard({ boardId })` — other users' rows for the board that are fresh
  (`Date.now() - updatedAt < 10_000`), excluding the caller.

Each function verifies org membership and that referenced boards/elements belong to the caller's org,
mirroring the `prev.orgId !== orgId` checks in `tasks.ts`.

## Frontend

New directory `src/components/board/`.

- **`BoardView.tsx`** — top-level page. Owns `selectedBoardId`, `selectedTool`, `selectedColor`,
  and `selectedElementId`. Renders `BoardTabs`, `Toolbar`, `Canvas`. If no board exists, shows an
  empty state with a "Skapa tavla" button.
- **`BoardTabs.tsx`** — board tabs, active highlight, "+ Ny tavla" (prompts for a name),
  delete current board (with a confirm). Uses the app's `ToastContext`/`ModalContext` conventions.
- **`Toolbar.tsx`** — tool buttons: select, note, text, rectangle, circle, line; plus a color-palette
  swatch row. Selecting a tool sets `selectedTool`; choosing a color sets `selectedColor` and, if an
  element is selected, recolors it.
- **`Canvas.tsx`** — the interaction surface. Renders a transformed container with two child layers:
  - an `<svg>` shapes layer (`ShapeElement` per shape),
  - an HTML overlay (`NoteElement` / `TextElement`),
  - `Cursors` (others' live cursors), and `SelectionHandles` for the selected element.
  Handles pointer events: pan (drag empty space), zoom (wheel), create-on-drag with the active tool,
  select/move/resize with the select tool. Geometry changes are local during a drag and committed via
  one `boardElements.update` on pointer-up. Sends throttled `boardPresence.heartbeat` on pointer move.
- **`useViewport.ts`** — `{ panX, panY, zoom }` state plus `screenToWorld` / `worldToScreen` helpers
  and the transform string. Zoom clamped (e.g. 0.2–4).
- **`elements/NoteElement.tsx`** — colored sticky; double-click to edit via `<textarea>`, blur commits text.
- **`elements/TextElement.tsx`** — transparent text; double-click to edit.
- **`elements/ShapeElement.tsx`** — renders `line` / `rect` / `circle` as SVG primitives in `color`.
- **`SelectionHandles.tsx`** — bounding box + corner resize handles for the selected element
  (lines get endpoint handles).
- **`usePresence.ts`** — subscribes to `boardPresence.listByBoard`; exposes a throttled `report(x,y)`.
- **`Cursors.tsx`** — renders other users' cursors with their display name.

**Wiring:**
- `App.tsx`: add `"board"` to the `View` union and render `<BoardView />`.
- `Sidebar.tsx`: add a "Tavla" nav item (add `"board"` to its `View` type) with an icon and,
  optionally, a board count.
- Styles added to `src/index.css` using existing CSS variables (`--paper`, `--card`, `--line`,
  `--accent`, shadows, radii). A small element color palette (`BOARD_COLORS`) is defined as a
  frontend constant in `src/lib/constants.ts` (color values are presentation-only) and reused by the
  toolbar. The backend stores whatever `color` string the client sends.

## Interactions summary

- **Pan:** drag on empty canvas. **Zoom:** mouse wheel, clamped.
- **Create:** pick a tool, then click (notes/text default size) or drag (shapes, and notes if dragged)
  on the canvas. New notes/text open for editing immediately.
- **Edit text:** double-click a note/text element; `<textarea>` overlay; blur or Esc commits.
- **Select/move/resize:** with the select tool, click to select, drag body to move, drag handles to
  resize; `Delete`/`Backspace` removes the selected element.
- **Color:** the palette swatch sets the color for new elements and recolors the selected one.
- **Boards:** tabs switch boards; "+ Ny tavla" creates; delete (confirm) removes the board and its contents.

## Testing

Convex function tests with `convex-test`, mirroring existing `*.test.ts` files:

- `boards.test.ts` — create/list/rename ordering; `remove` cascades elements and presence;
  org isolation (another org can't see or mutate).
- `boardElements.test.ts` — create/list-by-board ordering; update patches only given fields;
  remove; cross-org guard; rejecting elements on a board from another org.
- `boardPresence.test.ts` — heartbeat upsert (one row per user/board); `listByBoard` filters stale
  rows and excludes the caller.

Frontend coordinate logic (`useViewport` `screenToWorld`/`worldToScreen` round-trip) gets a unit test,
following the existing `src/lib/*.test.ts` pattern.

## Out of scope (v1)

- Fill colors / stroke width / font size (palette-only styling).
- Live-streamed element dragging (commit-on-drop only).
- Persisted per-user viewport, arrows/connectors, images, undo/redo, multi-select, grouping,
  copy/paste, export. These can be follow-ups.
