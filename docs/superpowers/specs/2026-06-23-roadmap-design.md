# Roadmap-sida — design

**Datum:** 2026-06-23
**Status:** Godkänd design, redo för implementationsplan

## Syfte

Lägga till en Roadmap-sida i appen. Sidan visar en enkel horisontell tidslinje
där användaren kan lägga in milstolpar (punkter i tiden), dra dem till rätt plats
i tiden, zooma in/ut, och koppla milstolpar till kort i Uppgifter.

Sidan ska byggas på samma sätt som övriga sidor (Pipeline, Contacts, Tasks) så att
design och känsla blir enhetlig — samma CSS-variabler, `.topbar`, `.btn`, `.card`,
`.modal`, `requireOrg`-grindar och query/mutation-mönster.

## Beslut (från brainstorming)

- **Milstolpe = en tidpunkt (punkt)** på tidslinjen, inte ett tidsspann/stapel.
- **Koppling: milstolpe → flera uppgiftskort.** Kopplingen lever på milstolpen
  som en array av `taskIds`. Korten visas som en lista i milstolpens detaljvy.
- **En enda tidslinje** för organisationen (inga swimlanes per projekt).

## Layout & interaktion

```
┌──────────────────────────────────────────────────────────────────────┐
│  Roadmap                                    [− zoom +]   [+ Ny milstolpe]│  ← .topbar
├──────────────────────────────────────────────────────────────────────┤
│   jan      feb      mar      apr      maj      jun  │idag│  jul     aug │  ← tidsaxel
│ ───────────●─────────────────●──────────────●──────┊──────────●─────── │  ← tidslinje
│        ┌────┴───┐       ┌────┴───┐     ┌────┴───┐   ┊    ┌────┴───┐    │
│        │ Lansering│      │ Beta   │     │ v2.0   │   ┊    │ Mässa  │    │  ← milstolpe-kort
│        │ 12 jan   │      │ 3 mar  │     │ 20 maj │   ┊    │ 9 jul  │    │
│        │ ●●● 3 kort│     │ ● 1 kort│    │        │   ┊    │ ●● 2   │    │
│        └──────────┘      └────────┘     └────────┘   ┊    └────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

- Horisontell tidsaxel. Varje milstolpe är en punkt på axeln med ett litet kort
  under sig (titel, datum, antal kopplade uppgiftskort).
- **Dra** ett milstolpe-kort i sidled → milstolpens datum uppdateras; vid släpp
  sparas det nya datumet.
- **Zoom**: knappar `−`/`+` i topbaren samt ⌘/Ctrl+scroll. Inzoomad visar axeln
  veckor/dagar; utzoomad visar månader/kvartal. Panorera genom horisontell scroll.
- **"Idag"-linje** markerar dagens datum.
- Klick på ett milstolpe-kort öppnar en detaljmodal (samma känsla som
  lead-/task-modalerna).
- Milstolpar som ligger nära varandra i tid staplas vertikalt så korten inte
  överlappar.

## Datamodell (`convex/schema.ts`)

Ny tabell `milestones`, byggd som `leads`/`tasks`:

```ts
milestones: defineTable({
  orgId: v.id("organizations"),
  titel: v.string(),
  beskrivning: v.string(),
  datum: v.string(),                 // ISO "YYYY-MM-DD" — punkten i tiden
  color: v.string(),                 // hex, som projects.color (markörens färg)
  taskIds: v.array(v.id("tasks")),   // kopplade uppgiftskort (milstolpe → flera kort)
  log: v.array(logEntry),            // ändringshistorik, som leads/tasks
  order: v.optional(v.number()),     // tiebreak när flera har samma datum
}).index("by_org", ["orgId"])
```

## Backend (`convex/milestones.ts`)

Samma mönster som `leads.ts` — alla handlers går via `requireOrg(ctx)` och
kontrollerar `orgId` på dokument innan ändring.

- `list` — query, milstolpar för aktiv org sorterade på `datum` (sedan `order`).
- `create({ titel, datum, beskrivning?, color? })` — skapar milstolpe, initierar
  tom `taskIds` och `log`.
- `update({ id, ...fält })` — uppdaterar fält med loggning.
- `setDate({ id, datum })` — lätt mutation för drag-i-tiden, loggar datumändring.
- `remove({ id })` — tar bort milstolpe.
- `linkTask({ id, taskId })` / `unlinkTask({ id, taskId })` — lägger till/tar bort
  ett `taskId` i `taskIds` (med loggning). Validerar att task tillhör samma org.

## Frontend

- **`src/components/roadmap/RoadmapView.tsx`** — vyn. Hämtar `api.milestones.list`
  och `api.tasks.list`. Renderar topbar (titel, zoom-kontroller, "Ny milstolpe")
  och `Timeline`.
- **`src/components/roadmap/Timeline.tsx`** — själva tidslinjen:
  - Räknar `pxPerDay` utifrån zoomnivå.
  - Beräknar tidsfönster från milstolparnas datum (med marginal) + dagens datum.
  - Positionerar markörer/kort efter datum, staplar nära kort vertikalt.
  - Hanterar drag (x → datum → `setDate`) med live-förhandsvisning.
  - Hanterar zoom (knappar + ⌘/Ctrl-scroll) och horisontell panorering.
  - Ritar tidsaxel med tick-etiketter som anpassas efter zoom samt "idag"-linje.
- **`src/components/roadmap/MilestoneDetail.tsx`** — detaljmodal som `CardDetail`:
  `InlineField` för titel/datum/beskrivning/färg, plus en sektion som listar
  kopplade uppgiftskort med "lägg till / ta bort".
- **`src/components/Sidebar.tsx`** — nytt nav-item "Roadmap" med antal som badge.
- **`src/App.tsx`** — `"roadmap"` i `View`-typen + rendering i `Workspace`.
- **`src/components/ModalHost.tsx`** + **`src/context/ModalContext.tsx`** — registrera
  milstolpe-detaljmodalen (öppnas via `openMilestoneDetail(id)`).
- **`src/index.css`** — nya klasser för tidslinjen (`.timeline`, `.milestone`,
  `.tl-axis`, m.fl.) byggda på befintliga CSS-variabler.

## Tester

Convex-tester för `milestones.ts` i stil med `tasks.test.ts`:
create / list / update / setDate / remove, org-isolering, samt link/unlink-task.

## Avgränsningar (YAGNI)

- Inga tidsspann/staplar (Gantt) — endast punkt-milstolpar.
- Inga swimlanes per projekt — en enda tidslinje.
- Ingen koppling styrd från uppgiftskortets vy i denna iteration (kopplingen sker
  från milstolpen). Kan läggas till senare om det behövs.
