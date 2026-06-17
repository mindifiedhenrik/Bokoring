# Användare, ansvarig-referens och enhetliga inline-kort — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visa/radera registrerade användare i settings, gör "ansvarig" till en användarreferens vald via dropdown, och ersätt lead-/task-formulären med en gemensam inline-redigerbar kortvy.

**Architecture:** Ny `userProfiles`-tabell ger visningsnamn ovanpå auth-tabellen `users`. `agare` (fritext) ersätts av `agareId?: Id<"users">` på `leads` och `tasks` via widen→migrera→narrow. Frontend får en gemensam `CardDetail`-komponent (pipeline-stil) med inline-fält som ersätter `LeadDetail`, `LeadForm` och `TaskForm`. Skapande sker direkt mot databasen med standardvärden, varpå kortet öppnas i samma vy.

**Tech Stack:** Convex `^1.41.0` (`ctx.db.get/patch/insert/delete(tableName, …)`-API), `@convex-dev/auth` (Password), React 19, vanlig CSS, convex-test + Vitest.

**Viktig API-konvention:** Detta repo använder `ctx.db.get("tabell", id)`, `ctx.db.patch("tabell", id, {…})`, `ctx.db.insert("tabell", {…})`, `ctx.db.delete("tabell", id)`. Följ detta överallt — inte det äldre `ctx.db.get(id)`.

---

## Filöversikt

**Convex (backend):**
- `convex/schema.ts` — ny `userProfiles`-tabell; `leads`/`tasks`: lägg `agareId`, `agare` görs optional (widen), `by_agare`-index. Sista tasken tar bort `agare` (narrow).
- `convex/users.ts` — lägg `list` (query) och `remove` (mutation). Behåll `viewer`.
- `convex/userProfiles.ts` (ny) — `myProfile` (query), `setMyName` (mutation).
- `convex/leads.ts` — `fields`: `agare` → `agareId: v.optional(v.id("users"))`.
- `convex/tasks.ts` — `fields`: `agare` → `agareId: v.optional(v.id("users"))`.
- `convex/migrations.ts` (ny) — `dropLegacyAgare` (internalMutation) som tar bort gamla `agare`-fält.
- `convex/users.test.ts` (ny) — tester för `list`/`remove`.
- `convex/userProfiles.test.ts` (ny) — tester för `setMyName`/`myProfile`.
- `convex/leads.test.ts`, `convex/tasks.test.ts` — uppdateras: inga `agare`-args.

**Frontend:**
- `src/context/ModalContext.tsx` — ersätt `leadDetail`/`leadForm`/`taskForm` med `cardDetail` (`type` + `id`).
- `src/components/ModalHost.tsx` — rendera `CardDetail` för `cardDetail`.
- `src/components/cards/InlineField.tsx` (ny) — inline-editorer (text/textarea/number/date/select).
- `src/components/cards/CardLog.tsx` (ny) — gemensam historik-tidslinje (lead + task).
- `src/components/cards/CardDetail.tsx` (ny) — gemensam kortvy (shell + översikt).
- `src/components/kanban/PipelineView.tsx` — skapa lead inline + öppna `CardDetail`; visa ansvarig-namn.
- `src/components/kanban/LeadCard.tsx` — visa `ownerName` (prop) i stället för `lead.agare`.
- `src/components/tasks/TasksView.tsx` — skapa task inline + öppna `CardDetail`; visa ansvarig-namn.
- `src/components/tasks/TaskCard.tsx` — visa `ownerName` (prop) i stället för `task.agare`.
- `src/components/settings/SettingsModal.tsx` — sektionerna "Min profil" och "Användare".
- `src/index.css` — stilar för inline-fält och användarlista.
- **Radera:** `src/components/kanban/LeadDetail.tsx`, `src/components/kanban/LeadForm.tsx`, `src/components/tasks/TaskForm.tsx`.

---

## Task 1: Schema — widen `agare`→`agareId`, lägg `userProfiles`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Uppdatera schema**

I `convex/schema.ts`, ersätt `leads`-, `tasks`-definitionerna och lägg till `userProfiles` (behåll allt annat oförändrat):

```ts
  leads: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    contactId: v.optional(v.id("contacts")),
    sannolikhet: v.number(),
    // agare: fritext (legacy) — tas bort i en senare task efter migrering.
    agare: v.optional(v.string()),
    agareId: v.optional(v.id("users")),
    datum: v.string(),
    steg: v.string(),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_contact", ["contactId"])
    .index("by_agare", ["agareId"]),
  projects: defineTable({
    namn: v.string(),
    beskrivning: v.string(),
    color: v.string(),
    order: v.optional(v.number()),
  }),
  tasks: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    projectId: v.id("projects"),
    status: v.string(),
    agare: v.optional(v.string()),
    agareId: v.optional(v.id("users")),
    prioritet: v.string(),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.string(), v.null())),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_agare", ["agareId"]),
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
  }).index("by_user", ["userId"]),
```

- [ ] **Step 2: Verifiera att schema/typer kompilerar**

Run: `npx convex codegen`
Expected: Inga fel; `convex/_generated/dataModel.d.ts` innehåller nu `userProfiles` och `agareId`.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(convex): widen agare->agareId, add userProfiles table"
```

---

## Task 2: leads.ts & tasks.ts — `agareId` i create/update + uppdatera befintliga tester

**Files:**
- Modify: `convex/leads.ts:14-22`
- Modify: `convex/tasks.ts:14-21`
- Modify: `convex/leads.test.ts`
- Modify: `convex/tasks.test.ts`

- [ ] **Step 1: Uppdatera befintliga tester så att de slutar skicka `agare`**

I `convex/leads.test.ts`, ersätt de två `create`-anropens args (ta bort `agare: "M"`):

```ts
  const id = await u.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
```

(gäller båda testerna i filen — ersätt `agare: "M", ` på rad 12 och rad 23.)

I `convex/tasks.test.ts`, ta bort `agare: "",` ur alla fyra `tasks.create`-anrop, t.ex.:

```ts
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
```

- [ ] **Step 2: Kör testerna och se att de FAILAR (create accepterar fortfarande inte ändringen ännu / agare saknas)**

Run: `npm test -- leads tasks`
Expected: FAIL — `create` kräver fortfarande `agare` (validator mismatch), eller TS-fel.

- [ ] **Step 3: Byt `agare`→`agareId` i `leads.ts`**

I `convex/leads.ts`, ändra `fields`-objektet (rad 14-22):

```ts
const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  contactId: v.optional(v.id("contacts")),
  sannolikhet: v.number(),
  agareId: v.optional(v.id("users")),
  datum: v.string(),
  steg: v.string(),
};
```

Inga andra ändringar behövs i `leads.ts` — `create`/`update` sprider `...args`/`...patch` och rör inte längre `agare`.

- [ ] **Step 4: Byt `agare`→`agareId` i `tasks.ts`**

I `convex/tasks.ts`, ändra `fields`-objektet (rad 14-21):

```ts
const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  projectId: v.id("projects"),
  status: v.string(),
  agareId: v.optional(v.id("users")),
  prioritet: v.string(),
};
```

- [ ] **Step 5: Kör testerna och se att de PASSAR**

Run: `npm test -- leads tasks`
Expected: PASS — alla lead-/task-tester gröna.

- [ ] **Step 6: Commit**

```bash
git add convex/leads.ts convex/tasks.ts convex/leads.test.ts convex/tasks.test.ts
git commit -m "feat(convex): leads/tasks ansvarig as optional user reference"
```

---

## Task 3: `userProfiles` — `setMyName` + `myProfile`

**Files:**
- Create: `convex/userProfiles.ts`
- Create: `convex/userProfiles.test.ts`

- [ ] **Step 1: Skriv det failande testet**

Skapa `convex/userProfiles.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("setMyName upsertar och myProfile läser tillbaka namnet", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "maria@firma.se" })
  );
  const u = t.withIdentity({ subject: `${userId}|s1` });

  // Saknas profil -> tomt namn, e-post tillbaka.
  expect(await u.query(api.userProfiles.myProfile, {})).toMatchObject({
    displayName: "",
    email: "maria@firma.se",
  });

  await u.mutation(api.userProfiles.setMyName, { displayName: "  Maria Ek  " });
  expect(await u.query(api.userProfiles.myProfile, {})).toMatchObject({
    displayName: "Maria Ek",
  });

  // Andra anropet uppdaterar samma rad (ingen dubblett).
  await u.mutation(api.userProfiles.setMyName, { displayName: "Maria E" });
  const rows = await t.run(async (ctx) => ctx.db.query("userProfiles").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].displayName).toBe("Maria E");
});
```

- [ ] **Step 2: Kör testet och se att det FAILAR**

Run: `npm test -- userProfiles`
Expected: FAIL — `api.userProfiles` finns inte.

- [ ] **Step 3: Implementera `convex/userProfiles.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const me = await ctx.db.get("users", userId);
    return { displayName: profile?.displayName ?? "", email: me?.email ?? null };
  },
});

export const setMyName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, { displayName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const name = displayName.trim();
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.patch("userProfiles", existing._id, { displayName: name });
    else await ctx.db.insert("userProfiles", { userId, displayName: name });
  },
});
```

- [ ] **Step 4: Kör testet och se att det PASSAR**

Run: `npm test -- userProfiles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/userProfiles.ts convex/userProfiles.test.ts
git commit -m "feat(convex): userProfiles display name (myProfile, setMyName)"
```

---

## Task 4: `users.list` + `users.remove`

**Files:**
- Modify: `convex/users.ts`
- Create: `convex/users.test.ts`

- [ ] **Step 1: Skriv det failande testet**

Skapa `convex/users.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("users.list ger displayName från profil, annars e-post-prefix", async () => {
  const t = convexTest(schema, modules);
  const { a } = await t.run(async (ctx) => {
    const a = await ctx.db.insert("users", { email: "anna@firma.se" });
    const b = await ctx.db.insert("users", { email: "bo@firma.se" });
    await ctx.db.insert("userProfiles", { userId: a, displayName: "Anna A" });
    return { a, b };
  });
  const u = t.withIdentity({ subject: `${a}|s` });
  const list = await u.query(api.users.list, {});
  expect(list.find((x) => x.email === "anna@firma.se")!.displayName).toBe("Anna A");
  expect(list.find((x) => x.email === "bo@firma.se")!.displayName).toBe("bo");
});

test("users.remove vägrar radera sig själv", async () => {
  const t = convexTest(schema, modules);
  const me = await t.run(async (ctx) => ctx.db.insert("users", { email: "me@firma.se" }));
  const u = t.withIdentity({ subject: `${me}|s` });
  await expect(u.mutation(api.users.remove, { userId: me })).rejects.toThrow();
});

test("users.remove nollställer ansvarig på leads och tasks", async () => {
  const t = convexTest(schema, modules);
  const { me, victim, projectId } = await t.run(async (ctx) => {
    const me = await ctx.db.insert("users", { email: "me@firma.se" });
    const victim = await ctx.db.insert("users", { email: "v@firma.se" });
    const projectId = await ctx.db.insert("projects", { namn: "P", beskrivning: "", color: "#000" });
    return { me, victim, projectId };
  });
  const u = t.withIdentity({ subject: `${me}|s` });
  const leadId = await u.mutation(api.leads.create, {
    titel: "L", beskrivning: "", sannolikhet: 10, agareId: victim, datum: "2026-06-17", steg: "Lead",
  });
  const taskId = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agareId: victim, prioritet: "Normal",
  });

  await u.mutation(api.users.remove, { userId: victim });

  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === leadId)!;
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === taskId)!;
  expect(lead.agareId).toBeUndefined();
  expect(task.agareId).toBeUndefined();
  const remaining = await t.run(async (ctx) => ctx.db.get("users", victim));
  expect(remaining).toBeNull();
});
```

- [ ] **Step 2: Kör testet och se att det FAILAR**

Run: `npm test -- users`
Expected: FAIL — `api.users.list`/`api.users.remove` finns inte.

- [ ] **Step 3: Implementera `list` och `remove` i `convex/users.ts`**

Ersätt hela `convex/users.ts` med (behåll `viewer`):

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    return user ? { email: user.email ?? null } : null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) throw new Error("Inte inloggad");
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("userProfiles").collect();
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    return users.map((u) => ({
      _id: u._id,
      email: u.email ?? null,
      displayName:
        nameById.get(u._id) || (u.email ? u.email.split("@")[0] : "Användare"),
      isSelf: u._id === me,
    }));
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await getAuthUserId(ctx);
    if (!me) throw new Error("Inte inloggad");
    if (me === userId) throw new Error("Du kan inte radera ditt eget konto");

    // Nollställ ansvarig på alla kort som pekar på användaren.
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const l of leads) await ctx.db.patch("leads", l._id, { agareId: undefined });
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const t of tasks) await ctx.db.patch("tasks", t._id, { agareId: undefined });

    // Radera auth-rader: konton (+ verifikationskoder), sessioner (+ refresh-tokens).
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const acc of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", acc._id))
        .collect();
      for (const c of codes) await ctx.db.delete("authVerificationCodes", c._id);
      await ctx.db.delete("authAccounts", acc._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
        .collect();
      for (const tok of tokens) await ctx.db.delete("authRefreshTokens", tok._id);
      await ctx.db.delete("authSessions", s._id);
    }

    // Radera profil + själva användaren.
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profile) await ctx.db.delete("userProfiles", profile._id);
    await ctx.db.delete("users", userId);
  },
});
```

- [ ] **Step 4: Kör testet och se att det PASSAR**

Run: `npm test -- users`
Expected: PASS — alla tre tester gröna.

- [ ] **Step 5: Commit**

```bash
git add convex/users.ts convex/users.test.ts
git commit -m "feat(convex): users.list and users.remove (unassign cards + purge auth rows)"
```

---

## Task 5: Migrering — ta bort legacy `agare`-fältet

**Files:**
- Create: `convex/migrations.ts`

- [ ] **Step 1: Implementera migrerings-mutation**

Skapa `convex/migrations.ts`:

```ts
import { internalMutation } from "./_generated/server";

// Engångsmigrering: ta bort legacy fritextfältet `agare` från alla leads/tasks
// så att den smalnade schemadefinitionen (utan `agare`) validerar mot befintliga
// dokument. Ansvarig hanteras hädanefter via `agareId`.
export const dropLegacyAgare = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0;
    for (const l of await ctx.db.query("leads").collect()) {
      if ("agare" in l) {
        await ctx.db.patch("leads", l._id, { agare: undefined });
        cleared++;
      }
    }
    for (const t of await ctx.db.query("tasks").collect()) {
      if ("agare" in t) {
        await ctx.db.patch("tasks", t._id, { agare: undefined });
        cleared++;
      }
    }
    return { cleared };
  },
});
```

- [ ] **Step 2: Verifiera kompilering**

Run: `npx convex codegen`
Expected: Inga fel; `internal.migrations.dropLegacyAgare` finns i `_generated/api`.

- [ ] **Step 3: Kör migreringen mot dev-deployment (har befintlig data)**

Run: `npx convex run migrations:dropLegacyAgare`
Expected: Returnerar `{ cleared: <antal> }` utan fel. (På en helt tom databas blir `cleared` 0 — det är OK.)

- [ ] **Step 4: Commit**

```bash
git add convex/migrations.ts convex/_generated
git commit -m "chore(convex): migration to drop legacy agare field"
```

---

## Task 6: Narrow schema — ta bort `agare` helt

**Files:**
- Modify: `convex/schema.ts`

> **Förutsättning:** Task 5:s migrering måste ha körts mot varje deployment som har data, annars misslyckas schema-pushen.

- [ ] **Step 1: Ta bort `agare` ur `leads` och `tasks`**

I `convex/schema.ts`, ta bort raden `agare: v.optional(v.string()),` från både `leads` och `tasks`. Behåll `agareId` och `by_agare`-index.

- [ ] **Step 2: Verifiera att hela testsviten fortfarande passerar**

Run: `npm test`
Expected: PASS — alla convex-tester gröna (testdatabasen har inga `agare`-fält).

- [ ] **Step 3: Verifiera schema-push mot dev**

Run: `npx convex dev --once`
Expected: Schema deployas utan valideringsfel.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat(convex): narrow schema, remove legacy agare field"
```

---

## Task 7: ModalContext + ModalHost — gemensam `cardDetail`

**Files:**
- Modify: `src/context/ModalContext.tsx`
- Modify: `src/components/ModalHost.tsx`

- [ ] **Step 1: Uppdatera `ModalContext`**

Ersätt `src/context/ModalContext.tsx` med (byt ut lead/task-form/detail mot `cardDetail`):

```tsx
import { createContext, useContext, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export type CardType = "lead" | "task";

type ModalState =
  | { kind: "cardDetail"; type: "lead"; id: Id<"leads"> }
  | { kind: "cardDetail"; type: "task"; id: Id<"tasks"> }
  | { kind: "contactDetail"; id: Id<"contacts"> }
  | { kind: "contactForm"; id?: Id<"contacts"> }
  | { kind: "projectForm"; id?: Id<"projects"> }
  | { kind: "settings" }
  | null;

type Api = {
  state: ModalState;
  openLeadDetail: (id: Id<"leads">) => void;
  openTaskDetail: (id: Id<"tasks">) => void;
  openContactDetail: (id: Id<"contacts">) => void;
  openContactForm: (id?: Id<"contacts">) => void;
  openProjectForm: (id?: Id<"projects">) => void;
  openSettings: () => void;
  close: () => void;
};

const Ctx = createContext<Api>(null as unknown as Api);
export const useModal = () => useContext(Ctx);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ModalState>(null);
  const api: Api = {
    state,
    openLeadDetail: (id) => setState({ kind: "cardDetail", type: "lead", id }),
    openTaskDetail: (id) => setState({ kind: "cardDetail", type: "task", id }),
    openContactDetail: (id) => setState({ kind: "contactDetail", id }),
    openContactForm: (id) => setState({ kind: "contactForm", id }),
    openProjectForm: (id) => setState({ kind: "projectForm", id }),
    openSettings: () => setState({ kind: "settings" }),
    close: () => setState(null),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Uppdatera `ModalHost`**

Ersätt `src/components/ModalHost.tsx` med:

```tsx
import { useModal } from "../context/ModalContext";
import CardDetail from "./cards/CardDetail";
import ContactDetail from "./contacts/ContactDetail";
import ContactForm from "./contacts/ContactForm";
import ProjectForm from "./tasks/ProjectForm";
import SettingsModal from "./settings/SettingsModal";

export default function ModalHost() {
  const m = useModal();
  switch (m.state?.kind) {
    case "cardDetail":
      return m.state.type === "lead" ? (
        <CardDetail type="lead" id={m.state.id} />
      ) : (
        <CardDetail type="task" id={m.state.id} />
      );
    case "contactDetail": return <ContactDetail id={m.state.id} />;
    case "contactForm": return <ContactForm id={m.state.id} />;
    case "projectForm": return <ProjectForm id={m.state.id} />;
    case "settings": return <SettingsModal />;
    default: return null;
  }
}
```

> Detta bryter tillfälligt kompileringen tills `CardDetail` och de uppdaterade view-filerna finns (Task 8-10). Det är förväntat — vi commitar inte förrän Task 10.

- [ ] **Step 3: (ingen commit ännu — fortsätt till Task 8)**

---

## Task 8: Inline-fält och historik-komponenter

**Files:**
- Create: `src/components/cards/InlineField.tsx`
- Create: `src/components/cards/CardLog.tsx`

- [ ] **Step 1: Skapa `InlineField.tsx`**

Klick på värdet → kontroll visas; sparar på blur och Enter (Esc avbryter). Textarea sparar på blur (Enter = ny rad).

```tsx
import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type Base = { label: string; className?: string };
type Props =
  | (Base & { type: "text"; value: string; placeholder?: string; onSave: (v: string) => void })
  | (Base & { type: "textarea"; value: string; placeholder?: string; onSave: (v: string) => void })
  | (Base & { type: "number"; value: number; min?: number; max?: number; step?: number; suffix?: string; onSave: (v: number) => void })
  | (Base & { type: "date"; value: string; display: string; onSave: (v: string) => void })
  | (Base & { type: "select"; value: string; options: Option[]; render?: (v: string) => React.ReactNode; onSave: (v: string) => void });

export default function InlineField(props: Props) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLInputElement || ref.current instanceof HTMLTextAreaElement) {
        ref.current.select?.();
      }
    }
  }, [editing]);

  const stop = () => setEditing(false);

  function commitText(raw: string) {
    if (props.type === "number") {
      const n = Number(raw);
      props.onSave(isNaN(n) ? 0 : n);
    } else if (props.type === "text" || props.type === "textarea") {
      props.onSave(raw);
    } else {
      props.onSave(raw);
    }
    stop();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); stop(); }
    if (e.key === "Enter" && props.type !== "textarea") {
      e.preventDefault();
      (e.currentTarget as HTMLInputElement | HTMLSelectElement).blur();
    }
  }

  const labelEl = <div className="k">{props.label}</div>;

  if (!editing) {
    let shown: React.ReactNode;
    if (props.type === "number") shown = <>{props.value}{props.suffix ?? ""}</>;
    else if (props.type === "date") shown = props.display || "—";
    else if (props.type === "select") {
      const opt = props.options.find((o) => o.value === props.value);
      shown = props.render ? props.render(props.value) : (opt?.label ?? "—");
    } else shown = props.value?.trim() ? props.value : <span className="muted">Klicka för att lägga till…</span>;
    return (
      <div className={"info-item inline" + (props.className ? " " + props.className : "")}>
        {labelEl}
        <div className="v inline-v" tabIndex={0} role="button"
          onClick={() => setEditing(true)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}>
          {shown}
        </div>
      </div>
    );
  }

  return (
    <div className={"info-item inline editing" + (props.className ? " " + props.className : "")}>
      {labelEl}
      <div className="v">
        {props.type === "textarea" ? (
          <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} defaultValue={props.value}
            placeholder={props.placeholder} onBlur={(e) => commitText(e.target.value)} onKeyDown={onKeyDown} />
        ) : props.type === "select" ? (
          <select ref={ref as React.RefObject<HTMLSelectElement>} defaultValue={props.value}
            onBlur={(e) => commitText(e.target.value)} onChange={(e) => commitText(e.target.value)} onKeyDown={onKeyDown}>
            {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input ref={ref as React.RefObject<HTMLInputElement>}
            type={props.type === "number" ? "number" : props.type === "date" ? "date" : "text"}
            defaultValue={props.type === "date" ? props.value : String(props.value)}
            placeholder={props.type === "text" ? props.placeholder : undefined}
            min={props.type === "number" ? props.min : undefined}
            max={props.type === "number" ? props.max : undefined}
            step={props.type === "number" ? props.step : undefined}
            onBlur={(e) => commitText(e.target.value)} onKeyDown={onKeyDown} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Skapa `CardLog.tsx`**

Gemensam tidslinje. Lead-loggen färgar stegbadges via `STAGE_VAR`; task-loggen visar pills + projekt-/arkivposter.

```tsx
import { STAGE_VAR } from "../../lib/constants";
import { fmtTimestamp } from "../../lib/format";
import type { Doc } from "../../../convex/_generated/dataModel";

type LogEntry = Doc<"leads">["log"][number];

export default function CardLog({ type, log }: { type: "lead" | "task"; log: LogEntry[] }) {
  const sorted = [...log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  if (sorted.length === 0) return <div className="muted">Ingen historik ännu.</div>;

  const stageBadge = (s: string | null | undefined) =>
    type === "lead"
      ? <span className="stage-badge" style={{ background: s ? STAGE_VAR[s] : undefined }}>{s}</span>
      : <span className="pill">{s}</span>;

  return (
    <div className="log">
      {sorted.map((e, i) => {
        const isFirst = e.from === null || e.from === undefined;
        return (
          <div key={i} className={"log-item" + (isFirst && e.fromProject === undefined && !e.restored && !e.archived ? " first" : "")}>
            <span className="node" />
            <div className="when">{fmtTimestamp(e.ts)}</div>
            <div className="what">
              {e.restored ? <span>Återställd från arkiv</span>
                : e.archived ? <span>Arkiverad från Done</span>
                : e.fromProject !== undefined ? <><span>Projektbyte:</span> <span className="pill">{e.fromProject}</span> <span className="arrow">→</span> <span className="pill">{e.toProject}</span></>
                : isFirst ? <><span>{type === "lead" ? "Skapat i" : "Skapad i"}</span> {stageBadge(e.to)}</>
                : <>{stageBadge(e.from)} <span className="arrow">→</span> {stageBadge(e.to)}</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verifiera typkompilering**

Run: `npx tsc --noEmit`
Expected: Inga fel i `InlineField.tsx`/`CardLog.tsx` (övriga fel från Task 7 kvarstår tills Task 9-10 — fokusera på dessa två filer).

- [ ] **Step 4: (ingen commit ännu)**

---

## Task 9: `CardDetail` — gemensam inline-kortvy

**Files:**
- Create: `src/components/cards/CardDetail.tsx`

- [ ] **Step 1: Implementera `CardDetail.tsx`**

En komponent, två fältuppsättningar, identisk layout/interaktion. Inline-sparning bygger full `update`-payload från aktuellt dokument och överskriver det ändrade fältet.

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES, STAGE_VAR, TASK_STATUSES, PRIORITIES } from "../../lib/constants";
import { initials, fmtDate } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";
import InlineField from "./InlineField";
import CardLog from "./CardLog";

type Props = { type: "lead"; id: Id<"leads"> } | { type: "task"; id: Id<"tasks"> };

const NONE = "__none__";

export default function CardDetail(props: Props) {
  const { type } = props;
  const leads = useQuery(api.leads.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const updateLead = useMutation(api.leads.update);
  const updateTask = useMutation(api.tasks.update);
  const removeLead = useMutation(api.leads.remove);
  const removeTask = useMutation(api.tasks.remove);
  const modal = useModal();
  const toast = useToast();
  const [tab, setTab] = useState<"info" | "log">("info");

  const lead = type === "lead" ? leads.find((l) => l._id === props.id) : undefined;
  const task = type === "task" ? tasks.find((t) => t._id === props.id) : undefined;
  const doc = lead ?? task;
  if (!doc) return null;

  const userOptions = [
    { value: NONE, label: "Ingen" },
    ...users.map((u) => ({ value: u._id as string, label: u.displayName })),
  ];
  const ownerName = (id?: string) => users.find((u) => u._id === id)?.displayName ?? "—";

  async function saveLead(patch: Partial<{ titel: string; beskrivning: string; contactId?: Id<"contacts">; sannolikhet: number; agareId?: Id<"users">; datum: string; steg: string }>) {
    if (!lead) return;
    await updateLead({
      id: lead._id,
      titel: lead.titel, beskrivning: lead.beskrivning, contactId: lead.contactId,
      sannolikhet: lead.sannolikhet, agareId: lead.agareId, datum: lead.datum, steg: lead.steg,
      ...patch,
    });
  }
  async function saveTask(patch: Partial<{ titel: string; beskrivning: string; projectId: Id<"projects">; status: string; agareId?: Id<"users">; prioritet: string }>) {
    if (!task) return;
    await updateTask({
      id: task._id,
      titel: task.titel, beskrivning: task.beskrivning, projectId: task.projectId,
      status: task.status, agareId: task.agareId, prioritet: task.prioritet,
      ...patch,
    });
  }
  const idToUser = (v: string) => (v === NONE ? undefined : (v as Id<"users">));

  async function handleDelete() {
    if (!confirm(`Ta bort "${doc!.titel}"? Detta går inte att ångra.`)) return;
    if (lead) await removeLead({ id: lead._id });
    else if (task) await removeTask({ id: task._id });
    modal.close();
    toast(type === "lead" ? "Lead borttaget" : "Uppgift borttagen");
  }

  const headColor = lead ? STAGE_VAR[lead.steg]
    : projects.find((p) => p._id === task!.projectId)?.color ?? "var(--line)";
  const headTag = lead ? lead.steg : task!.status;

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <span className="stage-tag" style={{ background: headColor }}>{headTag}</span>
        <h2 style={{ flex: 1, minWidth: 0 }}>
          <InlineField type="text" label="" className="title-inline" value={doc.titel}
            onSave={(v) => (lead ? saveLead({ titel: v.trim() || doc.titel }) : saveTask({ titel: v.trim() || doc.titel }))} />
        </h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="det-tabs">
          <button className={"det-tab" + (tab === "info" ? " active" : "")} onClick={() => setTab("info")}>Översikt</button>
          <button className={"det-tab" + (tab === "log" ? " active" : "")} onClick={() => setTab("log")}>
            {lead ? "Stegslogg" : "Historik"} ({doc.log.length})
          </button>
        </div>

        {tab === "info" && (
          <div className="tab-pane active">
            <div className="info-grid">
              {lead && (
                <>
                  <div className="info-item full">
                    <div className="k">Kundkontakt</div>
                    <div className="v">
                      <InlineField type="select" label="" value={lead.contactId ?? NONE}
                        options={[{ value: NONE, label: "Ingen kontakt" }, ...contacts.map((c) => ({ value: c._id as string, label: c.namn + (c.foretag ? " · " + c.foretag : "") }))]}
                        render={(v) => {
                          const c = contacts.find((x) => x._id === v);
                          return c ? (
                            <span className="contact-chip" onClick={(e) => { e.stopPropagation(); modal.openContactDetail(c._id); }}>
                              <span className="avatar">{initials(c.namn)}</span>
                              <span style={{ fontWeight: 600 }}>{c.namn}</span>
                            </span>
                          ) : <span className="muted">Ingen kontakt kopplad</span>;
                        }}
                        onSave={(v) => saveLead({ contactId: v === NONE ? undefined : (v as Id<"contacts">) })} />
                    </div>
                  </div>
                  <InlineField type="number" label="Sannolikhet" value={lead.sannolikhet} min={0} max={100} step={5} suffix="%"
                    onSave={(v) => saveLead({ sannolikhet: Math.max(0, Math.min(100, v)) })} />
                  <InlineField type="select" label="Ansvarig" value={lead.agareId ?? NONE} options={userOptions}
                    render={(v) => ownerName(v === NONE ? undefined : v)}
                    onSave={(v) => saveLead({ agareId: idToUser(v) })} />
                  <InlineField type="date" label="Datum" value={lead.datum} display={fmtDate(lead.datum)}
                    onSave={(v) => saveLead({ datum: v })} />
                  <InlineField type="select" label="Steg" value={lead.steg} options={STAGES.map((s) => ({ value: s, label: s }))}
                    render={(v) => <span className="stage-badge" style={{ background: STAGE_VAR[v] }}>{v}</span>}
                    onSave={(v) => saveLead({ steg: v })} />
                  <InlineField type="textarea" label="Beskrivning" className="full" value={lead.beskrivning}
                    placeholder="Bakgrund, behov, nästa steg…" onSave={(v) => saveLead({ beskrivning: v })} />
                </>
              )}
              {task && (
                <>
                  <InlineField type="select" label="Projekt" value={task.projectId} options={projects.map((p) => ({ value: p._id as string, label: p.namn }))}
                    onSave={(v) => saveTask({ projectId: v as Id<"projects"> })} />
                  <InlineField type="select" label="Status" value={task.status} options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
                    onSave={(v) => saveTask({ status: v })} />
                  <InlineField type="select" label="Ansvarig" value={task.agareId ?? NONE} options={userOptions}
                    render={(v) => ownerName(v === NONE ? undefined : v)}
                    onSave={(v) => saveTask({ agareId: idToUser(v) })} />
                  <InlineField type="select" label="Prioritet" value={task.prioritet} options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                    render={(v) => <span className={"prio " + (v === "Hög" ? "high" : v === "Låg" ? "low" : "normal")}>{v}</span>}
                    onSave={(v) => saveTask({ prioritet: v })} />
                  <InlineField type="textarea" label="Beskrivning" className="full" value={task.beskrivning}
                    placeholder="Detaljer, definition of done…" onSave={(v) => saveTask({ beskrivning: v })} />
                </>
              )}
            </div>
          </div>
        )}

        {tab === "log" && <div className="tab-pane active"><CardLog type={type} log={doc.log} /></div>}
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={handleDelete}>Ta bort</button>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: (ingen commit ännu — fortsätt till Task 10)**

---

## Task 10: Views + cards — skapa inline, öppna `CardDetail`, visa ansvarig-namn

**Files:**
- Modify: `src/components/kanban/PipelineView.tsx`
- Modify: `src/components/kanban/LeadCard.tsx`
- Modify: `src/components/tasks/TasksView.tsx`
- Modify: `src/components/tasks/TaskCard.tsx`
- Delete: `src/components/kanban/LeadDetail.tsx`, `src/components/kanban/LeadForm.tsx`, `src/components/tasks/TaskForm.tsx`

- [ ] **Step 1: `LeadCard` — visa ownerName via prop**

I `src/components/kanban/LeadCard.tsx`: lägg till `ownerName: string` i `LeadCardProps` och i destrukturen, och ersätt raden `{lead.agare || "—"}` (rad 46) med `{ownerName}`.

```tsx
interface LeadCardProps {
  lead: Doc<"leads">;
  contactName: string;
  ownerName: string;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
}
```
```tsx
export default function LeadCard({ lead, contactName, ownerName, onClick, onDragStart, onDragEnd, onDragOver }: LeadCardProps) {
```
```tsx
          {ownerName}
```

- [ ] **Step 2: `PipelineView` — users-map, skapa inline, öppna CardDetail**

I `src/components/kanban/PipelineView.tsx`:

Lägg till query + create efter befintliga hooks (rad 12-17):
```tsx
  const users = useQuery(api.users.list) ?? [];
  const create = useMutation(api.leads.create);
```
Lägg en hjälpare i komponentkroppen (före `return`):
```tsx
  const ownerName = (id?: string) =>
    users.find((u) => u._id === id)?.displayName ?? "—";

  async function createLead(stage: string) {
    const today = new Date().toISOString().slice(0, 10);
    const id = await create({ titel: "Namnlöst lead", beskrivning: "", sannolikhet: 25, datum: today, steg: stage });
    modal.openLeadDetail(id);
  }
```
Ändra topbar-knappen "Nytt lead" (rad 60) `onClick={() => modal.openLeadForm()}` → `onClick={() => createLead("Lead")}`.
Ändra kort-renderingen (rad 103-108): lägg `ownerName={ownerName(lead.agareId)}` och behåll `onClick={() => modal.openLeadDetail(lead._id)}`:
```tsx
                          <LeadCard
                            lead={lead}
                            contactName={contactName}
                            ownerName={ownerName(lead.agareId)}
                            onClick={() => modal.openLeadDetail(lead._id)}
                            onDragStart={() => setDragId(lead._id)}
                            onDragEnd={clearDrag}
                            onDragOver={(e) => { /* oförändrad */
                              e.preventDefault(); e.stopPropagation();
                              if (!dragId) return;
                              const r = e.currentTarget.getBoundingClientRect();
                              const before = e.clientY < r.top + r.height / 2;
                              setOverStage(stage);
                              setDropHint({ key: stage, id: lead._id, before });
                            }}
                          />
```
Ändra kolumnens "Lägg till"-knapp (rad 128) `onClick={() => modal.openLeadForm(undefined, stage)}` → `onClick={() => createLead(stage)}`.

- [ ] **Step 3: `TaskCard` — visa ownerName via prop**

I `src/components/tasks/TaskCard.tsx`: lägg `ownerName: string` i `TaskCardProps` och destrukturen, och ersätt rad 41 `{task.agare ? <span className="task-owner">{task.agare}</span> : null}` med:
```tsx
        {ownerName !== "—" ? <span className="task-owner">{ownerName}</span> : null}
```

- [ ] **Step 4: `TasksView` — users-map, skapa inline, öppna CardDetail**

I `src/components/tasks/TasksView.tsx`:

Lägg till efter befintliga hooks (rad 13-21):
```tsx
  const users = useQuery(api.users.list) ?? [];
  const create = useMutation(api.tasks.create);
```
Hjälpare före `return`:
```tsx
  const ownerName = (id?: string) =>
    users.find((u) => u._id === id)?.displayName ?? "—";

  async function createTask(projectId: Id<"projects">, status: string) {
    const id = await create({ titel: "Namnlös uppgift", beskrivning: "", projectId, status, prioritet: "Normal" });
    modal.openTaskDetail(id);
  }
```
Topbar "Ny uppgift" (rad 126) `onClick={() => modal.openTaskForm()}` → 
```tsx
          onClick={() => { const p = projects[0]; if (p) createTask(p._id, "Backlog"); else modal.openProjectForm(); }}
```
Kort-renderingen (rad 251-255): lägg `ownerName` och byt onClick:
```tsx
                                  <TaskCard
                                    task={item}
                                    projectColor={p.color}
                                    archiveDays={archiveDays}
                                    ownerName={ownerName(item.agareId)}
                                    onClick={() => modal.openTaskDetail(item._id)}
                                    onDragStart={() => setDragId(item._id)}
                                    onDragEnd={clearDrag}
                                    onDragOver={(e) => { /* oförändrad */
                                      e.preventDefault(); e.stopPropagation();
                                      if (!dragId) return;
                                      const r = e.currentTarget.getBoundingClientRect();
                                      const before = e.clientY < r.top + r.height / 2;
                                      setOverKey(key);
                                      setDropHint({ key, id: item._id, before });
                                    }}
                                  />
```
Cell-add-knappen (rad 282) `onClick={() => modal.openTaskForm(undefined, p._id, s)}` → `onClick={() => createTask(p._id, s)}`.

- [ ] **Step 5: Radera de gamla form-/detail-filerna**

```bash
git rm src/components/kanban/LeadDetail.tsx src/components/kanban/LeadForm.tsx src/components/tasks/TaskForm.tsx
```

- [ ] **Step 6: Verifiera typkompilering över hela frontend**

Run: `npx tsc --noEmit`
Expected: Inga fel. (Om kvarvarande referenser till `openLeadForm`/`openTaskForm`/`LeadDetail` finns — sök och åtgärda: `grep -rn "openLeadForm\|openTaskForm\|LeadDetail\|LeadForm\|TaskForm" src`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): unified inline CardDetail for leads/tasks, inline create, user owner names"
```

---

## Task 11: SettingsModal — Min profil + Användare

**Files:**
- Modify: `src/components/settings/SettingsModal.tsx`

- [ ] **Step 1: Lägg till queries/mutations och profil-state i `SettingsBody`**

I `src/components/settings/SettingsModal.tsx`, lägg till i `SettingsBody` (efter rad 26 `const restore = ...`):

```tsx
  const myProfile = useQuery(api.userProfiles.myProfile);
  const users = useQuery(api.users.list) ?? [];
  const setMyName = useMutation(api.userProfiles.setMyName);
  const removeUser = useMutation(api.users.remove);
  const [name, setName] = useState("");
  const [nameInit, setNameInit] = useState(false);
```
Lägg en effekt för att förifylla namnet när profilen laddats (kräver `useEffect`-import — uppdatera importen på rad 1 till `import { useState, useEffect } from "react";`):
```tsx
  useEffect(() => {
    if (myProfile && !nameInit) { setName(myProfile.displayName); setNameInit(true); }
  }, [myProfile, nameInit]);
```

- [ ] **Step 2: Rendera "Min profil"-sektionen**

Lägg in direkt efter `<div className="modal-body">` (före "Registreringskod"-sektionen, rad 60):

```tsx
        <div className="section-label">Min profil</div>
        <div className="field">
          <label>Visningsnamn</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="text" value={name} placeholder={myProfile?.email ?? "Ditt namn"}
              onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={async () => { await setMyName({ displayName: name }); toast("Namn sparat"); }}>
              Spara namn
            </button>
          </div>
          <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
            Namnet visas som ansvarig på kort. Lämnas det tomt används din e-post.
          </div>
        </div>
```

- [ ] **Step 3: Rendera "Användare"-sektionen**

Lägg in efter "Registreringskod"-fältet (efter dess avslutande `</div>`, före "Högar", rad ~99):

```tsx
        <div className="section-label" style={{ marginTop: "14px" }}>Användare ({users.length})</div>
        <div className="arch-list">
          {users.map((u) => (
            <div key={u._id} className="arch-item">
              <span className="avatar">{(u.displayName[0] ?? "?").toUpperCase()}</span>
              <div className="ai-body">
                <div style={{ fontWeight: 600, fontSize: "13.5px" }}>
                  {u.displayName}{u.isSelf ? " (du)" : ""}
                </div>
                <div className="muted" style={{ fontSize: "12px" }}>{u.email ?? "—"}</div>
              </div>
              {!u.isSelf && (
                <button className="btn btn-ghost" onClick={async () => {
                  if (!confirm(`Ta bort användaren "${u.displayName}"? Kort där hen är ansvarig blir utan ansvarig.`)) return;
                  await removeUser({ userId: u._id });
                  toast("Användare borttagen");
                }}>
                  Ta bort
                </button>
              )}
            </div>
          ))}
        </div>
```

- [ ] **Step 4: Verifiera typkompilering**

Run: `npx tsc --noEmit`
Expected: Inga fel.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsModal.tsx
git commit -m "feat(web): settings profile name + user list with delete"
```

---

## Task 12: CSS — inline-fält och avatar i listor

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Lägg till stilar i slutet av `src/index.css`**

```css
/* Inline-redigerbara kortfält */
.info-item.inline .inline-v {
  cursor: text;
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  margin: -4px -6px;
  transition: background 0.12s ease;
  min-height: 1.4em;
}
.info-item.inline .inline-v:hover { background: rgba(0, 0, 0, 0.04); }
.info-item.inline .inline-v:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.info-item.inline.editing input,
.info-item.inline.editing select,
.info-item.inline.editing textarea { width: 100%; }
.info-item.inline.editing textarea { min-height: 72px; resize: vertical; }
.title-inline .inline-v { font-size: inherit; font-weight: inherit; padding: 2px 6px; }
.title-inline.editing input { font-size: 1rem; font-weight: 600; }
/* Avatar i settings-listor */
.arch-item > .avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 12px; font-weight: 600; flex: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "style(web): inline card fields and settings avatars"
```

---

## Task 13: Manuell verifiering i preview

**Files:** (ingen)

- [ ] **Step 1: Starta dev-servern**

Använd preview-verktygen: `preview_start` (kör Vite). Säkerställ att även `npx convex dev` körs i bakgrunden så backend är live.

- [ ] **Step 2: Verifiera pipeline-flödet**

1. Logga in. Öppna Pipeline → klicka "Nytt lead" → ett kort "Namnlöst lead" skapas och `CardDetail` öppnas.
2. Klicka på titeln → redigera → Enter sparar.
3. Klicka "Ansvarig" → dropdown med användare + "Ingen" → välj en användare → stäng → öppna igen och bekräfta att valet sparats. Kortet i kolumnen visar ansvarig-namnet.
4. Byt steg via dropdown → öppna "Stegslogg" och bekräfta ny logg-post.
Använd `preview_console_logs` för att se att inga fel uppstår, och `preview_snapshot` för att bekräfta innehåll.

- [ ] **Step 3: Verifiera task-flödet och enhetlighet**

1. Öppna Uppgifter → "Ny uppgift" (eller cell-"Uppgift") → kort skapas och `CardDetail` öppnas med **samma layout** som lead-vyn (flikar, fältrader).
2. Redigera projekt/status/ansvarig/prioritet/beskrivning inline.
3. Bekräfta att lead- och task-vyn ser enhetliga ut (jämför `preview_screenshot` av båda).

- [ ] **Step 4: Verifiera settings**

1. Öppna Inställningar → "Min profil": skriv namn, "Spara namn". Öppna ett kort → ansvarig-dropdown visar det nya namnet.
2. "Användare": listan visar alla konton; egen rad har "(du)" och ingen Ta bort-knapp.
3. Skapa ett andra testkonto (registreringskod), sätt det som ansvarig på ett kort, radera kontot i settings, bekräfta att kortets ansvarig blev "—".

- [ ] **Step 5: Slutkontroll**

Run: `npm test && npx tsc --noEmit`
Expected: Alla tester PASS, inga typfel.

- [ ] **Step 6: Dela screenshot/bevis med användaren** (lead-vy + task-vy sida vid sida, samt settings).

---

## Self-review-anteckningar

- **Spec-täckning:** (1) se/radera användare → Task 4 + 11; (2) ansvarig som användardropdown → Task 1-4 + 9; (3) enhetlig kortvy → Task 7-10; (4) inline-redigering → Task 8-9. Migrering/borttagning av `agare` → Task 5-6.
- **Namnkonsekvens:** `openLeadDetail`/`openTaskDetail` (ModalContext) används i PipelineView/TasksView/ModalHost. `agareId` används konsekvent i schema, mutationer, tester och frontend. `users.list` returnerar `{ _id, email, displayName, isSelf }` och konsumeras i CardDetail + SettingsModal.
- **Ordning:** Task 6 (narrow) förutsätter att Task 5:s migrering körts mot deployment med data. Task 7-9 lämnar koden tillfälligt icke-kompilerande; första frontend-commit sker i Task 10.
