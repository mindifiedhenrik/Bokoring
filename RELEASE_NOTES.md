# Release notes

## 2.2.0 — 2026-10-06 · Redigerbar pipeline, team-tavla, roadmap & organisationer

### Pipeline
- **Egna steg.** Stegen i pipelinen är inte längre fasta – varje organisation har sina egna.
- **Byt namn** genom att dubbelklicka på kolumnrubriken (Enter sparar, Esc avbryter). Två steg kan inte heta samma sak.
- **Färg och borttagning** via ⋯-menyn på rubriken. Tar du bort ett steg som har affärer väljer du vart de ska flyttas; flytten syns i kortets historik. Det sista steget går inte att ta bort.
- **Nytt steg** läggs till med "+ Nytt steg" längst till höger.
- **Ändra ordning** genom att dra kolumnrubrikerna.
- "X stängda" i rubriken räknar affärerna i steget längst till höger.

### Team-tavla (ny sida: Tavla)
- **Miro-liknande tavlor** delade inom organisationen, i realtid. Skapa flera tavlor som flikar; dubbelklicka på en flik för att byta namn.
- **Post-it-lappar, text, rektanglar, cirklar och linjer** med färgpalett. Text kan skrivas direkt i lappar och former, med textstorlek och fetstil.
- **Panorera och zooma**, markera, flytta och ändra storlek. Markera flera med Shift/⌘-klick eller Shift-dra.
- **Ångra** med ⌘Z, och **se kollegornas muspekare** live.
- Dra en färg från paletten till tavlan för att skapa en lapp. "?" i verktygsraden öppnar en guide.

### Roadmap (ny sida)
- **Zoombar tidslinje** med milstolpar. Klicka på tidslinjen för att skapa en milstolpe på det datumet; dra för att flytta i tid eller mellan rader.
- **Koppla uppgifter** till en milstolpe. Kopplade uppgifter visar en flagga på kortet, färgad efter hur nära datumet är.

### Organisationer
- **Flera organisationer.** All data hör till en organisation; byt organisation i sidomenyn.
- **Organisationskod.** Nya användare går med i en organisation via dess kod (visas, och kan bytas, under Inställningar). Organisationen kan döpas om.
- Medlemmar listas och kan tas bort per organisation.

### Inloggning
- **Endast Google-inloggning.** E-post/lösenord är borttaget. Befintliga konton kopplas automatiskt när du loggar in med Google med samma e-postadress.

### Under huven
- Convex-schema: nya tabeller `organizations`, `memberships`, `milestones`, `boards`, `boardElements`, `boardPresence` och `stages`; `orgId` på all affärsdata; leads pekar på steg via `stageId`.
- Migreringar för organisationer och steg (`backfillOrgs`, `backfillStages`) med verifieringsfrågor.
- Backend-funktionerna täckta av tester (convex-test), 124 tester.

## 2.1.0 — 2026-06-17 · Användare, enhetliga kort & kontaktuppföljning

### Användare
- **Se och hantera användare i Inställningar.** Alla registrerade konton listas med namn och e‑post. Du kan ta bort andra konton (inte ditt eget); borttagning frigör automatiskt deras ansvar på kort.
- **Eget visningsnamn.** Sätt ditt namn under *Min profil* i Inställningar. Namnet visas som ansvarig på kort; saknas namn används e‑posten.

### Pipeline & uppgifter
- **Ansvarig är nu en användare.** Fältet "ansvarig" väljs via en dropdown med registrerade användare (i stället för fritext).
- **Enhetlig kortvy.** Leads och uppgifter öppnas i samma vy med identisk layout (översikt + logg/historik).
- **Redigera direkt i kortet.** Klicka på ett fält för att ändra det – sparas på blur/Enter, Esc avbryter. Inga separata redigeringsformulär.
- **Skapa kort direkt.** "Nytt lead"/"Ny uppgift" skapar kortet med standardvärden och öppnar det direkt för redigering.

### Kontakter
- **Inline-redigering som korten** och öppnas genom att klicka på raden (separata redigera/radera-knappar borttagna; radering finns i kontaktvyn).
- **Anteckningar.** Lägg korta anteckningar på en kontakt. Listan visar första raden + datum + författare; klicka för att se hela. En **blå prick** efter namnet i översikten markerar nya olästa anteckningar och nollställs när du öppnar kontakten.
- **Påminnelse.** Sätt en påminnelse (ansvarig + datum + kort text) på en kontakt. Den visas i kontaktöversikten med en **statusprick**: grön (mer än 2 veckor kvar), gul (fram till datumet) och röd (passerat), samt ansvarig bredvid datumet.
- **Sortering.** Sortera kontaktlistan på namn, påminnelsedatum eller senaste anteckning.

### Under huven
- Convex-schema: ny `userProfiles`-tabell, `notes`, `contactReads`; "ansvarig" migrerad från fritext till användarreferens (`agareId`).
- Backend-funktioner täckta av tester (convex-test): användarlista/-borttagning, profilnamn, anteckningar, påminnelser och oläst-status.
