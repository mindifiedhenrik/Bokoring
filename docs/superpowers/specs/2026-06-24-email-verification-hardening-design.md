# Email verification + account-linking hardening — design

**Date:** 2026-06-24
**Status:** Approved
**Hardens:** [`2026-06-24-google-login-design.md`](2026-06-24-google-login-design.md)

## Goal

Add real email-ownership verification to the `Password` provider's sign-up
flow, then close the account-linking risk it leaves open: a Google sign-in must
only link to an existing account whose email is actually verified.

## Context

The app uses Convex with `@convex-dev/auth` 0.0.94. Two providers exist
(`convex/auth.ts`): `Password` (email + password, sign-up gated on an org join
code) and `Google` (OAuth).

The custom `createOrUpdateUser` callback bypasses the library's built-in
"link by verified email" logic, so the callback links manually: on an OAuth
sign-in with no pre-existing account for that provider, it links to the unique
existing user with the same email (`findUserByEmail`).

**The risk (currently an accepted FOLLOW-UP in `convex/auth.ts`):** password
sign-up does not verify email ownership. An attacker holding a valid org join
code can pre-register a password account under a victim's email. When the
victim later signs in with Google, the manual linking step attaches them to the
attacker-seeded account. The linking does not require the existing account's
email to be verified, so the attack succeeds.

This design adds verification so password accounts carry an
`emailVerificationTime`, then gates linking on it.

## Why this closes the risk

With `Password({ verify })` configured, `@convex-dev/auth` changes the sign-up
flow (verified against the provider source,
`node_modules/@convex-dev/auth/dist/providers/Password.js`):

- On `flow: "signUp"`, the library calls `createAccount` — which still runs our
  `createOrUpdateUser` callback, so the user row and org membership are created
  immediately, as today. But because `config.verify` is set and the account's
  email is not yet verified, it withholds the session and instead sends an OTP
  via the verify provider. The client's `signIn(...)` resolves with
  `{ signingIn: false }`.
- The user then submits the OTP via `flow: "email-verification"`, which sets the
  account's email as verified (stamping `emailVerificationTime`) and creates the
  session.

An attacker pre-registering a victim's email cannot read the victim's inbox, so
they can never complete the OTP step. Their seeded user row therefore never
receives `emailVerificationTime`. Gating the Google link on
`linked.emailVerificationTime` then refuses to link to that row — a fresh
account is created for the victim instead.

The `signIn` flow has the same `config.verify && !account.emailVerified` guard,
so existing unverified password users are prompted to verify on their next
login (see Transition consequence).

## Design

### 1. Custom Resend Email provider — `convex/ResendOTP.ts`

A convex-auth `Email` provider (from `@convex-dev/auth/providers/Email`):

- `id: "resend-otp"`, `maxAge: 60 * 15` (15-minute OTP lifetime).
- `generateVerificationToken()` → an 8-digit numeric OTP (sufficient entropy,
  easy to type). Generated with `crypto.getRandomValues` (Web Crypto, available
  in the default Convex runtime) — not `Math.random`.
- `sendVerificationRequest({ identifier: email, token })` → `fetch` POST to
  `https://api.resend.com/emails`:
  - Header `Authorization: Bearer ${process.env.AUTH_RESEND_KEY}`.
  - `from: process.env.AUTH_EMAIL_FROM` (a verified Resend sender).
  - Swedish subject + body containing the code.
  - Throws on a non-2xx response so sign-up surfaces a real failure rather than
    silently leaving the user unable to verify.

No new npm dependency: Resend is called via `fetch`, which is available in the
default Convex runtime without `"use node";`.

### 2. Wire verification into `Password` — `convex/auth.ts`

- `Password({ profile, verify: ResendOTP })`.
- **Rename the org join-code param `code` → `joinCode`.** `profile()` reads
  `params.joinCode` on `signUp` and still throws `"Organisationskod krävs"` when
  it is absent. This removes the overlap with the library's `code` param, which
  the `email-verification` flow uses for the OTP. (The two never coexist in one
  request, but the rename eliminates the footgun.)
- No other change to `profile()`; the join code is still handed to
  `createOrUpdateUser` via the transient `joinCode` field and stripped before
  the user document is written.

### 3. Harden the linking block — `convex/auth.ts`

Add a small, directly-testable helper beside `findUserByEmail`:

```ts
// Only return a linkable match: a unique existing user whose email is verified.
// OAuth linking uses this so an unverified (e.g. attacker-seeded) password
// account is never linked into. See the email-verification design doc.
export async function findLinkableUserByEmail(
  db: DatabaseReader,
  email: string,
): Promise<Doc<"users"> | null> {
  const user = await findUserByEmail(db, email);
  return user && user.emailVerificationTime != null ? user : null;
}
```

In `createOrUpdateUser`, the OAuth linking lookup calls
`findLinkableUserByEmail` instead of `findUserByEmail`. The
`ACCEPTED RISK` / `FOLLOW-UP` comment is replaced with a note that the risk is
closed: linking now requires `linked.emailVerificationTime`. The OAuth path
still stamps `emailVerificationTime` on the user it creates/patches (unchanged).

`findUserByEmail` stays exported and unchanged (the ambiguity rule is reused).

### 4. LoginScreen verification step — `src/components/LoginScreen.tsx`

Add a third screen state alongside `signIn` / `signUp`: `verify`.

- The sign-up submit sends `{ email, password, joinCode, flow: "signUp" }`.
- `signIn("password", …)` resolves with `{ signingIn: false }` when verification
  is pending. On that result, switch to the `verify` state: a single OTP field
  ("Ange koden vi mailade till dig") that calls
  `signIn("password", { email, code, flow: "email-verification" })`.
- On success the session is created and the app routes onward (existing
  `JoinOrgScreen` gate, or the workspace).
- The same `verify` state is entered if a normal `signIn` returns
  `{ signingIn: false }`, covering existing unverified users (see below).
- The email and password are held in component state across the transition so
  the verify step has the email it needs.

### 5. Env / operational setup (no code)

- `npx convex env set AUTH_RESEND_KEY <key>`
- `npx convex env set AUTH_EMAIL_FROM <verified-sender@domain>`
- A verified sender domain in the Resend dashboard.

### 6. Testing

- **`findLinkableUserByEmail`** (the security-critical unit, directly testable
  via convex-test, mirroring the existing `findUserByEmail` tests):
  - links a unique user with `emailVerificationTime` set;
  - returns `null` for a unique same-email user with no `emailVerificationTime`;
  - returns `null` when the email is ambiguous (two users).
- Keep the existing `findUserByEmail` and `organizations.join` tests.
- The real OTP round-trip and Resend delivery cannot be exercised in
  convex-test; verify manually against a real deployment (configure env vars,
  sign up, receive the code, complete verification, confirm
  `emailVerificationTime` is set in the dashboard).

## Transition consequence (no backfill required)

Existing password accounts predate verification and have no
`emailVerificationTime`. After this ships:

1. Google will not auto-link to them until they are verified — this is the
   intended fix.
2. Their next password sign-in triggers a one-time OTP verification (the
   `signIn`-flow guard), which sets `emailVerificationTime` and restores
   linking for that user.

This is a deliberate, documented UX change (one extra step on next login for
existing users) and avoids a data migration.

## Out of scope

- Magic-link verification (OTP only).
- Password-reset email (the `reset` option on `Password`).
- Rate-limiting or throttling OTP sends.
- Changing the Google/OAuth flow beyond the linking gate.
