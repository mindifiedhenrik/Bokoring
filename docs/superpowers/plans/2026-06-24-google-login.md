# Google Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Sign in with Google" alongside the existing email/password flow, routing new Google users through a post-login organization join screen.

**Architecture:** Add the Google OAuth provider to `@convex-dev/auth`. Because the app defines a custom `createOrUpdateUser` callback, the library's built-in email-account linking is bypassed, so the callback is reworked to (a) link a Google sign-in to an existing same-email user, (b) seed a display name from the Google profile, and (c) leave org enrollment untouched when there is no join code. The UI gains a Google button on the login screen and a new `JoinOrgScreen` gate, shown when an authenticated user has no active organization; that screen reuses the existing `organizations.join` mutation.

**Tech Stack:** Convex 1.41, `@convex-dev/auth` 0.0.94, `@auth/core` (Google provider), React 19, Vite, Vitest + convex-test.

---

## Background the implementer must know

- **db API:** This Convex version supports both `db.get(id)` and `db.get("table", id)` overloads (likewise `patch`/`insert`). `convex/auth.ts` uses the id-first form for `patch`; the rest of the app uses table-first. Match the surrounding file's style.
- **Custom callback bypasses linking:** In `@convex-dev/auth` 0.0.94, when `callbacks.createOrUpdateUser` is defined, the library's automatic "link by verified email" logic does NOT run (`node_modules/@convex-dev/auth/dist/server/implementation/users.js:14-21`). The callback's `existingUserId` is non-null only when an `authAccount` already exists for *this* provider. So Google linking to a prior password account must be done manually inside the callback.
- **OAuth profile shape:** The library strips the OAuth `id` before calling the callback (`.../implementation/index.js:207`). For Google the callback receives `profile = { name, email, image }`. All three are valid fields on the `users` table (it spreads `authTables.users.validator.fields`).
- **Provider discriminator:** The callback's second arg includes `type: "oauth" | "credentials" | ...`. Google → `"oauth"`, Password → `"credentials"`.
- **Existing join mutation:** `convex/organizations.ts` already exports `join({ code })` — validates the code via the `by_joinCode` index, creates the membership if missing (idempotent), and sets `activeOrgId`. The UI reuses this; do NOT add a new mutation.
- **Env vars / Google Cloud:** Real OAuth needs `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` set in the Convex deployment, and an authorized redirect URI of `https://<deployment>.convex.site/api/auth/callback/google` in the Google Cloud Console. This is operational setup (Task 6), not code.

## File structure

- **Modify** `convex/auth.ts` — add Google provider; add `findUserByEmail` helper (exported for tests); rework `createOrUpdateUser` for OAuth linking + display-name seeding.
- **Create** `convex/organizations.test.ts` — tests for `join` (valid / invalid / idempotent).
- **Modify** `convex/auth.test.ts` — tests for `findUserByEmail`.
- **Create** `src/components/JoinOrgScreen.tsx` — post-login join-code gate.
- **Modify** `src/App.tsx` — render `JoinOrgScreen` when authenticated but no active org.
- **Modify** `src/components/LoginScreen.tsx` — add the Google button + divider.
- **Modify** `src/index.css` — styles for the divider, Google button, and join screen (reusing existing `.login`/`.btn` classes).

---

## Task 1: Add `findUserByEmail` helper and test it

This is the riskiest new logic (account linking) and the only part of the Google path testable via convex-test, so build it first in isolation.

**Files:**
- Modify: `convex/auth.ts`
- Test: `convex/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `convex/auth.test.ts` (keep existing imports; add `findUserByEmail` to the import from `./auth`):

```ts
import { findUserByEmail } from "./auth";

test("findUserByEmail returns the single user with a matching email", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "anna@firma.se" }),
  );
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "anna@firma.se"));
  expect(found?._id).toBe(userId);
});

test("findUserByEmail returns null when no user matches", async () => {
  const t = convexTest(schema, modules);
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "nobody@firma.se"));
  expect(found).toBeNull();
});

test("findUserByEmail returns null when the email is ambiguous", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { email: "dup@firma.se" });
    await ctx.db.insert("users", { email: "dup@firma.se" });
  });
  const found = await t.run((ctx) => findUserByEmail(ctx.db, "dup@firma.se"));
  expect(found).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run convex/auth.test.ts`
Expected: FAIL — `findUserByEmail` is not exported / not a function.

- [ ] **Step 3: Implement `findUserByEmail`**

In `convex/auth.ts`, add the import for the reader type and the helper above the `convexAuth(...)` call:

```ts
import { DatabaseReader, DatabaseWriter } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// Find the unique existing user with this email. Returns null when none match
// or when the email is ambiguous (more than one user), mirroring the library's
// own "unique verified email" linking rule.
export async function findUserByEmail(
  db: DatabaseReader,
  email: string,
): Promise<Doc<"users"> | null> {
  const users = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  return users.length === 1 ? users[0] : null;
}
```

Note: `auth.ts` already imports `DatabaseWriter` and `Id` from the generated files; extend those imports rather than duplicating. Keep `DatabaseWriter` in the import even though this helper uses `DatabaseReader` — it is still used by the callback.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS (all three new tests + the two existing signUp tests).

- [ ] **Step 5: Commit**

```bash
git add convex/auth.ts convex/auth.test.ts
git commit -m "feat(auth): add findUserByEmail helper for account linking"
```

---

## Task 2: Add the Google provider and rework `createOrUpdateUser`

**Files:**
- Modify: `convex/auth.ts`

- [ ] **Step 1: Add the Google provider import and entry**

At the top of `convex/auth.ts` add:

```ts
import Google from "@auth/core/providers/google";
```

In the `providers: [ ... ]` array, add `Google` after the existing `Password({ ... })` entry:

```ts
  providers: [
    Password({
      // ...unchanged existing Password config...
    }),
    Google,
  ],
```

- [ ] **Step 2: Rework the `createOrUpdateUser` callback**

Replace the entire `createOrUpdateUser` callback body with the version below. Changes from the current code: destructure `type`; add the OAuth email-linking lookup; mark OAuth emails verified; seed `userProfiles.displayName` from the Google name on first creation. The password/join-code path is unchanged in behavior.

```ts
    async createOrUpdateUser(ctx, { existingUserId, type, profile }) {
      const db = ctx.db as unknown as DatabaseWriter;
      const joinCode = (profile as { joinCode?: string }).joinCode?.trim();
      let orgId: Id<"organizations"> | undefined;
      if (joinCode) {
        const org = await db
          .query("organizations")
          .withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode))
          .first();
        if (!org) throw new ConvexError("Ogiltig kod");
        orgId = org._id;
      }

      // Never persist the transient `joinCode` onto the user document.
      const { joinCode: _omit, ...rest } = profile as Record<string, unknown>;

      // A custom createOrUpdateUser bypasses the library's built-in email
      // linking, so do it ourselves: on an OAuth sign-in (Google verifies the
      // email) with no pre-existing account for this provider, link to the
      // unique existing user with the same email.
      let userId: Id<"users"> | null = (existingUserId as Id<"users"> | null) ?? null;
      if (userId === null && type === "oauth" && typeof rest.email === "string") {
        const linked = await findUserByEmail(db, rest.email);
        if (linked) userId = linked._id;
      }

      const userData = {
        ...rest,
        ...(orgId ? { activeOrgId: orgId } : null),
        // Google emails are verified; record it so future linking is automatic.
        ...(type === "oauth" ? { emailVerificationTime: Date.now() } : null),
      };

      let isNew = false;
      if (userId) {
        await db.patch(userId, userData);
      } else {
        userId = await db.insert("users", userData);
        isNew = true;
      }

      // Seed a display name from the Google profile on first creation.
      if (isNew && type === "oauth" && typeof rest.name === "string" && rest.name.trim()) {
        await db.insert("userProfiles", { userId, displayName: rest.name.trim() });
      }

      if (orgId) {
        const existing = await db
          .query("memberships")
          .withIndex("by_user_org", (q) => q.eq("userId", userId!).eq("orgId", orgId!))
          .first();
        if (!existing) await db.insert("memberships", { userId, orgId });
      }

      return userId;
    },
```

- [ ] **Step 3: Run the existing auth tests to verify the password path is unbroken**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS — the two existing signUp tests still pass (password sign-up with a valid code creates membership + active org; unknown code rejected), plus the three `findUserByEmail` tests from Task 1.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex --noEmit`
Expected: no errors. (If `convex/tsconfig.json` is not directly buildable this way, run `npx tsc --noEmit` from the repo root instead and confirm no new errors in `convex/auth.ts`.)

- [ ] **Step 5: Commit**

```bash
git add convex/auth.ts
git commit -m "feat(auth): add Google provider with manual account linking"
```

---

## Task 3: Tests for the `organizations.join` enrollment path

The post-login screen relies on `organizations.join`. Lock its behavior with tests (there are none today).

**Files:**
- Create: `convex/organizations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `convex/organizations.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.helpers";

test("join with a valid code enrolls the user and sets the active org", async () => {
  const t = convexTest(schema, modules);
  const { orgId, userId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINME01" });
    const userId = await ctx.db.insert("users", { email: "g@firma.se" });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: `${userId}|s` });

  const result = await as.mutation(api.organizations.join, { code: "JOINME01" });
  expect(result.orgId).toBe(orgId);

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

test("join with an unknown code is rejected", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "g@firma.se" }));
  const as = t.withIdentity({ subject: `${userId}|s` });
  await expect(as.mutation(api.organizations.join, { code: "NOPECODE" })).rejects.toThrow();
});

test("join is idempotent and does not create duplicate memberships", async () => {
  const t = convexTest(schema, modules);
  const { orgId, userId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINME02" });
    const userId = await ctx.db.insert("users", { email: "g@firma.se" });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: `${userId}|s` });

  await as.mutation(api.organizations.join, { code: "JOINME02" });
  await as.mutation(api.organizations.join, { code: "JOINME02" });

  const count = await t.run(async (ctx) => {
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .collect();
    return memberships.length;
  });
  expect(count).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npx vitest run convex/organizations.test.ts`
Expected: PASS — all three. (`organizations.join` already exists, so these should pass immediately; they are regression guards for the enrollment path the UI depends on.)

- [ ] **Step 3: Commit**

```bash
git add convex/organizations.test.ts
git commit -m "test(orgs): cover join enrollment path used by Google login"
```

---

## Task 4: Add the Google button to the login screen

**Files:**
- Modify: `src/components/LoginScreen.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add the Google sign-in handler and button**

In `src/components/LoginScreen.tsx`, add a handler inside the component (after the existing `submit` function):

```tsx
  async function googleSignIn() {
    setError(null);
    try {
      await signIn("google");
    } catch {
      setError("Kunde inte logga in med Google.");
    }
  }
```

Then, in the JSX, insert the divider + button immediately after the closing `</form>` tag and before the `<div className="switch">`:

```tsx
        <div className="oauth-divider"><span>eller</span></div>
        <button type="button" className="btn btn-google" onClick={googleSignIn} disabled={busy}>
          Logga in med Google
        </button>
```

- [ ] **Step 2: Add styles**

In `src/index.css`, append:

```css
.oauth-divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: var(--muted, #888);
  font-size: 13px;
  margin: 14px 0;
}
.oauth-divider::before,
.oauth-divider::after {
  content: "";
  flex: 1;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}
.oauth-divider span { padding: 0 10px; }
.btn-google {
  width: 100%;
  background: #fff;
  color: #1f1f1f;
  border: 1px solid rgba(0, 0, 0, 0.18);
}
.btn-google:hover { background: #f5f5f5; }
```

Note: if `src/index.css` does not define a `--muted` variable, the `var(--muted, #888)` fallback covers it; leave it as written.

- [ ] **Step 3: Typecheck / build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginScreen.tsx src/index.css
git commit -m "feat(login): add Sign in with Google button"
```

---

## Task 5: Add the post-login `JoinOrgScreen` gate

**Files:**
- Create: `src/components/JoinOrgScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `JoinOrgScreen`**

Create `src/components/JoinOrgScreen.tsx`:

```tsx
import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export default function JoinOrgScreen() {
  const join = useMutation(api.organizations.join);
  const { signOut } = useAuthActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await join({ code });
      // On success the org query updates reactively and App routes onward.
    } catch {
      setError("Ogiltig kod. Kontrollera koden från din organisation.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>Gå med i en organisation</h1>
        <div className="sub">Ange koden från din organisation för att komma åt arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Organisationskod</label>
            <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod från din organisation" autoFocus />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "…" : "Gå med"}
          </button>
        </form>
        <div className="switch">
          Fel konto?{" "}
          <button onClick={() => signOut()}>Logga ut</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the gate into `App.tsx`**

In `src/App.tsx`:

1. Add imports near the other imports:

```tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import JoinOrgScreen from "./components/JoinOrgScreen";
```

2. Add an `AuthedApp` component above `export default function App()`:

```tsx
function AuthedApp() {
  const orgState = useQuery(api.organizations.myOrgs);
  if (orgState === undefined) return <div className="boot">Laddar…</div>;
  if (!orgState.activeOrgId) return <JoinOrgScreen />;
  return (
    <ToastProvider>
      <ModalProvider>
        <OrgProvider>
          <Workspace />
        </OrgProvider>
      </ModalProvider>
    </ToastProvider>
  );
}
```

3. Replace the `<Authenticated>...</Authenticated>` block in `App` so it renders `AuthedApp`:

```tsx
      <Authenticated>
        <AuthedApp />
      </Authenticated>
```

(The provider nesting moves from `App` into `AuthedApp`; `App` keeps `AuthLoading` and `Unauthenticated` unchanged.)

- [ ] **Step 3: Typecheck / build**

Run: `npx tsc --noEmit`
Expected: no errors. Confirm there are no now-unused imports in `App.tsx` (all of `ToastProvider`, `ModalProvider`, `OrgProvider`, `Workspace` are still referenced inside `AuthedApp`).

- [ ] **Step 4: Build to confirm the bundle compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/JoinOrgScreen.tsx src/App.tsx
git commit -m "feat(auth): gate authenticated users without an org behind JoinOrgScreen"
```

---

## Task 6: Operational setup + manual verification (no code)

The OAuth round-trip cannot be exercised by convex-test; verify it against a real deployment.

- [ ] **Step 1: Create the Google OAuth client**

In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (type: Web application). Add the authorized redirect URI:

```
https://<your-deployment>.convex.site/api/auth/callback/google
```

(Use the deployment's `.convex.site` URL — the value of `VITE_CONVEX_SITE_URL` in `.env.local`.)

- [ ] **Step 2: Set the Convex env vars**

```bash
npx convex env set AUTH_GOOGLE_ID <client-id>
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
```

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev` and `npm run dev:backend`, then:
- New Google account (email not in the system) → after Google consent, lands on `JoinOrgScreen`; entering a valid org code opens the workspace; the user's display name in settings reflects the Google name.
- Entering an invalid code on `JoinOrgScreen` shows the error and does not proceed.
- Existing **password** user signs in with Google using the same email → lands in their existing workspace with their org intact (linked, not duplicated). Confirm in the Convex dashboard that only one `users` row exists for that email.
- Existing password sign-in still works with email + password.
- "Logga ut" on `JoinOrgScreen` returns to the login screen.

---

## Self-review notes

- **Spec coverage:** Google provider (Task 2) ✓; post-login join screen (Task 5) ✓; account linking (Tasks 1–2) ✓; shared enrollment logic — satisfied by reusing the existing `organizations.join` mutation rather than extracting a new helper, which is more DRY than the spec assumed (Task 3 guards it) ✓; Google button (Task 4) ✓; display-name nicety (Task 2) ✓; tests + manual OAuth verification (Tasks 1, 3, 6) ✓.
- **Deviation from spec:** The spec proposed extracting a shared `enrollUserInOrg` helper and a new `joinOrganization` mutation. The codebase already has `organizations.join` doing exactly that, so the plan reuses it instead of adding duplication. The join-code enrollment logic inside `createOrUpdateUser` is left inline (unchanged from today) to avoid churn; it is small and already tested via the password path.
- **Type consistency:** `findUserByEmail(db, email)` signature is identical in its definition (Task 1) and call site (Task 2). `organizations.join` returns `{ orgId, namn }`; the UI only reads success/failure.
```
