# Boköring CRM

Ett CRM med Trello-liknande kanban-pipeline, kontaktdatabas och en
uppgiftstavla (swimlanes per projekt). Byggt på **Convex** (reaktiv databas +
inbyggd autentisering) och **React + Vite + TypeScript**. Alla inloggade
användare delar samma arbetsyta och ser varandras ändringar i realtid.

## Funktioner

- **Pipeline (kanban):** fem steg (Lead → Kvalificerat → Förslag → Offererat →
  Stängd), dra-och-släpp mellan steg, stegslogg med tidsstämplar per lead.
- **Kontakter:** kunddatabas kopplad till leads; en kontakts sida visar dess
  affärer. Tas en kontakt bort avlänkas dess leads (raderas inte).
- **Uppgifter:** swimlane-tavla med projekt som rader och status som kolumner
  (Backlog → Done), dra-och-släpp, prioritet, dag-räknare, historik och
  "högar" som buntar ihop fulla faser. Done-kort arkiveras automatiskt efter
  ett inställbart antal dagar (daglig cron).
- **Inställningar:** tröskel för högar, antal dagar till arkivering, samt
  återställning av arkiverade uppgifter.
- **Inloggning:** e-post + lösenord via Convex Auth.

## Köra lokalt

Kräver Node.js och ett (gratis) Convex-konto.

```bash
npm install

# Terminal 1 — backend: skapar/kopplar deployment, kodgenererar, watchar convex/.
# Skriver VITE_CONVEX_URL till .env.local.
npx convex dev

# Engångs — provisionerar auth-nycklar (JWT_PRIVATE_KEY, JWKS, SITE_URL).
npx @convex-dev/auth

# Engångs — fyller en tom databas med demodata.
npx convex run seed:run

# Terminal 2 — frontend.
npm run dev
```

Öppna adressen som visas (t.ex. http://localhost:5173), registrera ett konto
och logga in. All data delas mellan inloggade användare.

## Test

```bash
npm test
```

Enhetstester (`convex-test` + Vitest) täcker backend-mutationerna: stegslogg
vid flytt, avlänkning av leads när en kontakt tas bort, kaskadradering av ett
projekts uppgifter, och arkiveringssvepet.

## Struktur

```
convex/        Backend: schema, auth, queries/mutations, cron, seed (+ tester)
src/
  components/  Vyer och modaler (kanban/, contacts/, tasks/, settings/)
  context/     ModalContext, ToastContext
  lib/         constants, format-hjälpare
docs/          Spec och implementationsplan
```
