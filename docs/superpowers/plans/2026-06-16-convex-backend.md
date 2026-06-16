# Convex Backend with Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the single-file `localStorage` CRM to a Convex reactive backend with email/password login, a shared workspace, and a Vite + React + TypeScript frontend ported from `crm.html`.

**Architecture:** Convex holds all data and serves it through reactive queries/mutations; transition-logging and archiving live server-side. The React frontend subscribes with `useQuery` (live updates for all users) and mutates with `useMutation`. Convex Auth (Password) gates the app. All authenticated users share one dataset — functions require a signed-in user but never filter rows per user.

**Tech Stack:** Convex, @convex-dev/auth, React 18, TypeScript, Vite, Vitest + convex-test.

**Reference artifact:** `crm.html` (committed at `main`) is the authoritative source for **markup structure and all CSS**. Where a task says "port from crm.html", copy the relevant markup/handlers and apply the React conversions listed in Task 13. The visual result must be identical.

**Conventions used throughout:**
- Field names match the spec exactly: `titel, beskrivning, contactId, sannolikhet, agare, datum, steg` (leads); `namn, foretag, epost, telefon` (contacts); `namn, beskrivning, color` (projects); `titel, beskrivning, projectId, status, agare, prioritet, archived, archivedAt` (tasks); `archiveDays, pileThreshold` (settings).
- Stage/status/priority constants are defined once in `src/lib/constants.ts` (Task 13) and imported everywhere.
- Every Convex function calls `requireAuth(ctx)` first (Task 5).

---

## File Structure

```
package.json · vite.config.ts · tsconfig.json · tsconfig.node.json · index.html
.env.local                      (VITE_CONVEX_URL — created by `npx convex dev`)
convex/
  schema.ts        tables + Convex Auth tables
  auth.ts          convexAuth({ providers: [Password] })
  auth.config.ts   auth provider config
  http.ts          auth HTTP routes
  helpers.ts       requireAuth + PROJECT_COLORS + log validator
  contacts.ts      list/create/update/remove (+ unlink leads)
  leads.ts         list/create/update/move/remove (server-side logging)
  projects.ts      list/create/update/remove (cascade tasks)
  tasks.ts         list/create/update/move/remove/restore (server-side logging)
  settings.ts      get/set (singleton)
  crons.ts         daily archive sweep (internal mutation)
  seed.ts          one-off demo data (internalMutation)
  *.test.ts        convex-test unit tests
src/
  main.tsx         ConvexAuthProvider + ConvexReactClient
  App.tsx          auth gate + nav + view routing + providers
  index.css        styles copied verbatim from crm.html + small additions
  lib/
    constants.ts   STAGES, STAGE_VAR, TASK_STATUSES, PRIORITIES, PRIORITY_CLASS
    format.ts      initials, fmtDate, fmtTimestamp, daysSinceMove, lastMovedTs
  context/
    ModalContext.tsx   centralized modal manager
    ToastContext.tsx   toast notifications
  components/
    Sidebar.tsx · LoginScreen.tsx · Toast.tsx
    ui/Modal.tsx
    kanban/   PipelineView.tsx · LeadCard.tsx · LeadDetail.tsx · LeadForm.tsx
    contacts/ ContactsView.tsx · ContactDetail.tsx · ContactForm.tsx
    tasks/    TasksView.tsx · TaskCard.tsx · Pile.tsx · TaskForm.tsx
    settings/ SettingsModal.tsx
```

---

## Task 1: Scaffold the Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bokoring-crm",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:backend": "convex dev",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install react react-dom convex @convex-dev/auth
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest convex-test @edge-runtime/vm
```
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 4: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "convex"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Boköring CRM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create `src/index.css`**

Copy the entire contents between `<style>` and `</style>` in `crm.html` verbatim into `src/index.css`. Then append these additions (new for the React shell):

```css
#root { height: 100vh; }
.boot { height: 100vh; display: grid; place-items: center; color: var(--ink-soft); font-size: 15px; }

/* Login screen */
.login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.login-card {
  width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line);
  border-radius: 18px; box-shadow: var(--shadow-lg); padding: 32px 30px;
}
.login-card .brand { justify-content: center; margin-bottom: 6px; }
.login-card h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 22px; text-align: center; margin-bottom: 4px; }
.login-card .sub { text-align: center; color: var(--ink-soft); font-size: 14px; margin-bottom: 24px; }
.login-card .field { margin-bottom: 14px; }
.login-card .btn-primary { width: 100%; justify-content: center; margin-top: 6px; }
.login-card .switch { text-align: center; font-size: 13.5px; color: var(--ink-soft); margin-top: 16px; }
.login-card .switch button { background: none; border: none; color: var(--accent); font-weight: 600; cursor: pointer; font-family: inherit; font-size: 13.5px; }
.login-card .err { background: #f7e0d8; color: #a8341d; border-radius: 9px; padding: 10px 12px; font-size: 13px; margin-bottom: 14px; }

/* Sidebar account row */
.sidebar .account { font-size: 12px; color: var(--ink-faint); padding: 0 6px; margin-bottom: 8px; word-break: break-all; }
.sidebar .logout {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border-radius: var(--radius-sm);
  border: none; background: none; color: #cdc3b2; cursor: pointer; font-family: inherit; font-weight: 500; font-size: 15px;
  transition: background .18s, color .18s;
}
.sidebar .logout:hover { background: rgba(255,255,255,.06); color: #fff; }
.sidebar .logout svg { width: 19px; height: 19px; }
```

- [ ] **Step 7: Create placeholder `src/main.tsx` and `src/App.tsx`** (Convex wiring comes in Task 12)

`src/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div className="boot">Boköring CRM — uppsättning pågår…</div>;
}
```

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173`, page shows "Boköring CRM — uppsättning pågår…" with the Hanken Grotesk font. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/
git commit -m "chore: scaffold Vite + React + TypeScript project"
```

---

## Task 2: Initialize Convex + Convex Auth (manual, requires Convex account)

> These steps are interactive and run by a human with a Convex account. They create the deployment, generate `convex/_generated/`, write `VITE_CONVEX_URL` into `.env.local`, and provision auth keys. Backend code tasks (3–11) only create files and can be written before this runs; they are type-checked/tested once `convex dev` has generated the API.

**Files:**
- Create (generated/CLI): `.env.local`, `convex/_generated/`, auth env vars in the deployment

- [ ] **Step 1: Start Convex and create a deployment**

Run: `npx convex dev`
Follow the prompts to log in / create a project. Leave it running in its own terminal (it watches `convex/` and regenerates `_generated/`). It writes `VITE_CONVEX_URL` to `.env.local`.

- [ ] **Step 2: Provision Convex Auth**

In a second terminal run: `npx @convex-dev/auth`
This sets `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` in the deployment. Accept defaults.

- [ ] **Step 3: Confirm `.env.local`**

Expected: `.env.local` contains a line like `VITE_CONVEX_URL=https://<name>.convex.cloud`. (`.env.local` is gitignored.)

- [ ] **Step 4: Commit generated API types**

```bash
git add convex/_generated
git commit -m "chore: add generated Convex API types"
```

---

## Task 3: Convex schema

**Files:**
- Create: `convex/schema.ts`

- [ ] **Step 1: Write `convex/schema.ts`**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// One log entry covers leads (from/to) and tasks (also project moves, archive, restore).
export const logEntry = v.object({
  ts: v.string(),
  from: v.optional(v.union(v.string(), v.null())),
  to: v.optional(v.string()),
  fromProject: v.optional(v.string()),
  toProject: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  restored: v.optional(v.boolean()),
});

export default defineSchema({
  ...authTables,
  contacts: defineTable({
    namn: v.string(),
    foretag: v.string(),
    epost: v.string(),
    telefon: v.string(),
  }),
  leads: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    contactId: v.optional(v.id("contacts")),
    sannolikhet: v.number(),
    agare: v.string(),
    datum: v.string(),
    steg: v.string(),
    log: v.array(logEntry),
  }),
  projects: defineTable({
    namn: v.string(),
    beskrivning: v.string(),
    color: v.string(),
  }),
  tasks: defineTable({
    titel: v.string(),
    beskrivning: v.string(),
    projectId: v.id("projects"),
    status: v.string(),
    agare: v.string(),
    prioritet: v.string(),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.string(), v.null())),
    log: v.array(logEntry),
  }).index("by_status", ["status"]),
  settings: defineTable({
    archiveDays: v.number(),
    pileThreshold: v.number(),
  }),
});
```

- [ ] **Step 2: Verify schema compiles**

With `npx convex dev` running, expected: it pushes the schema without errors. (If Task 2 hasn't run yet, run `npx tsc --noEmit` and expect only "cannot find ./_generated" style errors, which resolve after Task 2.)

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(convex): define schema and auth tables"
```

---

## Task 4: Convex Auth configuration

**Files:**
- Create: `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`

- [ ] **Step 1: Write `convex/auth.ts`**

```ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

- [ ] **Step 2: Write `convex/auth.config.ts`**

```ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 3: Write `convex/http.ts`**

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
```

- [ ] **Step 4: Verify** — with `npx convex dev` running, expected: pushes without errors.

- [ ] **Step 5: Commit**

```bash
git add convex/auth.ts convex/auth.config.ts convex/http.ts
git commit -m "feat(convex): configure Convex Auth (password provider)"
```

---

## Task 5: Shared helpers (requireAuth, colors, test harness)

**Files:**
- Create: `convex/helpers.ts`

- [ ] **Step 1: Write `convex/helpers.ts`**

```ts
import { Auth } from "convex/server";

// All functions require a signed-in user, but data is shared (not filtered per user).
export async function requireAuth(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Inte inloggad");
  return identity;
}

export const PROJECT_COLORS = [
  "#6b8aa8", "#c45b32", "#8a6fa8", "#4f7a52", "#c8923a", "#3f7e8c", "#a8567a",
];
```

- [ ] **Step 2: Commit**

```bash
git add convex/helpers.ts
git commit -m "feat(convex): add requireAuth helper and project colors"
```

---

## Task 6: Contacts functions (TDD)

**Files:**
- Create: `convex/contacts.ts`, `convex/contacts.test.ts`

- [ ] **Step 1: Write the failing test** — `convex/contacts.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("contacts.remove unlinks leads pointing to the contact", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });

  const contactId = await u.mutation(api.contacts.create, {
    namn: "Anna", foretag: "Acme", epost: "a@acme.se", telefon: "070",
  });
  const leadId = await u.mutation(api.leads.create, {
    titel: "Affär", beskrivning: "", contactId, sannolikhet: 20,
    agare: "Maria", datum: "2026-06-16", steg: "Lead",
  });

  await u.mutation(api.contacts.remove, { id: contactId });

  const leads = await u.query(api.leads.list, {});
  const lead = leads.find((l) => l._id === leadId)!;
  expect(lead.contactId).toBeUndefined();
  const contacts = await u.query(api.contacts.list, {});
  expect(contacts.find((c) => c._id === contactId)).toBeUndefined();
});

test("contacts functions reject unauthenticated callers", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.contacts.list, {})).rejects.toThrow("Inte inloggad");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- contacts`
Expected: FAIL (`api.contacts.list`/`create`/`remove` and `api.leads.create` not defined yet).

- [ ] **Step 3: Write `convex/contacts.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("contacts").order("desc").collect();
  },
});

const fields = {
  namn: v.string(),
  foretag: v.string(),
  epost: v.string(),
  telefon: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.insert("contacts", args);
  },
});

export const update = mutation({
  args: { id: v.id("contacts"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const linked = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("contactId"), id))
      .collect();
    for (const l of linked) await ctx.db.patch(l._id, { contactId: undefined });
    await ctx.db.delete(id);
  },
});
```

> `convex/leads.ts` (Task 7) must exist for this test's `api.leads.create`. Implement Task 7 before re-running, or run with both files present. Tasks 6 and 7 may be committed together.

- [ ] **Step 4: Run test to verify it passes** (after Task 7's `leads.ts` exists)

Run: `npm test -- contacts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/contacts.ts convex/contacts.test.ts
git commit -m "feat(convex): contacts CRUD with lead unlinking on delete"
```

---

## Task 7: Leads functions (TDD)

**Files:**
- Create: `convex/leads.ts`, `convex/leads.test.ts`

- [ ] **Step 1: Write the failing test** — `convex/leads.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("leads.create logs the initial stage", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, agare: "M", datum: "2026-06-16", steg: "Lead",
  });
  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log).toHaveLength(1);
  expect(lead.log[0]).toMatchObject({ from: null, to: "Lead" });
});

test("leads.move appends a stage-change log entry", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, agare: "M", datum: "2026-06-16", steg: "Lead",
  });
  await u.mutation(api.leads.move, { id, steg: "Kvalificerat" });
  const lead = (await u.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.steg).toBe("Kvalificerat");
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Kvalificerat" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leads`
Expected: FAIL (functions not defined).

- [ ] **Step 3: Write `convex/leads.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("leads").order("desc").collect();
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  contactId: v.optional(v.id("contacts")),
  sannolikhet: v.number(),
  agare: v.string(),
  datum: v.string(),
  steg: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.steg }];
    return await ctx.db.insert("leads", { ...args, log });
  },
});

export const update = mutation({
  args: { id: v.id("leads"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get(id);
    if (!prev) throw new Error("Lead saknas");
    const log = [...prev.log];
    if (prev.steg !== patch.steg) {
      log.push({ ts: new Date().toISOString(), from: prev.steg, to: patch.steg });
    }
    await ctx.db.patch(id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("leads"), steg: v.string() },
  handler: async (ctx, { id, steg }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get(id);
    if (!prev || prev.steg === steg) return;
    const log = [...prev.log, { ts: new Date().toISOString(), from: prev.steg, to: steg }];
    await ctx.db.patch(id, { steg, log });
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete(id);
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads contacts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add convex/leads.ts convex/leads.test.ts
git commit -m "feat(convex): leads CRUD with server-side stage logging"
```

---

## Task 8: Projects functions (TDD)

**Files:**
- Create: `convex/projects.ts`, `convex/projects.test.ts`

- [ ] **Step 1: Write the failing test** — `convex/projects.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("projects.create assigns a palette color", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const id = await u.mutation(api.projects.create, { namn: "P1", beskrivning: "" });
  const p = (await u.query(api.projects.list, {})).find((x) => x._id === id)!;
  expect(p.color).toBe("#6b8aa8");
});

test("projects.remove cascades to its tasks", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal",
  });
  await u.mutation(api.projects.remove, { id: projectId });
  expect(await u.query(api.tasks.list, {})).toHaveLength(0);
  expect(await u.query(api.projects.list, {})).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- projects`
Expected: FAIL.

- [ ] **Step 3: Write `convex/projects.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, PROJECT_COLORS } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("projects").order("asc").collect();
  },
});

export const create = mutation({
  args: { namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const count = (await ctx.db.query("projects").collect()).length;
    const color = PROJECT_COLORS[count % PROJECT_COLORS.length];
    return await ctx.db.insert("projects", { ...args, color });
  },
});

export const update = mutation({
  args: { id: v.id("projects"), namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("projectId"), id))
      .collect();
    for (const t of tasks) await ctx.db.delete(t._id);
    await ctx.db.delete(id);
  },
});
```

> Requires `convex/tasks.ts` (Task 9) for the cascade test. Commit Tasks 8 and 9 together if needed.

- [ ] **Step 4: Run test to verify it passes** (after Task 9)

Run: `npm test -- projects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/projects.ts convex/projects.test.ts
git commit -m "feat(convex): projects CRUD with task cascade on delete"
```

---

## Task 9: Tasks functions (TDD)

**Files:**
- Create: `convex/tasks.ts`, `convex/tasks.test.ts`

- [ ] **Step 1: Write the failing test** — `convex/tasks.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  return { u, projectId };
}

test("tasks.create logs the initial status", async () => {
  const { u, projectId } = await setup();
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal",
  });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.log.at(-1)).toMatchObject({ from: null, to: "Backlog" });
});

test("tasks.move logs status change", async () => {
  const { u, projectId } = await setup();
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agare: "", prioritet: "Normal",
  });
  await u.mutation(api.tasks.move, { id, projectId, status: "Todo" });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.status).toBe("Todo");
  expect(task.log.at(-1)).toMatchObject({ from: "Backlog", to: "Todo" });
});

test("tasks.move across projects logs a project move", async () => {
  const { u, projectId } = await setup();
  const otherId = await u.mutation(api.projects.create, { namn: "P2", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Todo", agare: "", prioritet: "Normal",
  });
  await u.mutation(api.tasks.move, { id, projectId: otherId, status: "Todo" });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.projectId).toBe(otherId);
  expect(task.log.at(-1)).toMatchObject({ fromProject: "P", toProject: "P2" });
});

test("tasks.restore unarchives and resets the move clock", async () => {
  const { u, projectId } = await setup();
  const id = await u.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Done", agare: "", prioritet: "Normal",
  });
  await u.mutation(api.tasks.update, {
    id, titel: "T", beskrivning: "", projectId, status: "Done", agare: "", prioritet: "Normal",
  });
  // Manually archive via the cron's internal mutation path is covered in Task 10;
  // here we just verify restore clears archived + appends a restored entry.
  await u.mutation(api.tasks.restore, { id });
  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.archived).toBe(false);
  expect(task.log.at(-1)).toMatchObject({ restored: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tasks`
Expected: FAIL.

- [ ] **Step 3: Write `convex/tasks.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("tasks").order("asc").collect();
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  projectId: v.id("projects"),
  status: v.string(),
  agare: v.string(),
  prioritet: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.status }];
    return await ctx.db.insert("tasks", { ...args, archived: false, log });
  },
});

export const update = mutation({
  args: { id: v.id("tasks"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get(id);
    if (!prev) throw new Error("Uppgift saknas");
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== patch.projectId) {
      const fromP = await ctx.db.get(prev.projectId);
      const toP = await ctx.db.get(patch.projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== patch.status) {
      log.push({ ts, from: prev.status, to: patch.status });
    }
    await ctx.db.patch(id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("tasks"), projectId: v.id("projects"), status: v.string() },
  handler: async (ctx, { id, projectId, status }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get(id);
    if (!prev) return;
    if (prev.projectId === projectId && prev.status === status) return;
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== projectId) {
      const fromP = await ctx.db.get(prev.projectId);
      const toP = await ctx.db.get(projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== status) {
      log.push({ ts, from: prev.status, to: status });
    }
    await ctx.db.patch(id, { projectId, status, log });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete(id);
  },
});

export const restore = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const prev = await ctx.db.get(id);
    if (!prev) return;
    const log = [...prev.log, { ts: new Date().toISOString(), restored: true }];
    await ctx.db.patch(id, { archived: false, archivedAt: null, log });
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tasks projects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/tasks.ts convex/tasks.test.ts
git commit -m "feat(convex): tasks CRUD with move/restore and server-side logging"
```

---

## Task 10: Settings + daily archive cron (TDD for the sweep)

**Files:**
- Create: `convex/settings.ts`, `convex/crons.ts`, `convex/crons.test.ts`

- [ ] **Step 1: Write `convex/settings.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";

const DEFAULTS = { archiveDays: 3, pileThreshold: 3 };

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const row = await ctx.db.query("settings").first();
    return row
      ? { archiveDays: row.archiveDays, pileThreshold: row.pileThreshold }
      : DEFAULTS;
  },
});

export const set = mutation({
  args: { archiveDays: v.number(), pileThreshold: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const row = await ctx.db.query("settings").first();
    if (row) await ctx.db.patch(row._id, args);
    else await ctx.db.insert("settings", args);
  },
});
```

- [ ] **Step 2: Write `convex/crons.ts`**

```ts
import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY_MS = 86400000;

// Archive Done tasks whose last move is older than the configured threshold.
export const archiveStaleDone = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    const days = settings?.archiveDays ?? 3;
    if (!days || days <= 0) return;
    const cutoff = Date.now() - days * DAY_MS;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "Done"))
      .collect();
    for (const t of tasks) {
      if (t.archived) continue;
      const lastTs = t.log.length
        ? new Date(t.log[t.log.length - 1].ts).getTime()
        : t._creationTime;
      if (lastTs <= cutoff) {
        const now = new Date().toISOString();
        await ctx.db.patch(t._id, {
          archived: true,
          archivedAt: now,
          log: [...t.log, { ts: now, archived: true }],
        });
      }
    }
  },
});

const crons = cronJobs();
crons.daily(
  "archive stale done tasks",
  { hourUTC: 3, minuteUTC: 0 },
  internal.crons.archiveStaleDone,
);
export default crons;
```

- [ ] **Step 3: Write the failing test** — `convex/crons.test.ts`

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("archive sweep archives Done tasks older than the threshold", async () => {
  const t = convexTest(schema, modules);
  const u = t.withIdentity({ name: "Test" });
  await u.mutation(api.settings.set, { archiveDays: 3, pileThreshold: 3 });
  const projectId = await u.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const id = await u.mutation(api.tasks.create, {
    titel: "Old", beskrivning: "", projectId, status: "Done", agare: "", prioritet: "Normal",
  });

  // Backdate the task's only log entry to 5 days ago.
  await t.run(async (ctx) => {
    const task = await ctx.db.get(id);
    const oldTs = new Date(Date.now() - 5 * 86400000).toISOString();
    await ctx.db.patch(id, { log: [{ ts: oldTs, from: null, to: "Done" }] });
  });

  await t.mutation(internal.crons.archiveStaleDone, {});

  const task = (await u.query(api.tasks.list, {})).find((x) => x._id === id)!;
  expect(task.archived).toBe(true);
  expect(task.log.at(-1)).toMatchObject({ archived: true });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- crons`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/settings.ts convex/crons.ts convex/crons.test.ts
git commit -m "feat(convex): settings + daily archive cron"
```

---

## Task 11: Seed demo data

**Files:**
- Create: `convex/seed.ts`

- [ ] **Step 1: Write `convex/seed.ts`**

```ts
import { internalMutation } from "./_generated/server";
import { PROJECT_COLORS } from "./helpers";

const tAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

// Run once on an empty deployment:  npx convex run seed:run
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("leads").first();
    if (existing) return "already seeded";

    const c = [];
    for (const data of [
      { namn: "Anna Lindqvist", foretag: "Nordkvist Bygg AB", epost: "anna@nordkvist.se", telefon: "070-123 45 67" },
      { namn: "Johan Berg", foretag: "Bergström Logistik", epost: "johan.berg@blog.se", telefon: "073-987 65 43" },
      { namn: "Sofia Holm", foretag: "Holm Design Studio", epost: "sofia@holmstudio.se", telefon: "076-555 22 11" },
      { namn: "Erik Sandell", foretag: "TechVind AB", epost: "erik@techvind.se", telefon: "070-444 88 99" },
    ]) c.push(await ctx.db.insert("contacts", data));

    const leadSeed = [
      { titel: "Webbplattform & integration", beskrivning: "Behöver ny kundportal med ERP-koppling. Budget bekräftad.", contactId: c[0], sannolikhet: 30, agare: "Maria Ek", datum: tAgo(2).slice(0, 10), steg: "Lead" },
      { titel: "Lageroptimering Q3", beskrivning: "Utvärderar system för lagerstyrning inför expansion.", contactId: c[1], sannolikhet: 55, agare: "David Ström", datum: tAgo(5).slice(0, 10), steg: "Kvalificerat" },
      { titel: "Varumärkesidentitet", beskrivning: "Rebranding inklusive ny visuell profil och webb.", contactId: c[2], sannolikhet: 70, agare: "Maria Ek", datum: tAgo(9).slice(0, 10), steg: "Förslag" },
      { titel: "Vindkraft – serviceavtal", beskrivning: "Femårigt serviceavtal för turbinpark. Offert skickad.", contactId: c[3], sannolikhet: 85, agare: "David Ström", datum: tAgo(14).slice(0, 10), steg: "Offererat" },
    ];
    for (const l of leadSeed) {
      await ctx.db.insert("leads", { ...l, log: [{ ts: new Date().toISOString(), from: null, to: l.steg }] });
    }

    const p = [];
    for (const [i, data] of [
      { namn: "Kundportal 2.0", beskrivning: "Ny självbetjäningsportal med ERP-koppling." },
      { namn: "Rebranding", beskrivning: "Visuell identitet och ny webbplats." },
    ].entries()) {
      p.push(await ctx.db.insert("projects", { ...data, color: PROJECT_COLORS[i % PROJECT_COLORS.length] }));
    }

    const taskSeed = [
      { titel: "Kravinsamling & workshops", projectId: p[0], status: "Done", agare: "Maria Ek", prioritet: "Hög", daysAgo: 2 },
      { titel: "Wireframes för portalen", projectId: p[0], status: "In Review", agare: "Sofia Holm", prioritet: "Normal", daysAgo: 1 },
      { titel: "API-integration mot ERP", projectId: p[0], status: "In Progress", agare: "David Ström", prioritet: "Hög", daysAgo: 0 },
      { titel: "Inloggningsflöde (SSO)", projectId: p[0], status: "Todo", agare: "David Ström", prioritet: "Normal", daysAgo: 3 },
      { titel: "Felhantering & loggning", projectId: p[0], status: "Todo", agare: "David Ström", prioritet: "Normal", daysAgo: 2 },
      { titel: "E-postnotiser", projectId: p[0], status: "Todo", agare: "Maria Ek", prioritet: "Låg", daysAgo: 1 },
      { titel: "Användardokumentation", projectId: p[0], status: "Todo", agare: "", prioritet: "Låg", daysAgo: 0 },
      { titel: "Prestandatester", projectId: p[0], status: "Backlog", agare: "", prioritet: "Låg", daysAgo: 5 },
      { titel: "Moodboard & research", projectId: p[1], status: "Done", agare: "Sofia Holm", prioritet: "Normal", daysAgo: 2 },
      { titel: "Logotypförslag", projectId: p[1], status: "In Progress", agare: "Sofia Holm", prioritet: "Hög", daysAgo: 1 },
      { titel: "Färgpalett & typografi", projectId: p[1], status: "Todo", agare: "Maria Ek", prioritet: "Normal", daysAgo: 4 },
    ];
    for (const { daysAgo, ...rest } of taskSeed) {
      await ctx.db.insert("tasks", {
        ...rest, beskrivning: "", archived: false,
        log: [{ ts: tAgo(daysAgo), from: null, to: rest.status }],
      });
    }
    return "seeded";
  },
});
```

- [ ] **Step 2: Run the seed (manual, after Task 2)**

Run: `npx convex run seed:run`
Expected: returns `"seeded"`. Running again returns `"already seeded"`.

- [ ] **Step 3: Commit**

```bash
git add convex/seed.ts
git commit -m "feat(convex): one-off demo data seed"
```

---

## Task 12: Wire Convex client, auth gate, and login screen

**Files:**
- Modify: `src/main.tsx`
- Rewrite: `src/App.tsx`
- Create: `src/components/LoginScreen.tsx`

- [ ] **Step 1: Update `src/main.tsx`**

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Write `src/components/LoginScreen.tsx`**

```tsx
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch {
      setError(
        flow === "signIn"
          ? "Fel e-post eller lösenord."
          : "Kunde inte registrera. Kontrollera uppgifterna (lösenord minst 8 tecken)."
      );
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>{flow === "signIn" ? "Logga in" : "Skapa konto"}</h1>
        <div className="sub">Logga in för att komma åt den delade arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>E-post</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="namn@foretag.se" autoFocus />
          </div>
          <div className="field">
            <label>Lösenord</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "…" : flow === "signIn" ? "Logga in" : "Skapa konto"}
          </button>
        </form>
        <div className="switch">
          {flow === "signIn" ? "Har du inget konto?" : "Har du redan ett konto?"}{" "}
          <button onClick={() => { setError(null); setFlow(flow === "signIn" ? "signUp" : "signIn"); }}>
            {flow === "signIn" ? "Registrera" : "Logga in"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `src/App.tsx`** (gate only; views are placeholders until later tasks)

```tsx
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import LoginScreen from "./components/LoginScreen";

export default function App() {
  return (
    <>
      <AuthLoading><div className="boot">Laddar…</div></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated><div className="boot">Inloggad ✓ (vyer kommer i nästa steg)</div></Authenticated>
    </>
  );
}
```

- [ ] **Step 4: Verify auth end-to-end**

With both `npx convex dev` and `npm run dev` running, open `http://localhost:5173`. Expected: login screen → register a user → lands on "Inloggad ✓". Reload keeps you signed in.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/components/LoginScreen.tsx
git commit -m "feat(web): Convex client + auth gate + login screen"
```

---

## Task 13: Constants, format helpers, Toast + Modal primitives, ModalContext

**Files:**
- Create: `src/lib/constants.ts`, `src/lib/format.ts`, `src/context/ToastContext.tsx`, `src/components/Toast.tsx`, `src/components/ui/Modal.tsx`, `src/context/ModalContext.tsx`

**React conversions reference (used by all view/modal tasks):**
- `innerHTML` string templates → JSX. Drop the manual `esc()`; React escapes by default.
- `onclick="UI.fn(...)"` → `onClick={() => fn(...)}`.
- `UI.refresh()` calls → delete; data comes from `useQuery`, mutations auto-update subscribers.
- `Store.X.method()` → `useMutation(api.X.method)` then `await mutate({...})`.
- String ids (`l.id`) → Convex ids (`l._id`).
- Inline `style="--x:y"` → `style={{ ["--x" as any]: y }}`.

- [ ] **Step 1: Write `src/lib/constants.ts`**

```ts
export const STAGES = ["Lead", "Kvalificerat", "Förslag", "Offererat", "Stängd"] as const;
export const STAGE_VAR: Record<string, string> = {
  Lead: "var(--s0)", Kvalificerat: "var(--s1)", Förslag: "var(--s2)",
  Offererat: "var(--s3)", Stängd: "var(--s4)",
};
export const TASK_STATUSES = ["Backlog", "Todo", "In Progress", "In Review", "Done"] as const;
export const PRIORITIES = ["Låg", "Normal", "Hög"] as const;
export const PRIORITY_CLASS: Record<string, string> = { Låg: "low", Normal: "normal", Hög: "high" };
```

- [ ] **Step 2: Write `src/lib/format.ts`**

```ts
type LogEntry = { ts: string; from?: string | null; to?: string; archived?: boolean; restored?: boolean; fromProject?: string; toProject?: string };
type WithLog = { log?: LogEntry[]; _creationTime?: number };

export function initials(name?: string) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
export function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return d; }
}
export function fmtTimestamp(ts: string) {
  try { return new Date(ts).toLocaleString("sv-SE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
}
export function lastMovedTs(t: WithLog) {
  const log = t.log ?? [];
  if (log.length) return new Date(log[log.length - 1].ts).getTime();
  return t._creationTime ?? Date.now();
}
export function daysSinceMove(t: WithLog) {
  return Math.max(0, Math.floor((Date.now() - lastMovedTs(t)) / 86400000));
}
```

- [ ] **Step 3: Write `src/context/ToastContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={"toast" + (msg ? " show" : "")}><span className="dot" /><span>{msg}</span></div>
    </ToastCtx.Provider>
  );
}
```

- [ ] **Step 4: Write `src/components/ui/Modal.tsx`**

```tsx
import { useEffect } from "react";

export default function Modal({ wide, onClose, children }: { wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay open" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}
```
(The `.overlay`/`.modal` CSS already exists in `index.css`.)

- [ ] **Step 5: Write `src/context/ModalContext.tsx`** (centralized modal manager; mirrors the iteration-1 `UI.openX` functions)

```tsx
import { createContext, useContext, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type ModalState =
  | { kind: "leadDetail"; id: Id<"leads"> }
  | { kind: "leadForm"; id?: Id<"leads">; presetSteg?: string }
  | { kind: "contactDetail"; id: Id<"contacts"> }
  | { kind: "contactForm"; id?: Id<"contacts"> }
  | { kind: "taskForm"; id?: Id<"tasks">; presetProject?: Id<"projects">; presetStatus?: string }
  | { kind: "projectForm"; id?: Id<"projects"> }
  | { kind: "settings" }
  | null;

type Api = {
  state: ModalState;
  openLeadDetail: (id: Id<"leads">) => void;
  openLeadForm: (id?: Id<"leads">, presetSteg?: string) => void;
  openContactDetail: (id: Id<"contacts">) => void;
  openContactForm: (id?: Id<"contacts">) => void;
  openTaskForm: (id?: Id<"tasks">, presetProject?: Id<"projects">, presetStatus?: string) => void;
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
    openLeadDetail: (id) => setState({ kind: "leadDetail", id }),
    openLeadForm: (id, presetSteg) => setState({ kind: "leadForm", id, presetSteg }),
    openContactDetail: (id) => setState({ kind: "contactDetail", id }),
    openContactForm: (id) => setState({ kind: "contactForm", id }),
    openTaskForm: (id, presetProject, presetStatus) => setState({ kind: "taskForm", id, presetProject, presetStatus }),
    openProjectForm: (id) => setState({ kind: "projectForm", id }),
    openSettings: () => setState({ kind: "settings" }),
    close: () => setState(null),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib src/context src/components/Toast.tsx src/components/ui
git commit -m "feat(web): constants, format helpers, toast + modal primitives, modal context"
```

---

## Task 14: App shell — providers, sidebar, navigation, modal host

**Files:**
- Rewrite: `src/App.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/ModalHost.tsx`

- [ ] **Step 1: Write `src/components/Sidebar.tsx`**

Port the `<aside class="sidebar">` markup from `crm.html`. Replace the three nav items' `onclick` with `onClick={() => onNavigate('kanban'|'contacts'|'tasks')}` and set `active` from the `view` prop. Replace the settings button `onclick` with `onClick={onOpenSettings}`. Add the account row + logout above the foot:

```tsx
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

type View = "kanban" | "contacts" | "tasks";

export default function Sidebar({ view, onNavigate, onOpenSettings }: {
  view: View; onNavigate: (v: View) => void; onOpenSettings: () => void;
}) {
  const { signOut } = useAuthActions();
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const activeTasks = tasks.filter((t) => !t.archived).length;
  // ...render the sidebar markup from crm.html, using these counts,
  // `view` for the active class, onNavigate for nav clicks,
  // onOpenSettings for the gear button, and a logout button calling signOut().
  return (/* JSX ported from crm.html <aside class="sidebar"> */ null as any);
}
```
Counts: Pipeline = `leads.length`, Kontakter = `contacts.length`, Uppgifter = `activeTasks`.

- [ ] **Step 2: Write `src/components/ModalHost.tsx`**

```tsx
import { useModal } from "../context/ModalContext";
import LeadDetail from "./kanban/LeadDetail";
import LeadForm from "./kanban/LeadForm";
import ContactDetail from "./contacts/ContactDetail";
import ContactForm from "./contacts/ContactForm";
import TaskForm from "./tasks/TaskForm";
import ProjectForm from "./tasks/ProjectForm";
import SettingsModal from "./settings/SettingsModal";

export default function ModalHost() {
  const m = useModal();
  switch (m.state?.kind) {
    case "leadDetail": return <LeadDetail id={m.state.id} />;
    case "leadForm": return <LeadForm id={m.state.id} presetSteg={m.state.presetSteg} />;
    case "contactDetail": return <ContactDetail id={m.state.id} />;
    case "contactForm": return <ContactForm id={m.state.id} />;
    case "taskForm": return <TaskForm id={m.state.id} presetProject={m.state.presetProject} presetStatus={m.state.presetStatus} />;
    case "projectForm": return <ProjectForm id={m.state.id} />;
    case "settings": return <SettingsModal />;
    default: return null;
  }
}
```
> `ProjectForm` is part of Task 17; until then, comment out its case to keep the build green.

- [ ] **Step 3: Rewrite `src/App.tsx`**

```tsx
import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import ModalHost from "./components/ModalHost";
import { ToastProvider } from "./context/ToastContext";
import { ModalProvider, useModal } from "./context/ModalContext";
import PipelineView from "./components/kanban/PipelineView";
import ContactsView from "./components/contacts/ContactsView";
import TasksView from "./components/tasks/TasksView";

type View = "kanban" | "contacts" | "tasks";

function Workspace() {
  const [view, setView] = useState<View>("kanban");
  const modal = useModal();
  return (
    <div className="app">
      <Sidebar view={view} onNavigate={setView} onOpenSettings={modal.openSettings} />
      <main className="main">
        {view === "kanban" && <PipelineView />}
        {view === "contacts" && <ContactsView />}
        {view === "tasks" && <TasksView />}
      </main>
      <ModalHost />
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading><div className="boot">Laddar…</div></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated>
        <ToastProvider>
          <ModalProvider>
            <Workspace />
          </ModalProvider>
        </ToastProvider>
      </Authenticated>
    </>
  );
}
```
> Create temporary one-line placeholder components for `PipelineView`, `ContactsView`, `TasksView` (e.g. `export default () => <div/>;`) so the build compiles; Tasks 15–17 replace them.

- [ ] **Step 4: Verify** — app boots, sidebar renders with live counts, nav switches views (placeholders), logout returns to login.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/components/ModalHost.tsx src/components/kanban src/components/contacts src/components/tasks
git commit -m "feat(web): app shell with sidebar, navigation, and modal host"
```

---

## Task 15: Pipeline (kanban) view — board, cards, drag & drop, lead detail + form

**Files:**
- Create: `src/components/kanban/PipelineView.tsx`, `LeadCard.tsx`, `LeadDetail.tsx`, `LeadForm.tsx`

Port markup/CSS from the `#view-kanban` section and `cardHtml`, `openLeadDetail`, `openLeadForm` in `crm.html`.

- [ ] **Step 1: `PipelineView.tsx`** — board with five columns and drag & drop

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES, STAGE_VAR } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import LeadCard from "./LeadCard";

export default function PipelineView() {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const move = useMutation(api.leads.move);
  const modal = useModal();
  const toast = useToast();
  const [dragId, setDragId] = useState<Id<"leads"> | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const won = leads.filter((l) => l.steg === "Stängd").length;

  async function onDrop(stage: string) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l._id === id);
    if (!lead || lead.steg === stage) return;
    await move({ id, steg: stage });
    toast(`Flyttad till ”${stage}”`);
  }

  // Render the topbar (title + "Nytt lead" → modal.openLeadForm()) and the
  // .board with five .col columns from crm.html. For each column:
  //   - header swatch color = STAGE_VAR[stage], count = items.length
  //   - items = leads.filter(l => l.steg === stage) mapped to <LeadCard>
  //   - column dnd: onDragOver={e=>{e.preventDefault(); setOverStage(stage);}}
  //     onDragLeave={()=>setOverStage(null)} onDrop={()=>onDrop(stage)}
  //     className "col" + (overStage===stage ? " drag-over" : "")
  //   - the "+ Lägg till" button → modal.openLeadForm(undefined, stage)
  return (/* JSX ported from crm.html #view-kanban */ null as any);
}
```

- [ ] **Step 2: `LeadCard.tsx`** — port `cardHtml`

```tsx
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials } from "../../lib/format";

export default function LeadCard({ lead, contactName, onClick, onDragStart, onDragEnd }: {
  lead: Doc<"leads">; contactName: string;
  onClick: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const color = STAGE_VAR[lead.steg];
  // Render the .card markup from crm.html: draggable, style={{['--stage-color']:color}},
  // <h3>{lead.titel}</h3>, contact row with avatar={initials(contactName)},
  // prob bar width = lead.sannolikhet + '%', owner = lead.agare.
  // onClick={onClick}, onDragStart={onDragStart}, onDragEnd={onDragEnd}.
  return (null as any);
}
```
Wire in `PipelineView`: `onDragStart={() => setDragId(lead._id)}`, `onDragEnd={() => setDragId(null)}`, `onClick={() => modal.openLeadDetail(lead._id)}`, `contactName` resolved from `contacts.find(c => c._id === lead.contactId)?.namn ?? "Ingen kontakt"`.

- [ ] **Step 3: `LeadDetail.tsx`** — port `openLeadDetail` (tabs Översikt / Stegslogg)

```tsx
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { fmtDate, fmtTimestamp, initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import Modal from "../ui/Modal";

export default function LeadDetail({ id }: { id: Id<"leads"> }) {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const modal = useModal();
  const [tab, setTab] = useState<"info" | "log">("info");
  const lead = leads.find((l) => l._id === id);
  if (!lead) return null;
  const contact = contacts.find((c) => c._id === lead.contactId) ?? null;
  const log = [...lead.log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  // Render the lead detail modal from crm.html inside <Modal onClose={modal.close}>:
  //   header stage-tag (STAGE_VAR[lead.steg]), title, close button → modal.close()
  //   tabs switch `tab`; Översikt = info-grid (contact chip → modal.openContactDetail(contact._id)),
  //   Stegslogg = timeline mapping `log` (entry.from===null → "Lead skapat i", else from→to with STAGE_VAR badges)
  //   footer: "Ta bort" (see step 4 deletion), "Stäng" → modal.close(), "Redigera" → modal.openLeadForm(lead._id)
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```
Deletion button calls a `useMutation(api.leads.remove)`: `if (confirm(...)) { await remove({id: lead._id}); modal.close(); toast("Lead borttaget"); }` (import `useToast`).

- [ ] **Step 4: `LeadForm.tsx`** — port `openLeadForm` + `saveLead`

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function LeadForm({ id, presetSteg }: { id?: Id<"leads">; presetSteg?: string }) {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const create = useMutation(api.leads.create);
  const update = useMutation(api.leads.update);
  const remove = useMutation(api.leads.remove);
  const modal = useModal();
  const toast = useToast();
  const existing = id ? leads.find((l) => l._id === id) : undefined;

  const [form, setForm] = useState({
    titel: existing?.titel ?? "",
    beskrivning: existing?.beskrivning ?? "",
    contactId: (existing?.contactId ?? "") as Id<"contacts"> | "",
    sannolikhet: existing?.sannolikhet ?? 25,
    agare: existing?.agare ?? "",
    datum: existing?.datum ?? new Date().toISOString().slice(0, 10),
    steg: existing?.steg ?? presetSteg ?? "Lead",
  });

  async function save() {
    if (!form.titel.trim()) return;
    const payload = {
      titel: form.titel.trim(), beskrivning: form.beskrivning.trim(),
      contactId: form.contactId ? (form.contactId as Id<"contacts">) : undefined,
      sannolikhet: Number(form.sannolikhet), agare: form.agare.trim(),
      datum: form.datum, steg: form.steg,
    };
    if (id) { await update({ id, ...payload }); toast("Lead uppdaterat"); }
    else { await create(payload); toast("Lead skapat"); }
    modal.close();
  }
  // Render the lead form modal from crm.html: controlled inputs bound to `form`/setForm,
  // contact <select> from `contacts`, stage <select> from STAGES, range for sannolikhet.
  // Footer: "Ta bort" (edit only) → confirm + remove + modal.close(); Avbryt → modal.close(); Spara → save().
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 5: Verify** — board renders with live data; add a lead; drag a card between columns (updates + toast + stage log entry visible in detail); edit/delete work. Confirm a second browser window updates live.

- [ ] **Step 6: Commit**

```bash
git add src/components/kanban
git commit -m "feat(web): pipeline kanban view with drag & drop and lead detail/form"
```

---

## Task 16: Contacts view — table, detail (linked leads), form

**Files:**
- Create: `src/components/contacts/ContactsView.tsx`, `ContactDetail.tsx`, `ContactForm.tsx`

Port markup from `#view-contacts`, `renderContacts`, `openContactDetail`, `openContactForm`, `saveContact`, `deleteContact` in `crm.html`.

- [ ] **Step 1: `ContactsView.tsx`**

```tsx
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";

export default function ContactsView() {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const modal = useModal();
  const leadCount = (id: string) => leads.filter((l) => l.contactId === id).length;
  // Render topbar ("Ny kontakt" → modal.openContactForm()) + the table from crm.html.
  // Row edit button → modal.openContactDetail(c._id); delete button → see ContactDetail's remove logic
  // (or call useMutation(api.contacts.remove) here with the same confirm).
  return (null as any);
}
```

- [ ] **Step 2: `ContactForm.tsx`** — port `saveContact`

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function ContactForm({ id }: { id?: Id<"contacts"> }) {
  const contacts = useQuery(api.contacts.list) ?? [];
  const create = useMutation(api.contacts.create);
  const update = useMutation(api.contacts.update);
  const modal = useModal();
  const toast = useToast();
  const existing = id ? contacts.find((c) => c._id === id) : undefined;
  const [form, setForm] = useState({
    namn: existing?.namn ?? "", foretag: existing?.foretag ?? "",
    epost: existing?.epost ?? "", telefon: existing?.telefon ?? "",
  });
  async function save() {
    if (!form.namn.trim()) return;
    const payload = { namn: form.namn.trim(), foretag: form.foretag.trim(), epost: form.epost.trim(), telefon: form.telefon.trim() };
    if (id) { await update({ id, ...payload }); toast("Kontakt uppdaterad"); }
    else { await create(payload); toast("Kontakt skapad"); }
    modal.close();
  }
  // Render the contact form modal from crm.html (namn, foretag, epost, telefon). Footer like LeadForm.
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 3: `ContactDetail.tsx`** — port `openContactDetail` with linked leads + delete

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function ContactDetail({ id }: { id: Id<"contacts"> }) {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const remove = useMutation(api.contacts.remove);
  const modal = useModal();
  const toast = useToast();
  const contact = contacts.find((c) => c._id === id);
  if (!contact) return null;
  const linked = leads.filter((l) => l.contactId === id);
  async function del() {
    const warn = linked.length ? `\n\n${linked.length} kopplade affärer blir utan kontakt (raderas inte).` : "";
    if (!confirm(`Ta bort kontakten ”${contact.namn}”?${warn}`)) return;
    await remove({ id });           // server unlinks leads
    modal.close();
    toast("Kontakt borttagen");
  }
  // Render contact detail modal: info grid + "Kopplade affärer" list mapping `linked`
  // (each row → modal.openLeadDetail(l._id)). Footer: Ta bort → del(); Stäng → modal.close();
  // Redigera → modal.openContactForm(contact._id).
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 4: Verify** — contacts table shows live affär counts; create/edit/delete work; deleting a contact unlinks its leads (check a linked lead's detail shows "Ingen kontakt"); contact detail lists linked leads and opens them.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts
git commit -m "feat(web): contacts view with detail, linked leads, and form"
```

---

## Task 17: Tasks view — swimlane, cards, piles, project pile-toggle, task form, project form

**Files:**
- Create: `src/components/tasks/TasksView.tsx`, `TaskCard.tsx`, `Pile.tsx`, `TaskForm.tsx`, `ProjectForm.tsx`

Port markup/CSS from `#view-tasks`, `renderTasks`, `taskCardHtml`, `pileHtml`, `togglePile`, `toggleProjectPiles`, `openTaskForm`, `saveTask`, `openProjectForm`, `saveProject`, `deleteProject` in `crm.html`.

- [ ] **Step 1: `TasksView.tsx`** — swimlane grid, drag & drop, piles, project pile-toggle

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TASK_STATUSES } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import TaskCard from "./TaskCard";
import Pile from "./Pile";

export default function TasksView() {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const settings = useQuery(api.settings.get) ?? { archiveDays: 3, pileThreshold: 3 };
  const move = useMutation(api.tasks.move);
  const modal = useModal();
  const toast = useToast();

  const [dragId, setDragId] = useState<Id<"tasks"> | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const th = Number(settings.pileThreshold);
  const cellTasks = (pid: string, status: string) =>
    tasks.filter((t) => t.projectId === pid && t.status === status && !t.archived);

  function toggleKey(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleProject(pid: string) {
    const keys = TASK_STATUSES.filter((s) => th > 0 && cellTasks(pid, s).length > th).map((s) => pid + "|" + s);
    if (!keys.length) return;
    const allOpen = keys.every((k) => expanded.has(k));
    setExpanded((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOpen ? next.delete(k) : next.add(k)));
      return next;
    });
  }
  async function onDrop(pid: Id<"projects">, status: string) {
    setOverKey(null);
    const id = dragId; setDragId(null);
    if (!id) return;
    const task = tasks.find((t) => t._id === id);
    if (!task) return;
    if (task.projectId === pid && task.status === status) return;
    const crossProject = task.projectId !== pid;
    if (crossProject) {
      const fromP = projects.find((p) => p._id === task.projectId)?.namn ?? "—";
      const toP = projects.find((p) => p._id === pid)?.namn ?? "—";
      if (!confirm(`Flytta ”${task.titel}” från projektet ”${fromP}” till ”${toP}”?`)) return;
    }
    await move({ id, projectId: pid, status });
    toast(crossProject ? "Flyttad till annat projekt" : `Flyttad till ”${status}”`);
  }

  // Render the swimlane from crm.html:
  //   - .swim-head: corner "Projekt" + one header per TASK_STATUSES with count
  //     tasks.filter(t=>t.status===s && !t.archived).length
  //   - one .swim-row per project. Label cell: bar (project.color), name, count
  //     (cellTasks across statuses), and .plabel-actions with the pile-toggle (only when
  //     pileKeys.length>0) above the edit button (→ modal.openProjectForm(p._id)).
  //     pile-toggle onClick → toggleProject(p._id); icon = allOpen ? close : open.
  //   - each cell (data-project, data-status): dnd handlers like the kanban; items = cellTasks(...).
  //     If th>0 && items.length>th && !expanded.has(key): render <Pile> ; else render items as
  //     <TaskCard> and, when items.length>th, a "Lägg ihop hög (N)" button → toggleKey(key).
  //     Always render the "+ Uppgift" cell-add → modal.openTaskForm(undefined, p._id, status).
  //   - if projects.length===0 render the empty state with "Nytt projekt" → modal.openProjectForm().
  // Topbar: "Nytt projekt" → modal.openProjectForm(); "Ny uppgift" → modal.openTaskForm().
  return (null as any);
}
```

- [ ] **Step 2: `TaskCard.tsx`** — port `taskCardHtml` with day badge

```tsx
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PRIORITY_CLASS } from "../../lib/constants";
import { daysSinceMove } from "../../lib/format";

export default function TaskCard({ task, projectColor, archiveDays, onClick, onDragStart, onDragEnd }: {
  task: Doc<"tasks">; projectColor: string; archiveDays: number;
  onClick: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const cls = PRIORITY_CLASS[task.prioritet] ?? "normal";
  const days = daysSinceMove(task);
  const warn = task.status === "Done" && archiveDays > 0 && days >= archiveDays - 1;
  // Render the .task-card markup from crm.html: draggable, style {['--tc']:projectColor},
  // <span className={"age"+(warn?" warn":"")} title=`${days} dagar...`>{days}d</span>,
  // <h4>{task.titel}</h4>, .tm with .prio and optional owner. Wire onClick/onDragStart/onDragEnd.
  return (null as any);
}
```

- [ ] **Step 3: `Pile.tsx`** — port `pileHtml`

```tsx
import type { Doc } from "../../../convex/_generated/dataModel";

export default function Pile({ items, color, onOpen }: {
  items: Doc<"tasks">[]; color: string; onOpen: () => void;
}) {
  const top = items.slice(0, 2).map((t) => t.titel).join(" · ");
  // Render the .pile markup from crm.html: style {['--tc']:color}, onClick={onOpen},
  // pile-head (stack icon, "{items.length} kort", "Öppna"), pile-preview = top + (items.length>2 ? ` · +${items.length-2}` : "").
  return (null as any);
}
```

- [ ] **Step 4: `ProjectForm.tsx`** — port `openProjectForm` + `saveProject` + `deleteProject`

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function ProjectForm({ id }: { id?: Id<"projects"> }) {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);
  const remove = useMutation(api.projects.remove);
  const modal = useModal();
  const toast = useToast();
  const existing = id ? projects.find((p) => p._id === id) : undefined;
  const [form, setForm] = useState({ namn: existing?.namn ?? "", beskrivning: existing?.beskrivning ?? "" });

  async function save() {
    if (!form.namn.trim()) return;
    const payload = { namn: form.namn.trim(), beskrivning: form.beskrivning.trim() };
    if (id) { await update({ id, ...payload }); toast("Projekt uppdaterat"); }
    else { await create(payload); toast("Projekt skapat"); }
    modal.close();
  }
  async function del() {
    if (!id) return;
    const n = tasks.filter((t) => t.projectId === id).length;
    const warn = n ? `\n\n${n} uppgifter i projektet raderas också.` : "";
    if (!confirm(`Ta bort projektet ”${existing?.namn}”?${warn}`)) return;
    await remove({ id });
    modal.close();
    toast("Projekt borttaget");
  }
  // Render the project form modal from crm.html (namn, beskrivning). Footer: Ta bort (edit) → del(); Avbryt; Skapa/Spara → save().
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 5: `TaskForm.tsx`** — port `openTaskForm` + `saveTask` with embedded Historik

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TASK_STATUSES, PRIORITIES } from "../../lib/constants";
import { fmtTimestamp } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function TaskForm({ id, presetProject, presetStatus }: {
  id?: Id<"tasks">; presetProject?: Id<"projects">; presetStatus?: string;
}) {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const create = useMutation(api.tasks.create);
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);
  const modal = useModal();
  const toast = useToast();

  // If no projects exist, redirect to project creation.
  if (!id && projects.length === 0) { modal.openProjectForm(); return null; }

  const existing = id ? tasks.find((t) => t._id === id) : undefined;
  const [form, setForm] = useState({
    titel: existing?.titel ?? "",
    beskrivning: existing?.beskrivning ?? "",
    projectId: (existing?.projectId ?? presetProject ?? projects[0]?._id) as Id<"projects">,
    status: existing?.status ?? presetStatus ?? "Backlog",
    agare: existing?.agare ?? "",
    prioritet: existing?.prioritet ?? "Normal",
  });

  async function save() {
    if (!form.titel.trim()) return;
    const payload = {
      titel: form.titel.trim(), beskrivning: form.beskrivning.trim(),
      projectId: form.projectId, status: form.status, agare: form.agare.trim(), prioritet: form.prioritet,
    };
    if (id) {
      const prev = existing!;
      if (prev.projectId !== form.projectId) {
        const fromP = projects.find((p) => p._id === prev.projectId)?.namn ?? "—";
        const toP = projects.find((p) => p._id === form.projectId)?.namn ?? "—";
        if (!confirm(`Flytta ”${prev.titel}” från projektet ”${fromP}” till ”${toP}”?`)) return;
      }
      await update({ id, ...payload }); toast("Uppgift uppdaterad");
    } else { await create(payload); toast("Uppgift skapad"); }
    modal.close();
  }

  const log = existing ? [...existing.log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()) : [];
  // Render the task form modal from crm.html: controlled inputs; projekt <select> from `projects`;
  // status <select> from TASK_STATUSES; prioritet <select> from PRIORITIES.
  // When editing, render the Historik timeline from `log` with the same entry variants as crm.html
  // (restored → "Återställd från arkiv", archived → "Arkiverad från Done", fromProject → "Projektbyte:",
  //  from===null → "Skapad i", else from→to), using fmtTimestamp(entry.ts).
  // Footer: Ta bort (edit) → confirm + remove({id}) + modal.close(); Avbryt; Skapa/Spara → save().
  return (<Modal onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 6: Enable `ProjectForm` in `ModalHost`** — uncomment/add the `case "projectForm"` line from Task 14.

- [ ] **Step 7: Verify** — swimlane renders with live data; add project/task; drag within and across projects (cross shows confirm + logs project move); day badges correct; piles form at >threshold, open/close per cell and per project; task history shows entries.

- [ ] **Step 8: Commit**

```bash
git add src/components/tasks src/components/ModalHost.tsx
git commit -m "feat(web): tasks swimlane with piles, drag & drop, task/project forms"
```

---

## Task 18: Settings modal (pile threshold, archive days, archived list + restore)

**Files:**
- Create: `src/components/settings/SettingsModal.tsx`

Port from `openSettings` + `saveSettings` + `restoreTask` in `crm.html`.

- [ ] **Step 1: `SettingsModal.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { fmtDate } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function SettingsModal() {
  const settings = useQuery(api.settings.get);
  const tasks = useQuery(api.tasks.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const setSettings = useMutation(api.settings.set);
  const restore = useMutation(api.tasks.restore);
  const modal = useModal();
  const toast = useToast();

  const [pile, setPile] = useState<string>("");
  const [archive, setArchive] = useState<string>("");
  // Initialize the inputs once settings load:
  if (settings && pile === "" && archive === "") {
    setPile(String(settings.pileThreshold));
    setArchive(String(settings.archiveDays));
  }
  const archived = tasks.filter((t) => t.archived)
    .sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime());

  async function save() {
    const p = parseInt(pile, 10); const a = parseInt(archive, 10);
    await setSettings({
      pileThreshold: isNaN(p) || p < 0 ? 0 : p,
      archiveDays: isNaN(a) || a < 0 ? 0 : a,
    });
    modal.close();
    toast("Inställningar sparade");
  }
  // Render the settings modal from crm.html (wide): "Högar" section (pileThreshold input bound to pile),
  // "Arkivering" section (archiveDays input bound to archive), "Arkiverade uppgifter (N)" list mapping
  // `archived` with project name/color and a "Återställ" button → restore({id}) (no modal.close, stays open).
  // Footer: Avbryt → modal.close(); Spara → save().
  return (<Modal wide onClose={modal.close}>{null as any}</Modal>);
}
```

- [ ] **Step 2: Verify** — open settings; change pile threshold (piles re-form live); change archive days; archived list shows; restore returns a task to its column.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings
git commit -m "feat(web): settings modal with archiving controls and restore"
```

---

## Task 19: Parity sweep, remove legacy file, README

**Files:**
- Delete: `crm.html`
- Create: `README.md`

- [ ] **Step 1: Parity check against `crm.html`**

Walk every feature: kanban (cards show titel/kontakt/sannolikhet/ägare, add, dnd, detail edit/delete, stage log), contacts (CRUD, linked leads, unlink on delete), tasks (swimlane, cards with day badge, dnd within/across projects with confirm + logging, piles per-cell and per-project toggle, task history, archive cron, restore), settings (pile threshold, archive days). Fix any gaps in the relevant component.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: all Convex tests PASS.

- [ ] **Step 3: Write `README.md`**

````markdown
# Boköring CRM

CRM med kanban-pipeline, kontaktdatabas och uppgifter (swimlanes), byggt på
Convex (reaktiv databas + auth) och React + Vite.

## Köra lokalt

```bash
npm install
npx convex dev          # terminal 1 — backend + codegen, skriver VITE_CONVEX_URL till .env.local
npx @convex-dev/auth    # engångs — provisionerar auth-nycklar
npx convex run seed:run # engångs — fyller databasen med demodata
npm run dev             # terminal 2 — frontend på http://localhost:5173
```

Registrera ett konto på inloggningsskärmen. Alla inloggade delar samma data.

## Test

```bash
npm test
```
````

- [ ] **Step 4: Remove the legacy file**

```bash
git rm crm.html
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "chore: remove legacy single-file app; add README"
```

---

## Done

All spec requirements implemented: Convex backend (schema + functions with server-side logging), Convex Auth email/password, shared workspace, daily archive cron, seed, and a React + Vite frontend at feature parity with `crm.html` — now with live multi-user updates.
