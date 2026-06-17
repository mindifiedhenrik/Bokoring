# Release notes

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
