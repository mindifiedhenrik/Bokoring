# Google-only Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the email/password login path so Google is the only sign-in method, while keeping existing users working via email-based account linking.

**Architecture:** Reduce the `@convex-dev/auth` providers to `[Google]`, delete the password/OTP machinery (`ResendOTP`, the verified-email linking gate, the join-code-on-sign-up branch, and the membership-creation branch in `createOrUpdateUser`), and reduce `LoginScreen` to a single Google button. New Google users still route to `JoinOrgScreen`; existing accounts (including legacy password users) link by plain email so they keep their org and data.

**Tech Stack:** Convex 1.41, `@convex-dev/auth` 0.0.94, `@auth/core` Google provider, React 19, Vite, Vitest + convex-test.

---

## Background the implementer must know

- Google is becoming the ONLY provider, so in `createOrUpdateUser` the `type` is always `"oauth"`. The plan removes the now-constant `type === "oauth"` guards for simplicity.
- Account linking must remain: an existing user (a returning Google user with no prior Google `authAccount`, OR a legacy password user) is matched by email via `findUserByEmail` and linked, preserving their `activeOrgId`/memberships. This is why password users are not locked out.
- Org enrollment for brand-new users happens entirely through `src/components/JoinOrgScreen.tsx` → `convex/organizations.ts` `join`. The join-code/membership logic inside `createOrUpdateUser` is therefore dead and is removed.
- `convex/auth.config.ts`, `src/App.tsx` (the `AuthedApp` gate), `src/components/JoinOrgScreen.tsx`, and `convex/organizations.ts` are UNCHANGED.
- db API note: this Convex version supports both `db.get(id)` and `db.get("table", id)`; `auth.ts` uses the id-first form for `patch`. Keep that style.

## File structure

- **Modify** `convex/auth.ts` — providers `[Google]`; drop `Password`/`ResendOTP`/`findLinkableUserByEmail`/`ConvexError` imports and the join-code+membership branches; link via `findUserByEmail`.
- **Delete** `convex/ResendOTP.ts` — only the password flow used it.
- **Modify** `convex/auth.test.ts` — keep the `findUserByEmail` tests; remove the `findLinkableUserByEmail` tests and the password `signUp` tests; drop the now-unused `api` and `findLinkableUserByEmail` imports.
- **Modify** `src/components/LoginScreen.tsx` — reduce to a Google-only screen.
- **Modify** `src/index.css` — remove the `.oauth-divider` rules; keep `.btn-google`.

---

## Task 1: Backend — make Google the only provider

**Files:**
- Modify: `convex/auth.ts`
- Delete: `convex/ResendOTP.ts`
- Modify: `convex/auth.test.ts`

- [ ] **Step 1: Trim the test file**

Replace the ENTIRE contents of `convex/auth.test.ts` with the following (keeps only the `findUserByEmail` tests; removes the `findLinkableUserByEmail` and password `signUp` tests and their now-unused imports):

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { findUserByEmail } from "./auth";
import schema from "./schema";
import { modules } from "./test.helpers";

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

- [ ] **Step 2: Rewrite `convex/auth.ts`**

Replace the ENTIRE contents of `convex/auth.ts` with:

```ts
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { Doc, Id } from "./_generated/dataModel";
import { DatabaseReader, DatabaseWriter } from "./_generated/server";

// Find the unique existing user with this email. Returns null when none match
// or when the email is ambiguous (more than one user).
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    // Google is the only provider. Brand-new users arrive with no organization
    // and are routed to JoinOrgScreen, which enrolls them via
    // `organizations.join`. Existing accounts (including legacy password users)
    // are linked by email so they keep their organization and data when they
    // switch to Google.
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const db = ctx.db as unknown as DatabaseWriter;
      const rest = profile as Record<string, unknown>;

      // A custom createOrUpdateUser bypasses the library's built-in email
      // linking, so link manually: when there is no existing account for this
      // provider yet, link to the unique existing user with the same email.
      let userId: Id<"users"> | null =
        (existingUserId as Id<"users"> | null) ?? null;
      if (userId === null && typeof rest.email === "string") {
        const linked = await findUserByEmail(db, rest.email);
        if (linked) userId = linked._id;
      }

      // Google verifies the email; record it.
      const userData = { ...rest, emailVerificationTime: Date.now() };

      let isNew = false;
      if (userId) {
        await db.patch(userId, userData);
      } else {
        userId = await db.insert("users", userData);
        isNew = true;
      }

      // Seed a display name from the Google profile on first creation.
      if (isNew && typeof rest.name === "string" && rest.name.trim()) {
        await db.insert("userProfiles", { userId, displayName: rest.name.trim() });
      }

      return userId;
    },
  },
});
```

- [ ] **Step 3: Delete the OTP provider file**

Run: `git rm convex/ResendOTP.ts`
Expected: file staged for deletion.

- [ ] **Step 4: Run the auth tests**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS — 3 tests (the `findUserByEmail` cases). No reference errors to `findLinkableUserByEmail`, `ResendOTP`, or `api`.

- [ ] **Step 5: Typecheck the backend**

Run: `npx tsc -p convex --noEmit`
Expected: no errors. (Confirms no dangling references to the removed `Password`/`ResendOTP`/`ConvexError`/`findLinkableUserByEmail` symbols.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the only auth tests are the 3 above; `organizations.test.ts` and the rest are unaffected).

- [ ] **Step 7: Commit**

```bash
git add convex/auth.ts convex/auth.test.ts
git rm convex/ResendOTP.ts
git commit -m "feat(auth): make Google the only provider, remove password/OTP"
```

(`git rm` in Step 3 already staged the deletion; the `git add` and the explicit `git rm` here are harmless to repeat and keep the commit self-contained.)

---

## Task 2: Frontend — Google-only login screen

**Files:**
- Modify: `src/components/LoginScreen.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Rewrite `LoginScreen.tsx`**

Replace the ENTIRE contents of `src/components/LoginScreen.tsx` with:

```tsx
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function googleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn("google");
    } catch (e) {
      console.error("Google sign-in failed:", e);
      setError("Kunde inte logga in med Google.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
        </div>
        <h1>Logga in</h1>
        <div className="sub">Logga in för att komma åt den delade arbetsytan.</div>
        {error && <div className="err">{error}</div>}
        <button type="button" className="btn btn-google" onClick={googleSignIn} disabled={busy}>
          {busy ? "…" : "Logga in med Google"}
        </button>
      </div>
    </div>
  );
}
```

Note: `busy` is set on click (disabling the button to prevent a double-submit) and reset only on error; on success the OAuth redirect navigates away while the component is still mounted, so leaving `busy` true is intentional.

- [ ] **Step 2: Remove the `.oauth-divider` CSS**

In `src/index.css`, delete this block (it sits just above the `.btn-google` rules; leave `.btn-google` and `.btn-google:hover` intact):

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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms no leftover references to the removed `flow`/`email`/`password`/`code`/`submit` symbols.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/LoginScreen.tsx src/index.css
git commit -m "feat(login): reduce login screen to Google-only"
```

---

## Self-review notes

- **Spec coverage:** providers → `[Google]` (Task 1 Step 2) ✓; delete `ResendOTP.ts` (Task 1 Step 3) ✓; drop verified-email gate / `findLinkableUserByEmail` and link via `findUserByEmail` (Task 1 Step 2) ✓; simplify `createOrUpdateUser` — remove join-code + membership branches (Task 1 Step 2) ✓; remove `ConvexError` import (covered by the full-file rewrite, verified by `tsc` in Task 1 Step 5) ✓; `LoginScreen` Google-only (Task 2 Step 1) ✓; remove `.oauth-divider` CSS (Task 2 Step 2) ✓; tests trimmed (Task 1 Step 1) ✓; `App.tsx`/`JoinOrgScreen`/`organizations.ts`/`auth.config.ts` untouched ✓.
- **Type/symbol consistency:** `findUserByEmail(db, email)` is defined and called with the same signature in Task 1. `createOrUpdateUser` no longer references `orgId`, `joinCode`, `ConvexError`, `Id<"organizations">`, or `findLinkableUserByEmail`. `Id<"users">`, `Doc`, `DatabaseReader`, `DatabaseWriter` remain used.
- **Placeholder scan:** none — every code step is a full file body or an exact block to delete.
- **Operational (not a code task):** `AUTH_RESEND_KEY`/`AUTH_EMAIL_FROM` env vars become unused and may be removed from the deployment; orphaned password `authAccounts` rows are harmless. Out of scope per the spec.
```
