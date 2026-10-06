# Editable pipeline stages — design

Today the five pipeline stages (`Lead`, `Kvalificerat`, `Förslag`, `Offererat`, `Stängd`) are hard-coded in `src/lib/constants.ts` (`STAGES`, `STAGE_VAR`), and every lead stores its stage as a name string (`leads.steg`). Colors are keyed by that name, and the "X stängda" counter compares against the literal `"Stängd"`.

This change makes stages per-organization data that users can **add, rename, delete, reorder and recolor directly in the pipeline view**.

## Scope decisions (from brainstorming)

- Operations: add, rename, delete, reorder, recolor.
- Editing happens **in the pipeline view** (no Settings section).
- Deleting a stage that has leads: a confirm modal asks which stage to move them to; each moved lead gets a log entry.
- The "stängda" counter counts leads in the **last stage** (highest `order`). No per-stage "closed" flag.
- Approach A: a `stages` table, leads reference a stage by `stageId`. Renames touch one document.

## Data model

New table in `convex/schema.ts`:

```ts
stages: defineTable({
  orgId: v.id("organizations"),
  namn: v.string(),
  color: v.string(),   // hex, e.g. "#6b8aa8"
  order: v.number(),   // column order, ascending left → right
}).index("by_org", ["orgId"]),
```

`leads`:
- add `stageId: v.optional(v.id("stages"))` (widen phase; becomes required in the narrow phase),
- `steg` becomes `v.optional(v.string())` (widen phase; removed in the narrow phase).

`log` is unchanged: entries keep stage **names** (`from`/`to`) as a snapshot of what the stage was called at the time.

### Default stages

`convex/helpers.ts` exports:

```ts
export const DEFAULT_STAGES = [
  { namn: "Lead", color: "#6b8aa8" },
  { namn: "Kvalificerat", color: "#8a6fa8" },
  { namn: "Förslag", color: "#c8923a" },
  { namn: "Offererat", color: "#c45b32" },
  { namn: "Stängd", color: "#4f7a52" },
];
export async function insertDefaultStages(ctx: MutationCtx, orgId: Id<"organizations">): Promise<Id<"stages">[]>
```

Colors equal today's `--s0`…`--s4`, so nothing changes visually. `order` = index (0…4).

Callers: `organizations.create`, `seed.run`, and the backfill migration. Every org therefore always has ≥ 1 stage; the last remaining stage cannot be deleted.

### Migration (widen → backfill → narrow)

1. **Widen** (this PR): schema as above (`stageId` optional, `steg` optional). All new writes set `stageId`. New leads no longer set `steg`.
2. **Backfill** (this PR): `internalMutation migrations.backfillStages` — for every organization without stages, insert defaults; for every lead without `stageId`, match `steg` against the org's stage names (exact match) and set `stageId`; unknown/missing names fall back to the org's first stage. Idempotent. `internalQuery migrations.verifyStages` returns `{ orgsWithoutStages, leadsWithoutStageId }`. Run right after deploying:
   ```
   npx convex run migrations:backfillStages
   npx convex run migrations:verifyStages   # expect 0 / 0
   ```
3. **Narrow** (separate follow-up PR, after verify shows 0/0 in prod): `stageId` required, `steg` removed from schema and code.

During the window between widen-deploy and backfill, leads without `stageId` are not shown on the board. Backfill is run immediately after deploy.

## Backend API

### `convex/stages.ts` (new)

All functions use `requireOrg` and verify the stage belongs to the caller's org.

| Function | Behavior |
|---|---|
| `list` (query) | Org's stages sorted by `order`. |
| `create({ namn })` | Trimmed name, non-empty, unique (case-insensitive) within org. Appended last (`order` = max + 1). Color = next in `PROJECT_COLORS` (by stage count). Returns id. |
| `rename({ id, namn })` | Trimmed, non-empty, unique (case-insensitive, ignoring itself). Errors: `"Namnet får inte vara tomt"`, `"Det finns redan ett steg som heter \"X\""`. |
| `setColor({ id, color })` | Patches color. |
| `reorder({ id, order })` | Patches order (client computes with `orderForIndex`). |
| `remove({ id, moveToId? })` | Error `"Det sista steget kan inte tas bort"` if it's the org's only stage. If the stage has leads, `moveToId` is required (`"Välj ett steg att flytta affärerna till"`), must differ from `id` and belong to the org; each lead gets `stageId = moveToId` and a log entry `{ from: oldName, to: newName }`. Then the stage is deleted. All in one transaction. |

### `convex/leads.ts`

- `create`, `update`: arg `steg` → `stageId: v.id("stages")`. The stage is loaded and org-checked (`"Steget saknas"`); its name goes into the log entry.
- `move({ id, stageId, order? })`: same as today but by id; no-op if unchanged.
- `list`: unchanged.

## UI

### Shared hook

`src/lib/stages.ts` — `useStages()` returns the sorted stage list (`useQuery(api.stages.list) ?? []`) plus helpers `stageById(id)` and `stageColorByName(name)` (for log entries; fallback `var(--line)`).

`STAGES` and `STAGE_VAR` are removed from `constants.ts`; the `--s0…--s4` CSS variables can stay (harmless) but are no longer read.

### Pipeline view (`src/components/kanban/`)

- Columns come from `useStages()`. `.board` gets an inline `gridTemplateColumns: repeat(N + 1, minmax(240px, 1fr))` (the `+1` is the add-column); the existing ≤1100px media rule still switches to horizontal scroll.
- **Rename:** double-click the column title → inline input (same pattern as `BoardTabs`): Enter/blur saves, Esc cancels, empty/unchanged cancels. Errors show as a toast with the server message.
- **Column menu:** a `⋯` button in the column head (visible on hover) opens a small popover with the color swatches (`PROJECT_COLORS`) and "Ta bort steg". Clicking outside closes it.
- **Delete:** opens a modal. Empty stage → "Vill du ta bort steget X?" Stage with leads → "Steget X har N affärer. Flytta dem till: [select of other stages]" with the first other stage preselected. Disabled when it's the only stage (menu item greyed with tooltip).
- **Add:** a narrow last column "+ Nytt steg"; clicking turns it into an inline input; Enter creates, Esc/empty cancels.
- **Reorder:** the column head is draggable (HTML5 DnD). While dragging a column (tracked separately from the card `dragId`), dropping on another column's head inserts before/after it based on pointer x vs. midpoint; a vertical accent line shows the insertion point. Card drag-and-drop is unaffected (column drag sets its own state and card handlers ignore it, and vice versa).
- **Counter:** "X stängda" counts leads whose `stageId` equals the last stage's id.
- **"Nytt lead"** (topbar) creates in the first stage; per-column "Lägg till" in that column.

### Other consumers

- `LeadCard`: color from `stageById(lead.stageId)`.
- `CardDetail`: stage select options from `useStages()` (value = id, label = name); save sends `stageId`; head tag/color from the stage.
- `ContactDetail` linked leads: dot color + pill name from the stage.
- `CardLog`: badge color via `stageColorByName(name)` (renamed/deleted stages fall back to neutral; the historical name is still shown).

## Error handling

Stage validation errors are thrown as `ConvexError("<Swedish message>")` so the message reaches the client intact (plain `Error` messages are wrapped/redacted by Convex). The UI catches and shows `toast(errorMessage(err))`, where `errorMessage` returns `err.data` for a string `ConvexError` and "Något gick fel" otherwise.

## Testing

`convex/stages.test.ts` (convex-test), following existing test helpers:
- `organizations.create` seeds 5 default stages in order.
- `create` appends last; rejects empty and duplicate (case-insensitive) names.
- `rename` updates the name; rejects duplicate/empty; leads keep their `stageId`.
- `reorder` / `setColor` patch fields; cross-org access is rejected.
- `remove` empty stage; `remove` with leads moves them to `moveToId` and appends log entries; rejects missing `moveToId`, same id, other-org target, and deleting the last stage.

`convex/leads.test.ts`: updated to `stageId`; move logs names.

`convex/migrations.test.ts`: `backfillStages` creates defaults for orgs without stages, maps `steg` → `stageId` by name, falls back to first stage for unknown names, is idempotent; `verifyStages` reports 0/0 afterwards.

Frontend: `tsc` + `vite build` pass; manual verification in the browser preview of rename, add, recolor, reorder, delete-with-move, and card drag-and-drop still working.

## Out of scope

- Narrow phase (follow-up PR).
- Per-stage "closed/won/lost" semantics.
- Batched delete for very large stages (tens of leads per org today).
- Release notes / version bump (done when releasing).
