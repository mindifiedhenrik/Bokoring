# Användare, ansvarig-referens och enhetliga inline-kort

**Datum:** 2026-06-17
**Status:** Godkänd design

## Bakgrund

CRM-appen (Convex + React 19, vanlig CSS) har idag:
- Auth via `@convex-dev/auth` (lösenord + registreringskod i `SIGNUP_CODE`). Inga visningsnamn.
- `leads.agare` och `tasks.agare` är **fritextfält** (`string`).
- Leads öppnas i en läsvy (`LeadDetail`, två flikar: Översikt + Stegslogg) med en "Redigera"-knapp som öppnar ett separat formulär (`LeadForm`).
- Tasks öppnas direkt i ett formulär (`TaskForm`) — ingen läsvy. Layouterna skiljer sig.
- Ingen inline-redigering; allt går via modal-formulär.

## Mål

1. Se och radera registrerade användare i settings.
2. "Ansvarig" på korten (pipeline + uppgifter) blir en **användare**, vald via dropdown.
3. Korten i pipeline och uppgifter ska se **enhetliga** ut när de öppnas (utgå från pipeline-kortens stil).
4. Man ska kunna **redigera fält direkt genom att klicka på dem** — ingen separat "Redigera"-knapp eller formulär.

"Användare" = registrerade auth-konton (de som registrerat sig med koden).

## Icke-mål

- Roller/behörigheter utöver befintlig auth.
- Inbjudningsflöde utöver den befintliga registreringskoden.
- Bevarande av befintliga fritext-`agare`-värden (antas vara icke-produktionsdata).

---

## Sektion 1 — Datamodell

### Ny tabell: `userProfiles`

```ts
userProfiles: defineTable({
  userId: v.id("users"),
  displayName: v.string(),
}).index("by_user", ["userId"])
```

Visningsnamn slås upp via denna tabell. Saknas profil → fall tillbaka till
e‑postadressens del före `@`. Auth-tabellen `users` ändras inte.

### Ändrade fält: ansvarig blir referens

`leads.agare: v.string()` → `leads.agareId: v.optional(v.id("users"))`
`tasks.agare: v.string()` → `tasks.agareId: v.optional(v.id("users"))`

- Valfritt (`optional`) → ett kort kan sakna ansvarig ("Ingen").
- **Migration:** engångs-mutation (`migrations.clearLegacyAgare` eller motsvarande)
  som tar bort gamla fritextvärden vid behov. Eftersom fältnamnet byter (`agare`
  → `agareId`) försvinner gamla strängvärden naturligt; ingen mappning görs.
- **Vid radering av användare:** alla leads/tasks där `agareId` pekar på den
  raderade användaren nollställs (sätts till `undefined`).

---

## Sektion 2 — Settings: användare + profil

Två nya sektioner i `src/components/settings/SettingsModal.tsx`:

### Min profil
- Inputfält för eget visningsnamn, förifyllt med nuvarande namn (eller tomt).
- Sparas via `userProfiles.setMyName`.

### Användare
- Lista över **alla** registrerade konton: visningsnamn + e‑post.
- "Ta bort"-knapp per rad med bekräftelsedialog.
- Man kan **inte** radera sig själv (knappen döljs/inaktiveras för egen rad).

### Backend (Convex)

| Funktion | Typ | Beskrivning |
|---|---|---|
| `users.list` | query | Alla konton: `{ _id, email, displayName }` (displayName via `userProfiles`, fallback e‑post före `@`). |
| `users.remove` | mutation | Raderar auth-kontot för angivet `userId`; nollställer `agareId` på alla leads/tasks som pekar på det. Vägrar om `userId` == inloggad användare. |
| `userProfiles.setMyName` | mutation | Skapar/uppdaterar `userProfiles` för inloggad användare. |
| `userProfiles.myProfile` | query | Inloggad användares profil (för förifyllning). |

Befintlig `users.viewer` behålls.

---

## Sektion 3 — Enhetlig kortvy (`CardDetail`)

Ny gemensam komponent som ersätter `LeadDetail`, `LeadForm` och `TaskForm`.
Stil och struktur från dagens `LeadDetail`: header med titel + två flikar.

- **Översikt-flik:** fält-rader (etikett + värde), alla inline-redigerbara.
- **Logg/Historik-flik:** befintlig tidslinje (steg-/status-/projekt-loggen).
- **Footer/header:** "Ta bort"-knapp (med bekräftelse).

Samma layout och interaktion för båda korttyperna; endast fältuppsättningen skiljer:

| Lead | Uppgift |
|---|---|
| titel | titel |
| kundkontakt | projekt |
| sannolikhet | status |
| **ansvarig** | **ansvarig** |
| datum | prioritet |
| steg | beskrivning |
| beskrivning | |

Komponenten parametriseras på korttyp (lead/task) så att rätt fält och rätt
mutationer används, men chrome (flikar, fältrader, inline-edit, logg, ta bort)
är delat.

---

## Sektion 4 — Inline-redigering

Klick på ett fältvärde gör det redigerbart på plats. **Sparas på blur och Enter;
Esc avbryter** (textarea sparar på blur, ny rad med Enter).

| Fält | Kontroll |
|---|---|
| titel, beskrivning | text / textarea |
| sannolikhet | nummer/slider (0–100) |
| datum | datepicker |
| steg | dropdown (STAGES) |
| status | dropdown (statusar) |
| prioritet | dropdown (Låg/Normal/Hög) |
| projekt | dropdown (projekt) |
| kundkontakt | dropdown/sök (kontakter) |
| **ansvarig** | dropdown (användare + "Ingen") |

Varje sparning anropar respektive patch-mutation (t.ex. `leads.update` /
`tasks.update` med enskilda fält). Loggen uppdateras som idag vid steg-/status-
/projektbyten.

### Skapa inline

"Nytt lead" / "Ny uppgift" skapar **direkt** ett kort med standardvärden och
öppnar det i `CardDetail`:

- Lead: titel `"Namnlöst lead"`, `steg: "Lead"`, övriga fält tomma/standard.
- Uppgift: titel `"Namnlös uppgift"`, `status: "Backlog"`, `prioritet: "Normal"`,
  `projectId` = projektet för raden den skapas i (uppgifter skapas per projektrad).

Inga halvfärdiga formulär — kortet existerar direkt i databasen och tas bort via
"Ta bort" om det inte behövs.

---

## Berörda filer (översikt)

**Convex:**
- `convex/schema.ts` — ny `userProfiles`-tabell; `agare` → `agareId` på leads/tasks.
- `convex/users.ts` — `list`, `remove`.
- `convex/userProfiles.ts` (ny) — `setMyName`, `myProfile`.
- `convex/leads.ts`, `convex/tasks.ts` — `create`/`update` anpassas till `agareId`; create med standardvärden.
- ev. `convex/migrations.ts` (ny) — engångsstädning av gamla fält.

**Frontend:**
- `src/components/settings/SettingsModal.tsx` — profil + användarlista.
- `src/components/cards/CardDetail.tsx` (ny) — gemensam inline-vy.
- inline-edit-hjälpkomponent(er) (t.ex. `InlineField`).
- `src/components/kanban/PipelineView.tsx`, `src/components/tasks/TasksView.tsx` — öppna `CardDetail`; "nytt kort" skapar inline.
- Ta bort/avveckla `LeadDetail.tsx`, `LeadForm.tsx`, `TaskForm.tsx`.
- `src/index.css` — stilar för inline-fält och delad kortvy.

## Testning

- Convex-funktioner (`convex-test` + Vitest): `users.remove` nollställer kort + vägrar självradering; `userProfiles.setMyName` upsert; `list` fallback till e‑post.
- Manuell verifiering i preview: skapa/öppna/redigera lead och task inline, sätt ansvarig via dropdown, radera användare och se att ansvarig nollställs, jämför att lead- och task-vy ser enhetliga ut.
