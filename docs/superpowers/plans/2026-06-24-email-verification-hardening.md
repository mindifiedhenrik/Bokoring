# Email Verification + Account-Linking Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real email-ownership verification to the `Password` sign-up flow (OTP via Resend) and gate Google account-linking on `emailVerificationTime`, closing the pre-registration linking risk documented in `convex/auth.ts`.

**Architecture:** Add a custom `@convex-dev/auth` `Email` provider (`ResendOTP`) that generates an 8-digit OTP and emails it via the Resend REST API (`fetch`, no new dep). Pass it as `Password({ verify })`, which makes sign-up create the user/membership immediately but withhold the session until the OTP is confirmed via the `email-verification` flow — that step stamps `emailVerificationTime`. Rename the org join-code param `code → joinCode` to avoid colliding with the library's OTP `code` param. Harden the OAuth linking lookup to only link to a same-email user whose `emailVerificationTime` is set. The `LoginScreen` gains a third state for entering the OTP.

**Tech Stack:** Convex 1.41, `@convex-dev/auth` 0.0.94, `@auth/core` 0.41, React 19, Vite, Vitest + convex-test, Resend (HTTP API).

**Spec:** `docs/superpowers/specs/2026-06-24-email-verification-hardening-design.md`

---

## Background the implementer must know

- **`emailVerificationTime` is a real field.** The `users` table spreads
  `authTables.users.validator.fields` (`convex/schema.ts:20-25`), which includes
  the optional `emailVerificationTime: v.optional(v.number())`. No schema change
  is needed.
- **What `verify` changes (verified against
  `node_modules/@convex-dev/auth/dist/providers/Password.js`):** On `flow:
  "signUp"` the library calls `createAccount` (which runs our
  `createOrUpdateUser` callback → user + membership created and committed), then,
  because `config.verify` is set and the new account's email is unverified, it
  calls `signInViaProvider(ctx, config.verify, …)` to send the OTP and returns
  **without a session**. The client's `signIn(...)` resolves with `{ signingIn:
  false }`. On `flow: "email-verification"` the library verifies the OTP via the
  same provider, marks the email verified (stamping `emailVerificationTime`), and
  creates the session.
- **`signIn` flow also triggers verify:** the `if (config.verify &&
  !account.emailVerified)` guard at the end of `authorize` means an existing
  unverified user signing in is also routed to OTP verification. This is the
  intended transition path for pre-existing accounts.
- **The `Email` provider shape** (`node_modules/@convex-dev/auth/dist/providers/Email.js`):
  `Email({ id, maxAge, generateVerificationToken, sendVerificationRequest })`.
  Its default `authorize` requires `params.email` to match the account's
  `providerAccountId` (the email) during verification — so the
  `email-verification` client call MUST include `email`.
- **Why the custom `maxAge` / `generateVerificationToken` are honored (do not
  "fix" this):** `Email()` hardcodes `maxAge: 60*60` and does not set
  `generateVerificationToken` at the top level — it stashes the whole config
  under `options`. But convex-auth materializes every provider via
  `materializeProvider` → `providerDefaults` → `merge(provider,
  provider.options)` (`server/provider_utils.js:73,144`), and `merge` lets
  `options` win. So the `maxAge: 60*15`, `id`, and `generateVerificationToken`
  passed into `Email({…})` override the wrapper defaults by the time
  `signIn.js` reads `provider.generateVerificationToken` / `provider.maxAge`.
  The manual test in Task 6 (an 8-digit code arrives, not a 32-char string)
  confirms `generateVerificationToken` took effect.
- **OTP `code` vs join `code`:** the library reads the OTP from `params.code` in
  the `email-verification` flow. Today the org join code is also `params.code`
  (read only in the `signUp` flow). They never coexist in one request, but this
  plan renames the join-code param to `joinCode` to remove the overload.
- **No-key fallback:** when `AUTH_RESEND_KEY` is unset, `sendVerificationRequest`
  logs the OTP and returns instead of calling Resend. This keeps convex-test and
  key-less local dev working and fails closed (no session without OTP entry). See
  the spec for why this does not weaken the security property.
- **`fetch` needs no `"use node";`** in the default Convex runtime. `ResendOTP.ts`
  exports no Convex functions, only a provider config object, so it stays in the
  default runtime.
- **`crypto.getRandomValues`** is available in the default Convex runtime and in
  the `edge-runtime` test environment. Use it for the OTP — never `Math.random`
  (and `Math.random` is unavailable in some harness contexts anyway).
- **db API:** `convex/auth.ts` uses the id-first `db.patch(id, …)` /
  `db.insert("table", …)` forms. Match that file's existing style.

## File structure

- **Create** `convex/ResendOTP.ts` — the custom OTP email provider (config object only; no Convex functions).
- **Modify** `convex/auth.ts` — import & wire `verify: ResendOTP`; rename join-code param to `joinCode` in `profile()`; add `findLinkableUserByEmail`; switch the OAuth linking lookup to it; rewrite the ACCEPTED-RISK comment.
- **Modify** `convex/auth.test.ts` — rename `code → joinCode` in the two signUp tests; assert no `emailVerificationTime` post-signup; add `findLinkableUserByEmail` tests.
- **Modify** `src/components/LoginScreen.tsx` — send `joinCode`; add the `verify` OTP-entry state driven by `{ signingIn: false }`.

No changes to `src/App.tsx`: until the OTP is confirmed there is no session, so `<Unauthenticated>` keeps `LoginScreen` mounted and the new state lives entirely inside it.

---

## Task 1: Create the `ResendOTP` email provider

Build the provider in isolation first; it has no dependency on the rest of the change.

**Files:**
- Create: `convex/ResendOTP.ts`

- [ ] **Step 1: Write `convex/ResendOTP.ts`**

```ts
import Email from "@convex-dev/auth/providers/Email";

// Custom email provider for password sign-up / sign-in OTP verification.
// Emails an 8-digit code via the Resend HTTP API (no SDK dependency).
//
// When AUTH_RESEND_KEY is unset (local dev / tests) we log the code instead of
// calling Resend. This keeps the flow exercisable without a key and fails
// closed: a session is still only issued after the code is entered via the
// `email-verification` flow, so this does not weaken email verification.
export const ResendOTP = Email({
  id: "resend-otp",
  // OTP lifetime: 15 minutes.
  maxAge: 60 * 15,
  async generateVerificationToken() {
    // 8-digit numeric OTP from a CSPRNG (Web Crypto), zero-padded.
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return (bytes[0] % 100_000_000).toString().padStart(8, "0");
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const apiKey = process.env.AUTH_RESEND_KEY;
    const from = process.env.AUTH_EMAIL_FROM ?? "onboarding@resend.dev";

    if (!apiKey) {
      // Dev / test fallback — no key configured.
      console.warn(
        `[ResendOTP] AUTH_RESEND_KEY unset; not sending email. ` +
          `Verification code for ${email}: ${token}`,
      );
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Din verifieringskod för Boköring",
        text:
          `Din verifieringskod är ${token}.\n\n` +
          `Koden gäller i 15 minuter. Ange den i appen för att slutföra ` +
          `inloggningen. Om du inte försökte logga in kan du ignorera detta ` +
          `mejl.`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend send failed (${res.status}): ${detail}`);
    }
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`Email` is imported from `@convex-dev/auth/providers/Email`; the config matches `EmailUserConfig & Pick<EmailConfig, "sendVerificationRequest">`.)

- [ ] **Step 3: Commit**

```bash
git add convex/ResendOTP.ts
git commit -m "feat(auth): add ResendOTP email provider for OTP verification"
```

---

## Task 2: Add `findLinkableUserByEmail` and test it

This is the security-critical unit and the only part of the hardening directly
testable in convex-test. Build it before wiring it in.

**Files:**
- Modify: `convex/auth.ts`
- Test: `convex/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `convex/auth.test.ts`. Update the existing import line to add the new
symbol:

```ts
import { findLinkableUserByEmail, findUserByEmail } from "./auth";
```

Then append:

```ts
test("findLinkableUserByEmail links a verified single match", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      email: "verified@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    }),
  );
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "verified@firma.se"),
  );
  expect(found?._id).toBe(userId);
});

test("findLinkableUserByEmail returns null for an unverified match", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { email: "unverified@firma.se" }));
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "unverified@firma.se"),
  );
  expect(found).toBeNull();
});

test("findLinkableUserByEmail returns null when the email is ambiguous", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      email: "dup2@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    });
    await ctx.db.insert("users", {
      email: "dup2@firma.se",
      emailVerificationTime: 1_700_000_000_000,
    });
  });
  const found = await t.run((ctx) =>
    findLinkableUserByEmail(ctx.db, "dup2@firma.se"),
  );
  expect(found).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/auth.test.ts`
Expected: FAIL — `findLinkableUserByEmail` is not exported / not a function.

- [ ] **Step 3: Implement `findLinkableUserByEmail`**

In `convex/auth.ts`, add this helper immediately after the existing
`findUserByEmail` function (it reuses `findUserByEmail`'s ambiguity rule):

```ts
// Return a *linkable* match only: a unique existing user whose email is
// verified. OAuth linking uses this so an unverified account — e.g. one an
// attacker pre-registered under a victim's email via the password flow — is
// never linked into. See
// docs/superpowers/specs/2026-06-24-email-verification-hardening-design.md.
export async function findLinkableUserByEmail(
  db: DatabaseReader,
  email: string,
): Promise<Doc<"users"> | null> {
  const user = await findUserByEmail(db, email);
  return user && user.emailVerificationTime != null ? user : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS — the three new `findLinkableUserByEmail` tests, plus the
existing `findUserByEmail` tests. (The two `signUp` tests still pass `code` and
remain green until Task 4; do not touch them yet.)

- [ ] **Step 5: Commit**

```bash
git add convex/auth.ts convex/auth.test.ts
git commit -m "feat(auth): add findLinkableUserByEmail (verified-email gate)"
```

---

## Task 3: Harden the OAuth linking lookup

**Files:**
- Modify: `convex/auth.ts`

- [ ] **Step 1: Switch the linking lookup and rewrite the comment**

In `convex/auth.ts`, replace the linking block inside `createOrUpdateUser`. The
current code is:

```ts
      // A custom createOrUpdateUser bypasses the library's built-in email
      // linking, so do it ourselves: on an OAuth sign-in (Google verifies the
      // email) with no pre-existing account for this provider, link to the
      // unique existing user with the same email.
      //
      // ACCEPTED RISK: we do NOT require the existing account's email to be
      // verified before linking. Password sign-up does not verify emails today,
      // so requiring it would stop Google from ever linking to a password
      // account. The exposure is bounded because password registration already
      // requires a valid org join code. FOLLOW-UP: once the password flow
      // verifies emails, gate this on `linked.emailVerificationTime`.
      let userId: Id<"users"> | null = (existingUserId as Id<"users"> | null) ?? null;
      if (userId === null && type === "oauth" && typeof rest.email === "string") {
        const linked = await findUserByEmail(db, rest.email);
        if (linked) userId = linked._id;
      }
```

Replace it with:

```ts
      // A custom createOrUpdateUser bypasses the library's built-in email
      // linking, so do it ourselves: on an OAuth sign-in (Google verifies the
      // email) with no pre-existing account for this provider, link to the
      // unique existing user with the same email.
      //
      // The existing account's email MUST be verified before we link
      // (findLinkableUserByEmail enforces this). The password flow now verifies
      // emails via OTP, so an attacker who pre-registers a victim's email cannot
      // complete verification and their seeded row has no emailVerificationTime —
      // Google therefore creates a fresh account for the victim instead of
      // linking into the attacker's. See
      // docs/superpowers/specs/2026-06-24-email-verification-hardening-design.md.
      let userId: Id<"users"> | null = (existingUserId as Id<"users"> | null) ?? null;
      if (userId === null && type === "oauth" && typeof rest.email === "string") {
        const linked = await findLinkableUserByEmail(db, rest.email);
        if (linked) userId = linked._id;
      }
```

(Only the comment and the `findUserByEmail` → `findLinkableUserByEmail` call
change. The OAuth `emailVerificationTime` stamp later in `userData` is
unchanged.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. `findUserByEmail` is still exported and used by
`findLinkableUserByEmail`, so no unused-import issues arise.

- [ ] **Step 3: Run the auth tests**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS — all `findUserByEmail` / `findLinkableUserByEmail` tests. (The
two `signUp` tests still pass `code` and remain green here; they are migrated in
Task 4.)

- [ ] **Step 4: Commit**

```bash
git add convex/auth.ts
git commit -m "harden(auth): only link Google to verified existing accounts"
```

---

## Task 4: Wire `verify` into `Password` and rename the join-code param

This enables email verification on sign-up/sign-in and renames the org join-code
param. Because `verify` changes sign-up behavior, the existing `signUp` tests are
migrated in the same task.

**Files:**
- Modify: `convex/auth.ts`
- Test: `convex/auth.test.ts`

- [ ] **Step 1: Update the existing `signUp` tests first (they will fail)**

In `convex/auth.test.ts`, in BOTH existing tests `"signUp with a valid org code
creates a membership and active org"` and `"signUp with an unknown code is
rejected"`, rename the param `code:` to `joinCode:` inside the `params` object.

For the valid-code test, also assert the account is unverified right after
sign-up. Replace its `state` block and assertions with:

```ts
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
    return {
      activeOrgId: user?.activeOrgId,
      hasMembership: !!membership,
      emailVerificationTime: user?.emailVerificationTime,
    };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
  // Sign-up creates the row + membership but does NOT verify the email — this is
  // the attacker-seeded-row property the linking hardening defends against.
  expect(state.emailVerificationTime).toBeUndefined();
```

The full migrated valid-code test reads:

```ts
test("signUp with a valid org code creates a membership and active org", async () => {
  const t = convexTest(schema, modules);
  const orgId = await t.run((ctx) =>
    ctx.db.insert("organizations", { namn: "Acme", joinCode: "JOINACME" }),
  );
  await t.action(api.auth.signIn, {
    provider: "password",
    params: { email: "new@firma.se", password: "hunter2hunter", flow: "signUp", joinCode: "JOINACME" },
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
    return {
      activeOrgId: user?.activeOrgId,
      hasMembership: !!membership,
      emailVerificationTime: user?.emailVerificationTime,
    };
  });
  expect(state.activeOrgId).toBe(orgId);
  expect(state.hasMembership).toBe(true);
  expect(state.emailVerificationTime).toBeUndefined();
});
```

The full migrated unknown-code test reads:

```ts
test("signUp with an unknown code is rejected", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: { email: "x@firma.se", password: "hunter2hunter", flow: "signUp", joinCode: "NOPECODE" },
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the tests to verify the valid-code test now fails**

Run: `npx vitest run convex/auth.test.ts`
Expected: FAIL — with the param still named `code` in `profile()`, the renamed
`joinCode` is ignored, so `profile()` throws `"Organisationskod krävs"` and the
valid-code sign-up rejects. (This confirms the test now depends on the rename.)

- [ ] **Step 3: Add the `verify` provider and rename the param in `auth.ts`**

In `convex/auth.ts`:

1. Add the import at the top (with the other imports):

```ts
import { ResendOTP } from "./ResendOTP";
```

2. In the `Password({ … })` config, update `profile()` to read `joinCode` and add
the `verify` option. The `profile` body changes from reading `params.code` to
`params.joinCode`:

```ts
      profile(params): { email: string; joinCode?: string } {
        const email = params.email as string;
        if (params.flow === "signUp") {
          const code = (params.joinCode as string | undefined)?.trim();
          if (!code) throw new ConvexError("Organisationskod krävs");
          return { email, joinCode: code };
        }
        return { email };
      },
```

3. Add `verify: ResendOTP` to the `Password` config, after the `profile` block
and before the closing `})` of the `Password({ … })` call:

```ts
    Password({
      // ...existing comment + profile() unchanged except the rename above...
      profile(params): { email: string; joinCode?: string } {
        /* as above */
      },
      verify: ResendOTP,
    }),
```

Also update the existing block comment above `profile` that says the new user is
enrolled "on sign-up the `code` must match…" to refer to `joinCode`, and note
that sign-up now also requires email OTP verification before a session is
issued. Suggested replacement for the first sentence of that comment:

```ts
      // On sign-up the `joinCode` param must match an organization's join code;
      // the new user is enrolled into that org (membership + activeOrgId set in
      // `createOrUpdateUser` below). Sign-up additionally requires email OTP
      // verification (see `verify: ResendOTP`) before a session is issued.
      // Sign-in of existing accounts requires no join code.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/auth.test.ts`
Expected: PASS — both migrated `signUp` tests and all linking tests.
`AUTH_RESEND_KEY` is unset in tests, so `sendVerificationRequest` takes the
no-key fallback (logs, no network) and the sign-up action resolves normally.

- [ ] **Step 5: Run the full backend test suite (regression check)**

Run: `npx vitest run`
Expected: PASS — no other suite regresses. (Watch `convex/organizations.test.ts`
and any test that exercises the password sign-up path.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/auth.ts convex/auth.test.ts
git commit -m "feat(auth): require email OTP verification on password sign-up"
```

---

## Task 5: Add the OTP-entry step to `LoginScreen`

**Files:**
- Modify: `src/components/LoginScreen.tsx`

- [ ] **Step 1: Add the `verify` state and OTP handling**

Replace the contents of `src/components/LoginScreen.tsx` with the version below.
Changes from the current file: a third `mode` value `"verify"`; the sign-up/sign-in
`submit` inspects `signIn(...)`'s `{ signingIn }` result and switches to `"verify"`
when sign-in did not complete; a `verify` form that submits the OTP via the
`email-verification` flow; the join-code param is sent as `joinCode`.

```tsx
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params: Record<string, string> = { email, password, flow };
      if (flow === "signUp") params.joinCode = code;
      const { signingIn } = await signIn("password", params);
      // When email verification is required, the library does not start a
      // session; it emails an OTP and returns signingIn=false. Show the code step.
      if (!signingIn) {
        setNeedsVerify(true);
        setBusy(false);
      }
    } catch {
      setError(
        flow === "signIn"
          ? "Fel e-post eller lösenord."
          : "Kunde inte registrera. Kontrollera organisationskoden och att lösenordet är minst 8 tecken."
      );
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, code: otp, flow: "email-verification" });
      // On success a session is created and App routes away from LoginScreen.
    } catch {
      setError("Fel eller utgången kod. Kontrollera koden i ditt mejl.");
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setError(null);
    try {
      await signIn("google");
    } catch {
      setError("Kunde inte logga in med Google.");
    }
  }

  if (needsVerify) {
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand">
            <span className="mark">Boköring</span><span className="dot" /><span className="sub">CRM</span>
          </div>
          <h1>Verifiera din e-post</h1>
          <div className="sub">Vi har mailat en kod till {email}. Ange den för att fortsätta.</div>
          {error && <div className="err">{error}</div>}
          <form onSubmit={submitOtp}>
            <div className="field">
              <label>Verifieringskod</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="8-siffrig kod"
                autoFocus
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "…" : "Verifiera"}
            </button>
          </form>
          <div className="switch">
            Fel e-post?{" "}
            <button onClick={() => { setError(null); setOtp(""); setNeedsVerify(false); }}>
              Tillbaka
            </button>
          </div>
        </div>
      </div>
    );
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
          {flow === "signUp" && (
            <div className="field">
              <label>Organisationskod</label>
              <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kod från din organisation" />
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "…" : flow === "signIn" ? "Logga in" : "Skapa konto"}
          </button>
        </form>
        <div className="oauth-divider"><span>eller</span></div>
        <button type="button" className="btn btn-google" onClick={googleSignIn} disabled={busy}>
          Logga in med Google
        </button>
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build to confirm the bundle compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginScreen.tsx
git commit -m "feat(login): add email verification (OTP) step"
```

---

## Task 6: Operational setup + manual verification (no code)

The real OTP round-trip and email delivery cannot be exercised by convex-test;
verify against a real deployment.

- [ ] **Step 1: Create a Resend account + API key**

In the Resend dashboard, create an API key. For development you may use the test
sender `onboarding@resend.dev` (it can only deliver to the address your Resend
account was created with). Before real users sign up, verify a sending domain
(DNS records) and use a `noreply@<your-domain>` sender.

- [ ] **Step 2: Set the Convex env vars**

```bash
npx convex env set AUTH_RESEND_KEY <resend-api-key>
npx convex env set AUTH_EMAIL_FROM "Boköring <onboarding@resend.dev>"
```

(Use a verified-domain sender for `AUTH_EMAIL_FROM` in production.)

- [ ] **Step 3: Manual verification checklist**

Run `npm run dev` and `npm run dev:backend`, then:

- **New password sign-up:** enter email + password + a valid org code → the form
  switches to the verify step → the OTP email arrives → entering the code opens
  the app (via `JoinOrgScreen` if no org, else the workspace). In the Convex
  dashboard confirm the user row now has `emailVerificationTime` set.
- **Wrong/expired OTP:** entering a bad code shows the error and does not sign in.
- **Existing (pre-change) password user:** signing in with email + password
  routes to the verify step (forced one-time verification); after the OTP they
  reach the app and their `emailVerificationTime` is now set.
- **Linking hardening:** with a password account that has NOT completed
  verification (no `emailVerificationTime`), sign in with Google using the same
  email → a *separate* new user row is created (no link). With a verified
  password account, Google sign-in links to it (one row). Confirm row counts in
  the dashboard.
- **No-key sanity (optional):** with `AUTH_RESEND_KEY` unset, sign-up logs the
  OTP to the Convex logs instead of emailing; entering that code still completes
  verification.

---

## Self-review notes

- **Spec coverage:** §1 ResendOTP provider → Task 1; §2 wire `verify` + rename
  param → Task 4; §3 `findLinkableUserByEmail` + linking gate → Tasks 2–3; §4
  LoginScreen verify step → Task 5; §5 env/ops → Task 6; §6 testing → Tasks 2
  (linking unit), 4 (migrated signUp + no-`emailVerificationTime` assertion), 6
  (manual OTP round-trip). All covered.
- **No-key fallback** (spec §1) is implemented in Task 1 and relied on by the
  Task 4 tests (which run with `AUTH_RESEND_KEY` unset).
- **Type/name consistency:** `findLinkableUserByEmail(db, email): Promise<Doc<"users"> | null>`
  is defined (Task 2) and called (Task 3) identically. `ResendOTP` is the exported
  name in `convex/ResendOTP.ts` (Task 1) and the import/usage in `auth.ts` (Task 4).
  The join-code param is `joinCode` consistently in `profile()` (Task 4),
  `LoginScreen` (Task 5), and the migrated tests (Task 4). The OTP param is `code`
  in both the `email-verification` client call (Task 5) and the library contract.
- **Ordering rationale:** Tasks 2–3 land the hardening before Task 4 flips on
  `verify`, so each task leaves the suite green. The two existing `signUp` tests
  keep using `code` through Tasks 2–3 and are migrated to `joinCode` only in Task
  4, the same task that performs the rename — they fail in Task 4 Step 2 and pass
  in Step 4, preserving the red→green TDD cycle.
```
