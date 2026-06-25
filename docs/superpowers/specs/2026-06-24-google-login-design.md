# Google login — design

**Date:** 2026-06-24
**Status:** Approved

## Goal

Let users sign in with Google, in addition to the existing email/password
flow, while preserving the organization (org) model: every user who reaches the
app must belong to an organization.

## Context

The app uses Convex with `@convex-dev/auth`. Today the only provider is
`Password` (see `convex/auth.ts`):

- **Sign-up** requires an organization join code. The `Password.profile()`
  callback validates the code's presence and passes it as a transient
  `joinCode` field; the awaited `createOrUpdateUser` callback resolves the code
  to an org, creates the user, sets `activeOrgId`, and creates a `memberships`
  row.
- **Sign-in** of existing accounts requires no code.

An OAuth redirect (Google) has no form in which to type a join code, so the
join-code step must move to *after* authentication for OAuth users.

## Decisions

1. **Org enrollment for new Google users:** post-login join screen. After Google
   auth, if the user has no org, show a "join an organization" screen that asks
   for the join code and enrolls them.
2. **Account linking:** a Google sign-in whose verified email matches an existing
   account links to that same account (the default in `@convex-dev/auth`),
   preserving the user's org membership and data.

## Design

### 1. Backend — add the Google provider

In `convex/auth.ts`, add `Google` from `@convex-dev/auth/providers/Google`
alongside `Password`.

- **Env vars** (Convex deployment): `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` from a
  Google Cloud OAuth client.
- **Authorized redirect URI** in Google Cloud Console:
  `https://<deployment>.convex.site/api/auth/callback/google`.
- `createOrUpdateUser` already runs for every provider. For Google there is no
  `joinCode`, so `orgId` stays `undefined` and the user is created/linked with
  **no `activeOrgId` and no membership**. The only throw on a missing code lives
  in the `Password.profile()` callback, which Google bypasses — so no change is
  needed there to avoid blocking Google sign-up.
- **Account linking** is automatic: `@convex-dev/auth` links by verified email,
  so a Google sign-in with an existing email resolves to `existingUserId` and
  patches that user, preserving `activeOrgId`/memberships. The patch must not
  clobber `activeOrgId` (it only sets fields present in the profile, so this
  holds).

### 2. Shared org-join helper + `joinOrganization` mutation

Extract the join-code→org enrollment logic currently inlined in
`createOrUpdateUser` into a shared helper (e.g. `enrollUserInOrg(db, userId,
joinCode)`) so it is used by both:

- `createOrUpdateUser` (password sign-up path), and
- a new `joinOrganization({ code })` mutation used by the post-login screen.

`joinOrganization`:
- Requires an authenticated user (via `auth.getUserId(ctx)` / existing helper).
- Validates the code against the `by_joinCode` index; throws `ConvexError`
  ("Ogiltig kod") on miss.
- Creates the membership if absent (idempotent) and sets `activeOrgId`.

Placement: `convex/organizations.ts` (with the shared helper in `helpers.ts` or
`organizations.ts`, matching existing structure).

### 3. The "no org yet" gate in the UI

In `src/App.tsx`, introduce a state between "authenticated" and "in the app":

- When the user is authenticated but has **no active org** (no `activeOrgId` /
  no membership), render a new `JoinOrgScreen` instead of the main app.
- `JoinOrgScreen` (`src/components/JoinOrgScreen.tsx`): a single join-code field
  that calls `joinOrganization`. On success the user falls through to the main
  app (reactive query updates `activeOrgId`).

### 4. Frontend — the Google button

In `src/components/LoginScreen.tsx`:

- Add a "Logga in med Google" button that calls `signIn("google")`.
- A divider ("eller") separates it from the email/password form.
- The same button covers both sign-in and sign-up (OAuth has no separate flow).
  New Google users land on `JoinOrgScreen`; returning users go straight in.

### 5. Display name nicety

On first Google account creation, seed `userProfiles.displayName` from the
Google `name`, matching how display names are set today rather than inventing a
new mechanism.

## Testing

- `convex-test` unit tests for `joinOrganization`: valid code enrolls + sets
  `activeOrgId`; invalid code throws; re-join is idempotent (no duplicate
  membership).
- `convex-test` coverage that a user created without a join code has no
  membership and no `activeOrgId` (the Google path).
- The OAuth round-trip cannot be exercised in `convex-test`; manual verification:
  configure the Google Cloud OAuth client + env vars, perform a real Google
  sign-in, confirm a new user lands on `JoinOrgScreen` and an existing-email user
  links to their account.

## Out of scope

- Domain-based auto-join.
- Other OAuth providers (GitHub, etc.).
- Changing the existing password flow's behavior.
