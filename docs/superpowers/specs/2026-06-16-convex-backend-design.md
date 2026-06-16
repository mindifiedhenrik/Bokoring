# Iteration 2 — Convex-backend med databas och inloggning

**Datum:** 2026-06-16
**Status:** Godkänd design

## Bakgrund

Iteration 1 levererade ett komplett CRM som en fristående HTML-fil (`crm.html`)
med all data i `localStorage`. Datalagret isolerades medvetet i en `Store`-modul
med async-metoder (`Store.leads/contacts/projects/tasks/settings`) just för att
göra detta byte enkelt.

Iteration 2 kopplar systemet till en molndatabas med inloggning så att flera
användare kan logga in och dela samma data, med live-uppdateringar.

## Vägval (beslutade)

| Fråga | Beslut |
| --- | --- |
| Backend | **Convex** (reaktiv databas + TypeScript-funktioner + Convex Auth) |
| Datamodell | **Delad arbetsyta** — alla inloggade ser/redigerar samma data |
| Inloggning | **E-post + lösenord** via Convex Auth (Password-provider) |
| Frontend | **Vite + React + TypeScript** (omstrukturering från enfilslösningen) |

## Arkitektur

- **Frontend:** Vite + React + TypeScript som SPA. Nuvarande vyer (Pipeline-kanban,
  Kontakter, Uppgifter-swimlane, modaler, inställningar) blir React-komponenter.
  Befintlig CSS flyttas i princip ordagrant till `src/index.css` — utseendet
  blir identiskt.
- **Backend:** En Convex-deployment med `convex/`-mapp (schema + funktioner),
  drivs lokalt med `npx convex dev`.
- **Auth:** Convex Auth med Password-provider. Appen gateas: utloggad →
  inloggningsskärm, inloggad → CRM:t.
- **Delning:** Alla inloggade delar samma data. Funktioner kräver inloggad
  användare (`requireAuth`) men filtrerar *inte* rader per användare.
- **Realtid:** `useQuery` är prenumerationer → ändringar pushas live till alla
  anslutna klienter, så kanban-tavlan uppdateras hos alla samtidigt.

## Projektstruktur

```
convex/
  schema.ts        tabelldefinitioner + Convex Auth-tabeller
  auth.ts          convexAuth({ providers: [Password] })
  auth.config.ts   auth-konfiguration
  http.ts          auth-routes
  leads.ts         queries + mutations
  contacts.ts
  projects.ts
  tasks.ts
  settings.ts
  crons.ts         daglig arkiveringssvep
  seed.ts          engångs-mutation med demodata
  _generated/      Convex codegen
src/
  main.tsx         ConvexAuthProvider + ConvexReactClient
  App.tsx          auth-gate + navigation + vy-routing
  index.css        befintlig stil (~ordagrant)
  lib/format.ts    datum/initialer-hjälpare
  components/
    Sidebar.tsx · LoginScreen.tsx · Toast.tsx · ui/Modal.tsx
    kanban/   PipelineView · LeadCard · LeadModal
    contacts/ ContactsView · ContactModal
    tasks/    TasksView · TaskCard · Pile · TaskModal
    settings/ SettingsModal
index.html · package.json · vite.config.ts · tsconfig.json
```

Scaffoldas i nuvarande mapp. `crm.html` behålls som referens tills React-versionen
når paritet, därefter kan den tas bort.

## Datamodell (Convex-schema)

Convex lägger automatiskt till `_id` och `_creationTime` på varje rad.

- **contacts:** `namn`, `foretag`, `epost`, `telefon`
- **leads:** `titel`, `beskrivning`, `contactId` *(v.id("contacts"), valfri)*,
  `sannolikhet` (number), `agare`, `datum`, `steg`,
  `log[]` `{ ts, from, to }`
- **projects:** `namn`, `beskrivning`, `color`
- **tasks:** `titel`, `beskrivning`, `projectId` *(v.id("projects"))*, `status`,
  `agare`, `prioritet`, `archived` (bool), `archivedAt` *(valfri)*,
  `log[]` `{ ts, from?, to?, fromProject?, toProject?, archived?, restored? }`
- **settings:** en singleton-rad `{ archiveDays, pileThreshold }`
- **auth-tabeller:** `users` m.fl. — tillhandahålls av Convex Auth (`authTables`)

Loggarna förblir inbäddade arrayer precis som i iteration 1. Loggpostens varianter
modelleras med valfria fält via en `v.object`-validator.

## Backend-funktioner

Per entitet: queries + mutations, alla kräver inloggning via en `requireAuth(ctx)`
-helper som kastar fel om ingen användare är inloggad. Stegslogg-logiken flyttas
in i mutationerna (serverauktoritativ, atomär och konsekvent mellan användare;
tidsstämplar sätts server-side).

- **leads:** `list` · `create` *(initierar log med första steget)* · `update` ·
  `move` *(byter steg + lägger till loggpost)* · `remove`
- **contacts:** `list` · `create` · `update` · `remove` *(avlänkar leads:
  sätter `contactId` till undefined)*
- **projects:** `list` · `create` *(tilldelar nästa färg ur paletten)* · `update` ·
  `remove` *(kaskaderar: raderar projektets tasks)*
- **tasks:** `list` · `create` *(initierar log)* · `update` *(loggar status-/
  projektbyte)* · `move` *(dnd: status/projekt + loggpost)* · `remove` ·
  `restore` *(avarkiverar + nollställer flytt-klockan med loggpost)*
- **settings:** `get` *(returnerar defaults sammanslaget med sparad rad)* · `set`
- **crons.ts:** daglig arkiveringssvep (intern mutation) som arkiverar Done-tasks
  äldre än `archiveDays`. Serverstyrt — fungerar även när ingen är inloggad.

Kvar på klienten:
- Varningen vid projektbyte (`confirm()` innan `tasks.move` anropas).
- Hög-uppfällning/-ihopfällning (ren React-state, sparas inte) — som idag.

## Inloggning & seed

- **LoginScreen:** växla mellan logga in / registrera; e-post + lösenord via
  `useAuthActions().signIn("password", { email, password, flow })`.
- **App-gate:** `<AuthLoading>` (spinner), `<Unauthenticated>` (LoginScreen),
  `<Authenticated>` (CRM).
- **Sidofot:** visar inloggad e-post + "Logga ut" (`signOut`).
- **seed.ts:** engångs-mutation som fyller en tom databas med samma demodata
  som i iteration 1 (kontakter, leads, projekt, tasks med backdaterade loggar).
  Körs med `npx convex run seed`.

## Reaktivitet / dataflöde

Varje vy använder `useQuery(api.<entity>.list)`. Redigeringar anropar
`useMutation(api.<entity>.<fn>)`. Convex pushar uppdateringar till alla
prenumererande klienter → live delad tavla. Detta ersätter `Store` + manuell
`refresh()` från iteration 1.

## Utanför scope (YAGNI)

- Team / flera arbetsytor, roller och behörigheter (alla inloggade är fulla
  redaktörer av den delade datan).
- Koppla "Ägare" till riktiga användarkonton (förblir fritext).
- OAuth / magisk länk (endast lösenord nu).
- Frontend-hosting/deploy (körs lokalt med `vite dev` + `npx convex dev`).
- Migrering av befintlig `localStorage`-data (vi seedar istället).

## Test

Lättviktiga enhetstester med `convex-test` för nyckelmutationer:

- `tasks.move` / `leads.move` lägger till rätt loggpost.
- `contacts.remove` avlänkar kopplade leads.
- `projects.remove` kaskaderar och raderar projektets tasks.

## Krav på omgivningen

- Node.js + npm.
- Ett (gratis) Convex-konto; `npx convex dev` skapar/kopplar en deployment och
  sätter `VITE_CONVEX_URL` i `.env.local`.
