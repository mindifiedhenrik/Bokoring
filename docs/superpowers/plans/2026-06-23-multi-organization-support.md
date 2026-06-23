# Multi-organization support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-tenant CRM into a multi-tenant app where each organization has isolated data, joined via a login code, with users able to belong to and switch between multiple organizations — without losing existing production data.

**Architecture:** Add `organizations` + `memberships` tables and an `activeOrgId` pointer on `users`. Every business table gains an `orgId` + `by_org` index. A central `requireOrg(ctx)` helper resolves `{ userId, orgId }`; every query filters by `orgId` and every mutation stamps it and asserts ownership before touching a row. Existing data is migrated into one seeded default org via an additive, idempotent backfill (widen → backfill → verify → narrow).

**Tech Stack:** Convex 1.41 (note: this codebase uses the explicit-table API — `ctx.db.get(table, id)`, `ctx.db.patch(table, id, patch)`, `ctx.db.insert(table, doc)`, `ctx.db.delete(table, id)`, `ctx.db.query(table)`), `@convex-dev/auth` 0.0.94 (Password provider), React 19 + Vite, Vitest + convex-test.

**Conventions to follow:**
- Match existing code style: Swedish identifiers/UI strings, terse handlers, `requireAuth`-style helpers.
- Run the whole backend test suite with `npm test`. Run a single file with `npx vitest run convex/<file>.test.ts`.
- Commit after every task.

---

## Rollout note (read before deploying — not a coding task)

To avoid locking out existing users, deploy in this order against production:

1. Deploy the code through **Task 17** (schema still widened: `orgId` is `v.optional`, `requireOrg` enforced, new tables and frontend present). Existing users would have no membership yet, so do step 2 immediately.
2. Run the backfill: `npx convex run migrations:backfillOrgs` (prod). This is additive — it never deletes or overwrites.
3. **Verify gate:** run `npx convex run migrations:verifyOrgs` and confirm it reports `0` rows missing `orgId` and that every user has a membership + `activeOrgId`.
4. Only then deploy **Task 18** (schema narrowed: `orgId` required).

Local development/tests always use the final schema; the test fixtures stamp `orgId`, so the suite stays green throughout.

---

## File structure

**New files:**
- `convex/organizations.ts` — org lifecycle: `create`, `join`, `setActive`, `rotateCode`, `myOrgs`, `current`, plus `findByCode` (internal query for signup) and a `genJoinCode` helper.
- `convex/migrations.ts` — `backfillOrgs` and `verifyOrgs` internal mutations/queries.
- `convex/testHelpers.ts` — `setupOrg(t)` shared test fixture.
- `convex/organizations.test.ts`, `convex/migrations.test.ts` — tests for the new modules.
- `src/context/OrgContext.tsx` — `OrgProvider` + `useOrg()` exposing active org and membership list.
- `src/components/OrgSwitcher.tsx` — switcher shown when the user has 2+ orgs.

**Modified files:**
- `convex/schema.ts` — new tables, `users.activeOrgId`, `orgId` on business tables.
- `convex/helpers.ts` — add `requireOrg`.
- `convex/auth.ts` — code→org lookup at signup; membership creation callback.
- `convex/leads.ts`, `convex/contacts.ts`, `convex/projects.ts`, `convex/tasks.ts`, `convex/notes.ts`, `convex/settings.ts` — org scoping.
- `convex/users.ts` — `list` → org members; `remove` → `removeMember`.
- `convex/crons.ts` — per-org archiving.
- `convex/seed.ts` — create a default org and stamp `orgId`.
- All existing `convex/*.test.ts` — use `setupOrg` fixture.
- `src/App.tsx` — wrap in `OrgProvider`.
- `src/components/LoginScreen.tsx` — "organisationskod" copy.
- `src/components/Sidebar.tsx` — render `OrgSwitcher`.
- `src/components/settings/SettingsModal.tsx` — org panel (create/join/rotate code).

---

## Phase 1 — Schema and org primitives (schema widened)

### Task 1: Widen the schema with org tables and optional `orgId`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Replace the schema with the widened version**

`orgId` is `v.optional` for now so existing rows validate during backfill. The `users` table is overridden to add `activeOrgId` while preserving the auth fields and indexes.

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// One log-entry shape covers leads (from/to) and tasks (also project moves, archive, restore).
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
  // Override the auth `users` table to add the active-org pointer. Keep the
  // original auth fields + indexes (email, phone).
  users: defineTable({
    ...authTables.users.validator.fields,
    activeOrgId: v.optional(v.id("organizations")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  organizations: defineTable({
    namn: v.string(),
    joinCode: v.string(),
  }).index("by_joinCode", ["joinCode"]),
  memberships: defineTable({
    userId: v.id("users"),
    orgId: v.id("organizations"),
  })
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"])
    .index("by_user_org", ["userId", "orgId"]),
  contacts: defineTable({
    orgId: v.optional(v.id("organizations")),
    namn: v.string(),
    foretag: v.string(),
    epost: v.string(),
    telefon: v.string(),
    reminderAgareId: v.optional(v.id("users")),
    reminderDatum: v.optional(v.string()),
    reminderText: v.optional(v.string()),
  }).index("by_org", ["orgId"]),
  leads: defineTable({
    orgId: v.optional(v.id("organizations")),
    titel: v.string(),
    beskrivning: v.string(),
    contactId: v.optional(v.id("contacts")),
    sannolikhet: v.number(),
    agareId: v.optional(v.id("users")),
    // Legacy free-text owner. Unused by the app (replaced by agareId); kept as an
    // optional field so existing production documents validate without a migration.
    agare: v.optional(v.string()),
    datum: v.string(),
    steg: v.string(),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_contact", ["contactId"])
    .index("by_agare", ["agareId"])
    .index("by_org", ["orgId"]),
  projects: defineTable({
    orgId: v.optional(v.id("organizations")),
    namn: v.string(),
    beskrivning: v.string(),
    color: v.string(),
    order: v.optional(v.number()),
  }).index("by_org", ["orgId"]),
  tasks: defineTable({
    orgId: v.optional(v.id("organizations")),
    titel: v.string(),
    beskrivning: v.string(),
    projectId: v.id("projects"),
    status: v.string(),
    agareId: v.optional(v.id("users")),
    // Legacy free-text owner; see note on leads.agare.
    agare: v.optional(v.string()),
    prioritet: v.string(),
    archived: v.boolean(),
    archivedAt: v.optional(v.union(v.string(), v.null())),
    log: v.array(logEntry),
    order: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_agare", ["agareId"])
    .index("by_org", ["orgId"]),
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
  }).index("by_user", ["userId"]),
  notes: defineTable({
    orgId: v.optional(v.id("organizations")),
    contactId: v.id("contacts"),
    text: v.string(),
    authorId: v.optional(v.id("users")),
  })
    .index("by_contact", ["contactId"])
    .index("by_org", ["orgId"]),
  contactReads: defineTable({
    userId: v.id("users"),
    contactId: v.id("contacts"),
    lastReadAt: v.number(),
  }).index("by_user_contact", ["userId", "contactId"]),
  settings: defineTable({
    orgId: v.optional(v.id("organizations")),
    archiveDays: v.number(),
    pileThreshold: v.number(),
  }).index("by_org", ["orgId"]),
});
```

- [ ] **Step 2: Typecheck the schema**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). If `authTables.users.validator.fields` errors, it means the installed auth version differs — confirm the field path against `node_modules/@convex-dev/auth/dist/server/implementation/types.js`.

- [ ] **Step 3: Run the existing suite to confirm nothing broke**

Run: `npm test`
Expected: All existing tests still PASS (handlers still use `requireAuth`; optional `orgId` doesn't break inserts).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add organizations, memberships, optional orgId (widen)"
```

---

### Task 2: Shared test fixture `setupOrg`

**Files:**
- Create: `convex/testHelpers.ts`

- [ ] **Step 1: Write the fixture**

`requireOrg` (added in Task 6) needs a real user row with `activeOrgId` plus a membership, and an identity whose `subject` is `"<userId>|<session>"` (the format `getAuthUserId` parses — see existing `users.test.ts`).

```ts
import { convexTest } from "convex-test";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

export const modules = import.meta.glob("./**/*.ts");

/**
 * Create an org + a member user and return a client acting as that user.
 * Use the returned `as` client for api calls; mutations will stamp `orgId`
 * from the user's active org automatically.
 */
export async function setupOrg(
  t: ReturnType<typeof convexTest>,
  opts?: { namn?: string; joinCode?: string; email?: string },
) {
  const { orgId, userId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", {
      namn: opts?.namn ?? "Testorg",
      joinCode: opts?.joinCode ?? "TESTCODE",
    });
    const userId = await ctx.db.insert("users", {
      email: opts?.email ?? "user@firma.se",
      activeOrgId: orgId,
    });
    await ctx.db.insert("memberships", { userId, orgId });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  return { orgId: orgId as Id<"organizations">, userId: userId as Id<"users">, as };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/testHelpers.ts
git commit -m "test: add setupOrg fixture for org-scoped tests"
```

---

### Task 3: Add `requireOrg` to helpers

**Files:**
- Modify: `convex/helpers.ts`

- [ ] **Step 1: Add `requireOrg` (keep `requireAuth` until all callers migrate)**

```ts
import { Auth } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "./_generated/server";

// All functions require a signed-in user, but data is shared (not filtered per user).
export async function requireAuth(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Inte inloggad");
  return identity;
}

// Resolve the caller's active organization and verify membership.
// Returns the signed-in userId and the orgId all data must be scoped to.
export async function requireOrg(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Inte inloggad");
  const user = await ctx.db.get("users", userId);
  const orgId = user?.activeOrgId;
  if (!orgId) throw new Error("Ingen aktiv organisation");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
    .first();
  if (!membership) throw new Error("Ingen åtkomst till organisationen");
  return { userId, orgId };
}

export const PROJECT_COLORS = [
  "#6b8aa8", "#c45b32", "#8a6fa8", "#4f7a52", "#c8923a", "#3f7e8c", "#a8567a",
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add convex/helpers.ts
git commit -m "feat(helpers): add requireOrg active-org resolver"
```

---

### Task 4: `genJoinCode` + `findByCode` internal query

**Files:**
- Create: `convex/organizations.ts`
- Test: `convex/organizations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("findByCode returns the org for a known code, null otherwise", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "ABC123" }),
  );
  const hit = await t.query(internal.organizations.findByCode, { code: "ABC123" });
  expect(hit?._id).toBe(orgId);
  const miss = await t.query(internal.organizations.findByCode, { code: "NOPE" });
  expect(miss).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run convex/organizations.test.ts`
Expected: FAIL ("internal.organizations.findByCode is not a function" / module missing).

- [ ] **Step 3: Create the module with the helper and internal query**

```ts
import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Unambiguous alphabet (no I/O/0/1). Math.random is allowed in Convex mutations.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

// Generate a join code not currently in use.
async function genJoinCode(ctx: { db: any }): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const clash = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q: any) => q.eq("joinCode", code))
      .first();
    if (!clash) return code;
  }
  throw new Error("Kunde inte generera unik kod");
}

export const findByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim()))
      .first();
  },
});
```

> Note: the `requireOrg` import is added in the lifecycle task (Task 6) where `rotateCode`/`current` need it; `findByCode` and `create` use only `getAuthUserId`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex/organizations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/organizations.ts convex/organizations.test.ts
git commit -m "feat(organizations): join-code generator and findByCode lookup"
```

---

### Task 5: `organizations.create`

**Files:**
- Modify: `convex/organizations.ts`
- Test: `convex/organizations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test("create makes an org, a membership, and sets it active", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "founder@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  const { orgId, joinCode } = await as.mutation(api.organizations.create, { namn: "Min Org" });
  expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);
  const state = await t.run(async (ctx) => {
    const user = await ctx.db.get("users", userId);
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    return { activeOrgId: user?.activeOrgId, hasMembership: !!membership };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run convex/organizations.test.ts -t "create makes an org"`
Expected: FAIL ("api.organizations.create is not a function").

- [ ] **Step 3: Add `create`**

```ts
export const create = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const joinCode = await genJoinCode(ctx);
    const orgId = await ctx.db.insert("organizations", { namn: namn.trim() || "Organisation", joinCode });
    await ctx.db.insert("memberships", { userId, orgId });
    await ctx.db.patch("users", userId, { activeOrgId: orgId });
    return { orgId, joinCode };
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex/organizations.test.ts -t "create makes an org"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/organizations.ts convex/organizations.test.ts
git commit -m "feat(organizations): create org with membership and active pointer"
```

---

### Task 6: `join`, `setActive`, `rotateCode`, `myOrgs`, `current`

**Files:**
- Modify: `convex/organizations.ts`
- Test: `convex/organizations.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("join adds a membership by code and switches active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "B", joinCode: "JOINME1" }));
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await as.mutation(api.organizations.join, { code: "JOINME1" });
  const user = await t.run((ctx) => ctx.db.get("users", userId));
  expect(user?.activeOrgId).toBe(orgId);
});

test("join rejects an unknown code", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.join, { code: "BADCODE0" })).rejects.toThrow("Ogiltig kod");
});

test("setActive rejects an org the user is not a member of", async () => {
  const t = convexTest(schema, modules);
  const otherOrg = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Other", joinCode: "OTHER111" }));
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "x@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.setActive, { orgId: otherOrg })).rejects.toThrow();
});

test("rotateCode replaces the active org's join code", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) => ctx.db.insert("organizations", { namn: "C", joinCode: "OLDCODE1" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: uid, orgId });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  const { joinCode } = await as.mutation(api.organizations.rotateCode, {});
  expect(joinCode).not.toBe("OLDCODE1");
  const org = await t.run((ctx) => ctx.db.get("organizations", orgId));
  expect(org?.joinCode).toBe(joinCode);
});

test("myOrgs lists the user's orgs and the active one", async () => {
  const t = convexTest(schema, modules);
  const o1 = await t.run((ctx) => ctx.db.insert("organizations", { namn: "One", joinCode: "ONEONE11" }));
  const o2 = await t.run((ctx) => ctx.db.insert("organizations", { namn: "Two", joinCode: "TWOTWO11" }));
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", { email: "x@firma.se", activeOrgId: o1 });
    await ctx.db.insert("memberships", { userId: uid, orgId: o1 });
    await ctx.db.insert("memberships", { userId: uid, orgId: o2 });
    return uid;
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  const result = await as.query(api.organizations.myOrgs, {});
  expect(result.activeOrgId).toBe(o1);
  expect(result.orgs.map((o) => o._id).sort()).toEqual([o1, o2].sort());
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run convex/organizations.test.ts`
Expected: FAIL (the new functions don't exist yet).

- [ ] **Step 3: Add the functions**

Add the `requireOrg` import at the top of `convex/organizations.ts` if not already present:

```ts
import { requireOrg } from "./helpers";
```

Then append:

```ts
export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim()))
      .first();
    if (!org) throw new Error("Ogiltig kod");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", org._id))
      .first();
    if (!existing) await ctx.db.insert("memberships", { userId, orgId: org._id });
    await ctx.db.patch("users", userId, { activeOrgId: org._id });
    return { orgId: org._id, namn: org.namn };
  },
});

export const setActive = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    if (!membership) throw new Error("Ingen åtkomst till organisationen");
    await ctx.db.patch("users", userId, { activeOrgId: orgId });
  },
});

export const rotateCode = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const joinCode = await genJoinCode(ctx);
    await ctx.db.patch("organizations", orgId, { joinCode });
    return { joinCode };
  },
});

export const myOrgs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { activeOrgId: null, orgs: [] };
    const user = await ctx.db.get("users", userId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const orgs = [];
    for (const m of memberships) {
      const org = await ctx.db.get("organizations", m.orgId);
      if (org) orgs.push({ _id: org._id, namn: org.namn });
    }
    return { activeOrgId: user?.activeOrgId ?? null, orgs };
  },
});

// The active org's display details, including the join code to share.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const org = await ctx.db.get("organizations", orgId);
    return org ? { _id: org._id, namn: org.namn, joinCode: org.joinCode } : null;
  },
});
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run convex/organizations.test.ts`
Expected: PASS (all org tests).

- [ ] **Step 5: Commit**

```bash
git add convex/organizations.ts convex/organizations.test.ts
git commit -m "feat(organizations): join, setActive, rotateCode, myOrgs, current"
```

---

## Phase 2 — Enforce org scoping per module

### Task 7: Scope `leads`

**Files:**
- Modify: `convex/leads.ts`
- Test: `convex/leads.test.ts`

- [ ] **Step 1: Update the existing tests to use `setupOrg` and add an isolation test**

Replace the entire contents of `convex/leads.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./testHelpers";

test("leads.create logs the initial stage", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.log).toHaveLength(1);
  expect(lead.log[0]).toMatchObject({ from: null, to: "Lead" });
});

test("leads.move appends a stage-change log entry", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t);
  const id = await as.mutation(api.leads.create, {
    titel: "X", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  await as.mutation(api.leads.move, { id, steg: "Kvalificerat" });
  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === id)!;
  expect(lead.steg).toBe("Kvalificerat");
  expect(lead.log.at(-1)).toMatchObject({ from: "Lead", to: "Kvalificerat" });
});

test("leads.list only returns the active org's leads", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA1111", email: "a@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB1111", email: "b@firma.se" });
  await orgA.as.mutation(api.leads.create, {
    titel: "A-lead", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  const bList = await orgB.as.query(api.leads.list, {});
  expect(bList).toHaveLength(0);
  const aList = await orgA.as.query(api.leads.list, {});
  expect(aList.map((l) => l.titel)).toEqual(["A-lead"]);
});

test("leads.update refuses a lead from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "ORGA2222", email: "a2@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "ORGB2222", email: "b2@firma.se" });
  const id = await orgA.as.mutation(api.leads.create, {
    titel: "Secret", beskrivning: "", sannolikhet: 10, datum: "2026-06-16", steg: "Lead",
  });
  await expect(
    orgB.as.mutation(api.leads.update, {
      id, titel: "Hacked", beskrivning: "", sannolikhet: 99, datum: "2026-06-16", steg: "Lead",
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/leads.test.ts`
Expected: FAIL (handlers still use `requireAuth`; no `orgId` stamped/filtered; isolation test fails).

- [ ] **Step 3: Rewrite `convex/leads.ts` to scope by org**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  contactId: v.optional(v.id("contacts")),
  sannolikhet: v.number(),
  agareId: v.optional(v.id("users")),
  datum: v.string(),
  steg: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.steg }];
    return await ctx.db.insert("leads", { ...args, orgId, log, order: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("leads"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Lead saknas");
    const log = [...prev.log];
    if (prev.steg !== patch.steg) {
      log.push({ ts: new Date().toISOString(), from: prev.steg, to: patch.steg });
    }
    await ctx.db.patch("leads", id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("leads"), steg: v.string(), order: v.optional(v.number()) },
  handler: async (ctx, { id, steg, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId || prev.steg === steg) return;
    const log = [...prev.log, { ts: new Date().toISOString(), from: prev.steg, to: steg }];
    await ctx.db.patch("leads", id, { steg, log, ...(order !== undefined ? { order } : {}) });
  },
});

export const reorder = mutation({
  args: { id: v.id("leads"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("leads", id, { order });
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("leads", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("leads", id);
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/leads.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/leads.ts convex/leads.test.ts
git commit -m "feat(leads): scope all reads and writes to the active org"
```

---

### Task 8: Scope `projects`

**Files:**
- Modify: `convex/projects.ts`
- Test: `convex/projects.test.ts`

- [ ] **Step 1: Update `convex/projects.test.ts` to use `setupOrg` + add an isolation test**

Read the current `convex/projects.test.ts` first, then replace each `t.withIdentity({ name: "Test" })` with `const { as } = await setupOrg(t);` (import `setupOrg, modules` from `./testHelpers` and drop the local `modules` glob and `withIdentity` lines), and use `as.mutation`/`as.query`. Append:

```ts
test("projects.list only returns the active org's projects", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "PRJA1111", email: "pa@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "PRJB1111", email: "pb@firma.se" });
  await orgA.as.mutation(api.projects.create, { namn: "A-proj", beskrivning: "" });
  expect(await orgB.as.query(api.projects.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.projects.list, {})).map((p) => p.namn)).toEqual(["A-proj"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/projects.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `convex/projects.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg, PROJECT_COLORS } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

export const create = mutation({
  args: { namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    // Pick the first palette color not already in use within this org.
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const used = new Set(existing.map((p) => p.color));
    const color =
      PROJECT_COLORS.find((c) => !used.has(c)) ??
      PROJECT_COLORS[existing.length % PROJECT_COLORS.length];
    return await ctx.db.insert("projects", { ...args, orgId, color, order: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("projects"), namn: v.string(), beskrivning: v.string() },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Projekt saknas");
    await ctx.db.patch("projects", id, patch);
  },
});

export const reorder = mutation({
  args: { id: v.id("projects"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("projects", id, { order });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("projects", id);
    if (!prev || prev.orgId !== orgId) return;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const t of tasks) await ctx.db.delete("tasks", t._id);
    await ctx.db.delete("projects", id);
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/projects.ts convex/projects.test.ts
git commit -m "feat(projects): scope reads and writes to the active org"
```

---

### Task 9: Scope `tasks`

**Files:**
- Modify: `convex/tasks.ts`
- Test: `convex/tasks.test.ts`

- [ ] **Step 1: Update `convex/tasks.test.ts` to use `setupOrg` + add an isolation test**

Read the current `convex/tasks.test.ts`, swap `withIdentity` for `setupOrg` (import `setupOrg, modules` from `./testHelpers`, drop the local glob), and append:

```ts
test("tasks.list only returns the active org's tasks", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "TSKA1111", email: "ta@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "TSKB1111", email: "tb@firma.se" });
  const projectId = await orgA.as.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  await orgA.as.mutation(api.tasks.create, {
    titel: "A-task", beskrivning: "", projectId, status: "Backlog", prioritet: "Normal",
  });
  expect(await orgB.as.query(api.tasks.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.tasks.list, {})).map((x) => x.titel)).toEqual(["A-task"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/tasks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `convex/tasks.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows.sort((a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime));
  },
});

const fields = {
  titel: v.string(),
  beskrivning: v.string(),
  projectId: v.id("projects"),
  status: v.string(),
  agareId: v.optional(v.id("users")),
  prioritet: v.string(),
};

export const create = mutation({
  args: fields,
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    const log = [{ ts: new Date().toISOString(), from: null, to: args.status }];
    return await ctx.db.insert("tasks", { ...args, orgId, archived: false, archivedAt: null, log, order: Date.now() });
  },
});

export const update = mutation({
  args: { id: v.id("tasks"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Uppgift saknas");
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== patch.projectId) {
      const fromP = await ctx.db.get("projects", prev.projectId);
      const toP = await ctx.db.get("projects", patch.projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== patch.status) {
      log.push({ ts, from: prev.status, to: patch.status });
    }
    await ctx.db.patch("tasks", id, { ...patch, log });
  },
});

export const move = mutation({
  args: { id: v.id("tasks"), projectId: v.id("projects"), status: v.string(), order: v.optional(v.number()) },
  handler: async (ctx, { id, projectId, status, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev || prev.orgId !== orgId) return;
    if (prev.projectId === projectId && prev.status === status) return;
    const log = [...prev.log];
    const ts = new Date().toISOString();
    if (prev.projectId !== projectId) {
      const fromP = await ctx.db.get("projects", prev.projectId);
      const toP = await ctx.db.get("projects", projectId);
      log.push({ ts, fromProject: fromP?.namn ?? "—", toProject: toP?.namn ?? "—" });
    }
    if (prev.status !== status) {
      log.push({ ts, from: prev.status, to: status });
    }
    await ctx.db.patch("tasks", id, { projectId, status, log, ...(order !== undefined ? { order } : {}) });
  },
});

export const reorder = mutation({
  args: { id: v.id("tasks"), order: v.number() },
  handler: async (ctx, { id, order }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.patch("tasks", id, { order });
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("tasks", id);
  },
});

export const restore = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("tasks", id);
    if (!prev || prev.orgId !== orgId) return;
    const log = [...prev.log, { ts: new Date().toISOString(), restored: true }];
    await ctx.db.patch("tasks", id, { archived: false, archivedAt: null, log });
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/tasks.test.ts convex/reorder.test.ts`
Expected: PASS. (`reorder.test.ts` also exercises `tasks`/`projects` — update it in the next step if it still uses `withIdentity`.)

- [ ] **Step 5: Update `convex/reorder.test.ts` to use `setupOrg`**

Replace its two `const u = t.withIdentity({ name: "Test" })` lines with `const { as: u } = await setupOrg(t, { joinCode: ... });` (unique code per test), import `setupOrg, modules` from `./testHelpers`, and drop the local `modules` glob. Run: `npx vitest run convex/reorder.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/tasks.ts convex/tasks.test.ts convex/reorder.test.ts
git commit -m "feat(tasks): scope reads and writes to the active org"
```

---

### Task 10: Scope `contacts` and `notes`

**Files:**
- Modify: `convex/contacts.ts`, `convex/notes.ts`
- Test: `convex/contacts.test.ts`, `convex/notes.test.ts`

- [ ] **Step 1: Update both test files to use `setupOrg` + add isolation tests**

Read `convex/contacts.test.ts` and `convex/notes.test.ts`, swap `withIdentity` for `setupOrg` (import `setupOrg, modules` from `./testHelpers`). Add to `convex/contacts.test.ts`:

```ts
test("contacts.list only returns the active org's contacts", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "CNTA1111", email: "ca@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "CNTB1111", email: "cb@firma.se" });
  await orgA.as.mutation(api.contacts.create, { namn: "A", foretag: "", epost: "", telefon: "" });
  expect(await orgB.as.query(api.contacts.list, {})).toHaveLength(0);
  expect((await orgA.as.query(api.contacts.list, {})).map((c) => c.namn)).toEqual(["A"]);
});
```

Add to `convex/notes.test.ts`:

```ts
test("notes.listByContact refuses a contact from another org", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "NOTA1111", email: "na@firma.se" });
  const orgB = await setupOrg(t, { joinCode: "NOTB1111", email: "nb@firma.se" });
  const contactId = await orgA.as.mutation(api.contacts.create, { namn: "A", foretag: "", epost: "", telefon: "" });
  await expect(orgB.as.query(api.notes.listByContact, { contactId })).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/contacts.test.ts convex/notes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `convex/contacts.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { userId, orgId } = await requireOrg(ctx);
    // CRM displays the org's contact list. Each contact is augmented with the
    // timestamp of its most recent note (for sorting) and whether the current
    // user has an unread note (newer than their last read of that contact).
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const lastNoteAt = new Map<string, number>();
    for (const n of notes) {
      const cur = lastNoteAt.get(n.contactId) ?? 0;
      if (n._creationTime > cur) lastNoteAt.set(n.contactId, n._creationTime);
    }
    const reads = await ctx.db
      .query("contactReads")
      .withIndex("by_user_contact", (q) => q.eq("userId", userId))
      .collect();
    const readAt = new Map(reads.map((r) => [r.contactId, r.lastReadAt]));
    return contacts.map((c) => {
      const last = lastNoteAt.get(c._id) ?? null;
      return {
        ...c,
        lastNoteAt: last,
        hasUnread: last !== null && last > (readAt.get(c._id) ?? 0),
      };
    });
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
    const { orgId } = await requireOrg(ctx);
    return await ctx.db.insert("contacts", { ...args, orgId });
  },
});

export const update = mutation({
  args: { id: v.id("contacts"), ...fields },
  handler: async (ctx, { id, ...patch }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
    await ctx.db.patch("contacts", id, patch);
  },
});

export const markRead = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const { userId, orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", id);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
    const existing = await ctx.db
      .query("contactReads")
      .withIndex("by_user_contact", (q) => q.eq("userId", userId).eq("contactId", id))
      .first();
    const lastReadAt = Date.now();
    if (existing) await ctx.db.patch("contactReads", existing._id, { lastReadAt });
    else await ctx.db.insert("contactReads", { userId, contactId: id, lastReadAt });
  },
});

export const setReminder = mutation({
  args: {
    id: v.id("contacts"),
    agareId: v.optional(v.id("users")),
    datum: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { id, agareId, datum, text }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
    await ctx.db.patch("contacts", id, {
      reminderAgareId: agareId,
      reminderDatum: datum,
      reminderText: text.trim(),
    });
  },
});

export const clearReminder = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) throw new Error("Kontakt saknas");
    await ctx.db.patch("contacts", id, {
      reminderAgareId: undefined,
      reminderDatum: undefined,
      reminderText: undefined,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("contacts", id);
    if (!prev || prev.orgId !== orgId) return;
    const linked = await ctx.db
      .query("leads")
      .withIndex("by_contact", (q) => q.eq("contactId", id))
      .collect();
    for (const l of linked) await ctx.db.patch("leads", l._id, { contactId: undefined });
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", id))
      .collect();
    for (const n of notes) await ctx.db.delete("notes", n._id);
    // Read markers aren't indexed by contact alone; scan and drop this contact's.
    const reads = await ctx.db.query("contactReads").collect();
    for (const r of reads) if (r.contactId === id) await ctx.db.delete("contactReads", r._id);
    await ctx.db.delete("contacts", id);
  },
});
```

- [ ] **Step 4: Rewrite `convex/notes.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

export const listByContact = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, { contactId }) => {
    const { orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", contactId);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_contact", (q) => q.eq("contactId", contactId))
      .collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const add = mutation({
  args: { contactId: v.id("contacts"), text: v.string() },
  handler: async (ctx, { contactId, text }) => {
    const { userId, orgId } = await requireOrg(ctx);
    const contact = await ctx.db.get("contacts", contactId);
    if (!contact || contact.orgId !== orgId) throw new Error("Kontakt saknas");
    const trimmed = text.trim();
    if (!trimmed) return;
    await ctx.db.insert("notes", { contactId, text: trimmed, authorId: userId, orgId });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireOrg(ctx);
    const prev = await ctx.db.get("notes", id);
    if (!prev || prev.orgId !== orgId) return;
    await ctx.db.delete("notes", id);
  },
});
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run convex/contacts.test.ts convex/notes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/contacts.ts convex/notes.ts convex/contacts.test.ts convex/notes.test.ts
git commit -m "feat(contacts,notes): scope reads and writes to the active org"
```

---

### Task 11: Scope `settings` (one row per org) and expose the join code

**Files:**
- Modify: `convex/settings.ts`
- Test: `convex/settings.test.ts` (create if it doesn't exist)

- [ ] **Step 1: Write/extend the test**

Create or append to `convex/settings.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./testHelpers";

test("settings default per org, then persist independently", async () => {
  const t = convexTest(schema, modules);
  const orgA = await setupOrg(t, { joinCode: "SETA1111", email: "sa@firma.se", namn: "A" });
  const orgB = await setupOrg(t, { joinCode: "SETB1111", email: "sb@firma.se", namn: "B" });
  // Defaults before any save.
  expect(await orgA.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 3, pileThreshold: 3 });
  await orgA.as.mutation(api.settings.set, { archiveDays: 10, pileThreshold: 7 });
  expect(await orgA.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 10, pileThreshold: 7 });
  // Org B is unaffected.
  expect(await orgB.as.query(api.settings.get, {})).toMatchObject({ archiveDays: 3, pileThreshold: 3 });
});

test("settings.get returns the org's join code", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t, { joinCode: "SETC1111", email: "sc@firma.se" });
  expect((await as.query(api.settings.get, {})).joinCode).toBe("SETC1111");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `convex/settings.ts`**

The `signupCode` (from env) is replaced by the org's `joinCode`. A helper finds the org's settings row.

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrg } from "./helpers";

const DEFAULTS = { archiveDays: 3, pileThreshold: 3 };

export const get = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    const base = row
      ? { archiveDays: row.archiveDays, pileThreshold: row.pileThreshold }
      : DEFAULTS;
    const org = await ctx.db.get("organizations", orgId);
    return { ...base, joinCode: org?.joinCode ?? null };
  },
});

export const set = mutation({
  args: { archiveDays: v.number(), pileThreshold: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrg(ctx);
    // Clamp server-side so the invariant holds regardless of caller.
    const clean = {
      archiveDays: Math.max(0, args.archiveDays),
      pileThreshold: Math.max(0, args.pileThreshold),
    };
    const row = await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    if (row) await ctx.db.patch("settings", row._id, clean);
    else await ctx.db.insert("settings", { ...clean, orgId });
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/settings.ts convex/settings.test.ts
git commit -m "feat(settings): per-org settings and join-code exposure"
```

---

### Task 12: `users.list` → org members; `users.remove` → `removeMember`

**Files:**
- Modify: `convex/users.ts`
- Test: `convex/users.test.ts`

- [ ] **Step 1: Replace `convex/users.test.ts`**

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { setupOrg, modules } from "./testHelpers";

test("users.list returns only members of the active org with displayName", async () => {
  const t = convexTest(schema, modules);
  const { orgId, userId, as } = await setupOrg(t, { joinCode: "USRA1111", email: "anna@firma.se" });
  const other = await t.run(async (ctx) => {
    // A member of the same org.
    const b = await ctx.db.insert("users", { email: "bo@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: b, orgId });
    await ctx.db.insert("userProfiles", { userId: b, displayName: "Bo B" });
    // A user in a different org — must not appear.
    const otherOrg = await ctx.db.insert("organizations", { namn: "Other", joinCode: "ELSE1111" });
    const c = await ctx.db.insert("users", { email: "carl@other.se", activeOrgId: otherOrg });
    await ctx.db.insert("memberships", { userId: c, orgId: otherOrg });
    return { b, c };
  });
  const list = await as.query(api.users.list, {});
  const emails = list.map((u) => u.email).sort();
  expect(emails).toEqual(["anna@firma.se", "bo@firma.se"]);
  expect(list.find((u) => u.email === "bo@firma.se")!.displayName).toBe("Bo B");
  expect(list.find((u) => u._id === userId)!.isSelf).toBe(true);
  void other;
});

test("users.viewer returns the email", async () => {
  const t = convexTest(schema, modules);
  const { as } = await setupOrg(t, { joinCode: "USRV1111", email: "v@firma.se" });
  expect(await as.query(api.users.viewer, {})).toMatchObject({ email: "v@firma.se" });
});

test("removeMember detaches a member and nulls their ownership in the org", async () => {
  const t = convexTest(schema, modules);
  const { orgId, as } = await setupOrg(t, { joinCode: "USRR1111", email: "me@firma.se" });
  const victim = await t.run(async (ctx) => {
    const v = await ctx.db.insert("users", { email: "v@firma.se", activeOrgId: orgId });
    await ctx.db.insert("memberships", { userId: v, orgId });
    return v;
  });
  const projectId = await as.mutation(api.projects.create, { namn: "P", beskrivning: "" });
  const leadId = await as.mutation(api.leads.create, {
    titel: "L", beskrivning: "", sannolikhet: 10, agareId: victim, datum: "2026-06-17", steg: "Lead",
  });
  const taskId = await as.mutation(api.tasks.create, {
    titel: "T", beskrivning: "", projectId, status: "Backlog", agareId: victim, prioritet: "Normal",
  });

  await as.mutation(api.users.removeMember, { userId: victim });

  const lead = (await as.query(api.leads.list, {})).find((l) => l._id === leadId)!;
  const task = (await as.query(api.tasks.list, {})).find((x) => x._id === taskId)!;
  expect(lead.agareId).toBeUndefined();
  expect(task.agareId).toBeUndefined();
  const stillMember = await t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", victim).eq("orgId", orgId))
      .first(),
  );
  expect(stillMember).toBeNull();
});

test("removeMember refuses removing yourself", async () => {
  const t = convexTest(schema, modules);
  const { userId, as } = await setupOrg(t, { joinCode: "USRS1111", email: "me@firma.se" });
  await expect(as.mutation(api.users.removeMember, { userId })).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/users.test.ts`
Expected: FAIL (`users.list` returns all users; `removeMember` doesn't exist).

- [ ] **Step 3: Rewrite `convex/users.ts`**

```ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOrg } from "./helpers";

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
    const { userId: me, orgId } = await requireOrg(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const profiles = await ctx.db.query("userProfiles").collect();
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    const out = [];
    for (const m of memberships) {
      const u = await ctx.db.get("users", m.userId);
      if (!u) continue;
      out.push({
        _id: u._id,
        email: u.email ?? null,
        displayName:
          nameById.get(u._id) || (u.email ? u.email.split("@")[0] : "Användare"),
        isSelf: u._id === me,
      });
    }
    return out;
  },
});

// Remove a user from the active org: delete their membership and null their
// ownership on this org's leads/tasks. Does not delete the user account.
export const removeMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: me, orgId } = await requireOrg(ctx);
    if (me === userId) throw new Error("Du kan inte ta bort dig själv");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    if (!membership) throw new Error("Användaren är inte med i organisationen");

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const l of leads) {
      if (l.orgId === orgId) await ctx.db.patch("leads", l._id, { agareId: undefined });
    }
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const tk of tasks) {
      if (tk.orgId === orgId) await ctx.db.patch("tasks", tk._id, { agareId: undefined });
    }

    await ctx.db.delete("memberships", membership._id);

    // If this was the user's active org, clear the pointer so they re-pick on next load.
    const removed = await ctx.db.get("users", userId);
    if (removed?.activeOrgId === orgId) {
      const another = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      await ctx.db.patch("users", userId, { activeOrgId: another?.orgId });
    }
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/users.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/users.ts convex/users.test.ts
git commit -m "feat(users): list org members and removeMember instead of account delete"
```

---

### Task 13: Signup code → org; per-org cron; seed a default org

**Files:**
- Modify: `convex/auth.ts`, `convex/crons.ts`, `convex/seed.ts`
- Test: `convex/auth.test.ts` (create), `convex/crons.test.ts` (update)

- [ ] **Step 1: Write the auth signup test**

Create `convex/auth.test.ts`. Sign up through the real auth action and assert a membership + `activeOrgId` were created. (convex-test supports `t.action(api.auth.signIn, ...)` with the Password provider.)

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./testHelpers";

test("signUp with a valid org code creates a membership and active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINACME" }),
  );
  await t.action(api.auth.signIn, {
    provider: "password",
    params: { email: "new@firma.se", password: "hunter2hunter", flow: "signUp", code: "JOINACME" },
  });
  const state = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "new@firma.se"))
      .first();
    const membership = user
      ? await ctx.db
          .query("memberships")
          .withIndex("by_user_org", (q) => q.eq("userId", user._id).eq("orgId", orgId))
          .first()
      : null;
    return { activeOrgId: user?.activeOrgId, hasMembership: !!membership };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
});

test("signUp with an unknown code is rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email: "x@firma.se", password: "hunter2hunter", flow: "signUp", code: "NOPECODE" },
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/auth.test.ts`
Expected: FAIL (current `auth.ts` checks `SIGNUP_CODE`, not an org code; no membership created).

- [ ] **Step 3: Rewrite `convex/auth.ts`**

`profile` resolves the org from the code on `signUp` (throws on a bad code) and returns `activeOrgId` so the new user doc carries it. `afterUserCreatedOrUpdated` creates the membership.

```ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // On sign-up the `code` must match an organization's join code; the new
      // user is enrolled into that org (membership created in the callback below).
      // Sign-in of existing accounts is unaffected (no code required).
      profile: async (params, ctx) => {
        const email = params.email as string;
        if (params.flow === "signUp") {
          const code = (params.code as string | undefined)?.trim();
          if (!code) throw new ConvexError("Organisationskod krävs");
          const org = await ctx.runQuery(internal.organizations.findByCode, { code });
          if (!org) throw new ConvexError("Ogiltig kod");
          return { email, activeOrgId: org._id };
        }
        return { email };
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, profile }) {
      const orgId = profile.activeOrgId as Id<"organizations"> | undefined;
      if (!orgId) return; // sign-in flow, nothing to attach
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
        .first();
      if (!existing) await ctx.db.insert("memberships", { userId, orgId });
    },
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS. If the action call shape differs in this auth version, confirm against `node_modules/@convex-dev/auth/dist/server` — the params object (`provider` + `params`) matches 0.0.94.

- [ ] **Step 5: Update the cron to archive per org**

Replace `convex/crons.ts`:

```ts
import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY_MS = 86400000;

// Archive Done tasks whose last move is older than each org's configured threshold.
export const archiveStaleDone = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    for (const org of orgs) {
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .first();
      const days = settings?.archiveDays ?? 3;
      if (!days || days <= 0) continue;
      const cutoff = Date.now() - days * DAY_MS;
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect();
      for (const t of tasks) {
        if (t.archived || t.status !== "Done") continue;
        const lastTs = t.log.length
          ? new Date(t.log[t.log.length - 1].ts).getTime()
          : t._creationTime;
        if (lastTs <= cutoff) {
          const now = new Date().toISOString();
          await ctx.db.patch("tasks", t._id, {
            archived: true,
            archivedAt: now,
            log: [...t.log, { ts: now, archived: true }],
          });
        }
      }
    }
  },
});

const crons = cronJobs();
crons.interval("archive stale done tasks", { hours: 24 }, internal.crons.archiveStaleDone, {});
export default crons;
```

- [ ] **Step 6: Update `convex/crons.test.ts`**

Read it; it currently builds tasks without an org. Update it to create an org + settings + a Done task with `orgId`, run `internal.crons.archiveStaleDone`, and assert the task is archived. Minimal shape:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./testHelpers";

test("archiveStaleDone archives old Done tasks per org", async () => {
  const t = convexTest(schema, modules);
  const { orgId, projectId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "O", joinCode: "CRON1111" });
    await ctx.db.insert("settings", { orgId, archiveDays: 1, pileThreshold: 3 });
    const projectId = await ctx.db.insert("projects", { orgId, namn: "P", beskrivning: "", color: "#000" });
    const old = new Date(Date.now() - 5 * 86400000).toISOString();
    await ctx.db.insert("tasks", {
      orgId, titel: "old done", beskrivning: "", projectId, status: "Done",
      prioritet: "Normal", archived: false, archivedAt: null,
      log: [{ ts: old, from: null, to: "Done" }],
    });
    return { orgId, projectId };
  });
  await t.mutation(internal.crons.archiveStaleDone, {});
  const archived = await t.run((ctx) =>
    ctx.db.query("tasks").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect(),
  );
  expect(archived[0].archived).toBe(true);
  void projectId;
});
```

> If `convex/crons.test.ts` has other existing tests, keep them but give each its tasks an `orgId` + a matching org/settings row.

- [ ] **Step 7: Update `convex/seed.ts` to create a default org and stamp `orgId`**

At the start of the handler (after the `already seeded` guard), create an org and thread `orgId` into every insert:

```ts
    // Seed runs on an empty deployment; create the org these rows belong to.
    const orgId = await ctx.db.insert("organizations", { namn: "Boköring", joinCode: "BOKORING" });
```

Then add `orgId` to each `ctx.db.insert("contacts", ...)`, `insert("leads", ...)`, `insert("projects", ...)`, and `insert("tasks", ...)` object in that file (e.g. `await ctx.db.insert("contacts", { orgId, ...data })`, and for projects `ctx.db.insert("projects", { orgId, ...data, color: ... })`, for leads/tasks add `orgId` to the inserted object). Leave the structure otherwise unchanged.

- [ ] **Step 8: Run the relevant suites**

Run: `npx vitest run convex/auth.test.ts convex/crons.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add convex/auth.ts convex/auth.test.ts convex/crons.ts convex/crons.test.ts convex/seed.ts
git commit -m "feat(auth,crons,seed): code-to-org signup, per-org archiving, seeded org"
```

---

## Phase 3 — Migration backfill

### Task 14: Additive, idempotent backfill + verify

**Files:**
- Create: `convex/migrations.ts`
- Test: `convex/migrations.test.ts`

- [ ] **Step 1: Write the test (org/membership creation + idempotency)**

The legacy-business-row fill (patching rows that lack `orgId`) cannot be unit-tested under the final required-`orgId` schema, so it is covered by the production verify gate (see Rollout note). Here we test the parts that survive narrowing: default-org creation, membership + `activeOrgId` for every user, and idempotency.

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./testHelpers";

test("backfillOrgs creates one default org and enrols every user, idempotently", async () => {
  const t = convexTest(schema, modules);
  const { u1, u2 } = await t.run(async (ctx) => {
    const u1 = await ctx.db.insert("users", { email: "a@firma.se" });
    const u2 = await ctx.db.insert("users", { email: "b@firma.se" });
    return { u1, u2 };
  });

  await t.mutation(internal.migrations.backfillOrgs, {});

  const after1 = await t.run(async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const u1doc = await ctx.db.get("users", u1);
    const u2doc = await ctx.db.get("users", u2);
    const memberships = await ctx.db.query("memberships").collect();
    return { orgCount: orgs.length, a: u1doc?.activeOrgId, b: u2doc?.activeOrgId, mCount: memberships.length };
  });
  expect(after1.orgCount).toBe(1);
  expect(after1.a).toBeDefined();
  expect(after1.b).toBe(after1.a);
  expect(after1.mCount).toBe(2);

  // Re-running changes nothing.
  await t.mutation(internal.migrations.backfillOrgs, {});
  const after2 = await t.run(async (ctx) => ({
    orgCount: (await ctx.db.query("organizations").collect()).length,
    mCount: (await ctx.db.query("memberships").collect()).length,
  }));
  expect(after2).toEqual({ orgCount: 1, mCount: 2 });
});

test("verifyOrgs reports clean once backfill has run", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: "a@firma.se" }));
  await t.mutation(internal.migrations.backfillOrgs, {});
  const report = await t.query(internal.migrations.verifyOrgs, {});
  expect(report.usersMissingMembership).toBe(0);
  expect(report.rowsMissingOrgId).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/migrations.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `convex/migrations.ts`**

```ts
import { internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_ORG_NAME = "Boköring";
const DEFAULT_JOIN_CODE = "BOKORING";

const BUSINESS_TABLES = ["contacts", "leads", "projects", "tasks", "notes", "settings"] as const;

// Find or create the single default org all legacy data is assigned to.
async function ensureDefaultOrg(ctx: any) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_joinCode", (q: any) => q.eq("joinCode", DEFAULT_JOIN_CODE))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("organizations", {
    namn: DEFAULT_ORG_NAME,
    joinCode: DEFAULT_JOIN_CODE,
  });
}

// Additive backfill: assigns orgId to legacy rows, enrols all users.
// Never deletes or overwrites existing values. Safe to run repeatedly.
export const backfillOrgs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgId = await ensureDefaultOrg(ctx);

    for (const table of BUSINESS_TABLES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if ((row as any).orgId === undefined) {
          await ctx.db.patch(table, row._id, { orgId } as any);
        }
      }
    }

    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_user_org", (q: any) => q.eq("userId", user._id).eq("orgId", orgId))
        .first();
      if (!membership) await ctx.db.insert("memberships", { userId: user._id, orgId });
      if (user.activeOrgId === undefined) {
        await ctx.db.patch("users", user._id, { activeOrgId: orgId });
      }
    }

    return { orgId };
  },
});

// Read-only gate: confirm no legacy rows or users are left unassigned.
export const verifyOrgs = internalQuery({
  args: {},
  handler: async (ctx) => {
    let rowsMissingOrgId = 0;
    for (const table of BUSINESS_TABLES) {
      const rows = await ctx.db.query(table).collect();
      rowsMissingOrgId += rows.filter((r: any) => r.orgId === undefined).length;
    }
    const users = await ctx.db.query("users").collect();
    let usersMissingMembership = 0;
    for (const user of users) {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .first();
      if (!m || user.activeOrgId === undefined) usersMissingMembership += 1;
    }
    return { rowsMissingOrgId, usersMissingMembership };
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run convex/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 6: Commit**

```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat(migrations): additive idempotent org backfill + verify gate"
```

---

## Phase 4 — Frontend

### Task 15: Org context provider

**Files:**
- Create: `src/context/OrgContext.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/context/OrgContext.tsx`**

```tsx
import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type Org = { _id: string; namn: string };
type OrgState = { activeOrgId: string | null; orgs: Org[]; loading: boolean };

const OrgCtx = createContext<OrgState>({ activeOrgId: null, orgs: [], loading: true });

export function OrgProvider({ children }: { children: ReactNode }) {
  const data = useQuery(api.organizations.myOrgs);
  const value: OrgState = data
    ? { activeOrgId: data.activeOrgId, orgs: data.orgs, loading: false }
    : { activeOrgId: null, orgs: [], loading: true };
  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>;
}

export function useOrg() {
  return useContext(OrgCtx);
}
```

- [ ] **Step 2: Wrap the authenticated app in `OrgProvider`**

In `src/App.tsx`, import it and wrap `Workspace` inside the existing providers:

```tsx
import { OrgProvider } from "./context/OrgContext";
```

Change the `<Authenticated>` block to:

```tsx
      <Authenticated>
        <ToastProvider>
          <ModalProvider>
            <OrgProvider>
              <Workspace />
            </OrgProvider>
          </ModalProvider>
        </ToastProvider>
      </Authenticated>
```

- [ ] **Step 3: Typecheck/build**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed).

- [ ] **Step 4: Commit**

```bash
git add src/context/OrgContext.tsx src/App.tsx
git commit -m "feat(web): org context provider"
```

---

### Task 16: Org switcher in the sidebar

**Files:**
- Create: `src/components/OrgSwitcher.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Write `src/components/OrgSwitcher.tsx`**

Shows a `<select>` when the user has 2+ orgs; otherwise just the active org's name.

```tsx
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOrg } from "../context/OrgContext";
import { Id } from "../../convex/_generated/dataModel";

export default function OrgSwitcher() {
  const { activeOrgId, orgs, loading } = useOrg();
  const setActive = useMutation(api.organizations.setActive);
  if (loading || orgs.length === 0) return null;

  const active = orgs.find((o) => o._id === activeOrgId);
  if (orgs.length === 1) {
    return <div className="org-name">{active?.namn ?? "Organisation"}</div>;
  }
  return (
    <select
      className="org-switcher"
      value={activeOrgId ?? ""}
      onChange={(e) => setActive({ orgId: e.target.value as Id<"organizations"> })}
    >
      {orgs.map((o) => (
        <option key={o._id} value={o._id}>{o.namn}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Render it in the sidebar brand area**

In `src/components/Sidebar.tsx`, import and place `<OrgSwitcher />` directly under the `brand` div:

```tsx
import OrgSwitcher from "./OrgSwitcher";
```

```tsx
      <div className="brand">
        <span className="mark">Boköring</span>
        <span className="dot"></span>
        <span className="sub">CRM</span>
      </div>
      <OrgSwitcher />
```

- [ ] **Step 3: Add minimal styles**

Append to `src/index.css`:

```css
.org-switcher,
.org-name {
  margin: 4px 0 10px;
  font-size: 13px;
  color: var(--ink, #2c2c2c);
}
.org-switcher {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line, #ddd);
  border-radius: 8px;
  background: transparent;
}
.org-name {
  font-weight: 600;
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/OrgSwitcher.tsx src/components/Sidebar.tsx src/index.css
git commit -m "feat(web): org switcher in sidebar"
```

---

### Task 17: Login copy + settings org panel

**Files:**
- Modify: `src/components/LoginScreen.tsx`, `src/components/settings/SettingsModal.tsx`

- [ ] **Step 1: Update login copy to "organisationskod"**

In `src/components/LoginScreen.tsx`:
- Change the signup label `<label>Registreringskod</label>` to `<label>Organisationskod</label>`.
- Change its input placeholder to `"Kod från din organisation"`.
- Change the signup error string to: `"Kunde inte registrera. Kontrollera organisationskoden och att lösenordet är minst 8 tecken."`

- [ ] **Step 2: Replace the SettingsModal "Registreringskod" section with an org panel**

In `src/components/settings/SettingsModal.tsx`:

Replace the `signupCode` query usage. The settings query now returns `joinCode` instead of `signupCode`, and there's a new `api.organizations.current`, `api.organizations.create`, `api.organizations.join`, `api.organizations.rotateCode`. Update the `SettingsBody` prop type:

```tsx
function SettingsBody({ initial }: { initial: { archiveDays: number; pileThreshold: number; joinCode: string | null } }) {
```

Add hooks near the other `useMutation` calls:

```tsx
  const rotateCode = useMutation(api.organizations.rotateCode);
  const createOrg = useMutation(api.organizations.create);
  const joinOrg = useMutation(api.organizations.join);
```

Replace the entire `<div className="section-label">Registreringskod</div>` field block (the one rendering `initial.signupCode`) with an organization section:

```tsx
        <div className="section-label" style={{ marginTop: "14px" }}>Organisation</div>
        <div className="field">
          <label>Organisationskod (för att bjuda in)</label>
          {initial.joinCode ? (
            <>
              <div style={{ display: "flex", gap: "8px" }}>
                <input type="text" readOnly value={initial.joinCode} style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={async () => {
                  try { await navigator.clipboard.writeText(initial.joinCode!); toast("Kod kopierad"); }
                  catch { toast("Kunde inte kopiera"); }
                }}>Kopiera</button>
                <button className="btn btn-ghost" onClick={async () => {
                  if (!confirm("Byt organisationskod? Den gamla koden slutar fungera.")) return;
                  await rotateCode({});
                  toast("Ny kod skapad");
                }}>Byt kod</button>
              </div>
              <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
                Dela koden med personer som ska gå med i organisationen.
              </div>
            </>
          ) : (
            <div className="muted" style={{ fontSize: "12.5px" }}>Ingen kod tillgänglig.</div>
          )}
        </div>
        <div className="field">
          <label>Skapa eller gå med i en organisation</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-ghost" onClick={async () => {
              const namn = prompt("Namn på den nya organisationen?");
              if (!namn) return;
              const { joinCode } = await createOrg({ namn });
              toast(`Organisation skapad · kod ${joinCode}`);
            }}>Ny organisation</button>
            <button className="btn btn-ghost" onClick={async () => {
              const code = prompt("Ange organisationskod att gå med i:");
              if (!code) return;
              try { await joinOrg({ code }); toast("Gick med i organisationen"); }
              catch { toast("Ogiltig kod"); }
            }}>Gå med via kod</button>
          </div>
        </div>
```

Remove the now-unused mailto block that referenced `signupCode`. (The `users` list section above still uses `removeUser` — rename that call to `removeMember`.)

- [ ] **Step 3: Rename the user-removal call**

In `src/components/settings/SettingsModal.tsx`, change:

```tsx
  const removeUser = useMutation(api.users.remove);
```
to
```tsx
  const removeMember = useMutation(api.users.removeMember);
```
and update the button handler call `await removeUser({ userId: u._id });` to `await removeMember({ userId: u._id });`. Update the confirm copy to: `Ta bort "${u.displayName}" från organisationen? Kort där hen är ansvarig blir utan ansvarig.`

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS (no references to `signupCode` or `api.users.remove` remain).

- [ ] **Step 5: Commit**

```bash
git add src/components/LoginScreen.tsx src/components/settings/SettingsModal.tsx
git commit -m "feat(web): organisationskod login copy and org settings panel"
```

---

## Phase 5 — Narrow the schema

### Task 18: Make `orgId` required

**Files:**
- Modify: `convex/schema.ts`

> Do this only after the suite is green and (in production) after the backfill + verify gate has passed. See the Rollout note.

- [ ] **Step 1: Change every business table's `orgId` from optional to required**

In `convex/schema.ts`, for `contacts`, `leads`, `projects`, `tasks`, `notes`, `settings`, change:

```ts
    orgId: v.optional(v.id("organizations")),
```
to
```ts
    orgId: v.id("organizations"),
```

Leave `users.activeOrgId` as `v.optional(...)` (a user genuinely may have no active org momentarily, e.g. after being removed from their last org).

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS. All fixtures create rows via org-scoped mutations or stamp `orgId` directly, so required `orgId` validates. The migration test's idempotency path still works (it inserts users only, which have optional `activeOrgId`).

- [ ] **Step 3: Build the frontend**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): require orgId on all business tables (narrow)"
```

---

## Final verification

- [ ] **Run the complete test suite**

Run: `npm test`
Expected: PASS — all backend modules including isolation tests.

- [ ] **Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Manual smoke (optional, against a dev deployment)**

1. `npx convex run seed:run` (fresh dev) → seeds the "Boköring" org (code `BOKORING`).
2. Sign up a second account with code `BOKORING` → lands in the same org, sees the seeded data.
3. In Settings → "Ny organisation" → confirm a new empty org with its own code; switch via the sidebar switcher; confirm data isolation (pipeline/contacts/tasks empty in the new org).
4. Sign up a third account with the new org's code → sees only the new org's data.
