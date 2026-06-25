# Google-only login — design

**Date:** 2026-06-25
**Status:** Approved

## Goal

Simplify authentication by removing the email/password login path and relying
solely on Google login. Existing password users must not be locked out: they
sign in with Google using the same email and are linked to their existing
account and organization.

## Context

The app uses Convex with `@convex-dev/auth`. Current providers are `Password`
(with `ResendOTP` email-OTP verification and a join-code-on-sign-up flow) and
`Google`. Org enrollment for new users already happens post-login through
`JoinOrgScreen` → `organizations.join`. Account linking in `createOrUpdateUser`
currently links a Google sign-in to an existing account only when that
account's email is verified (`findLinkableUserByEmail`), a hardening added
because password sign-up could otherwise let an attacker pre-register a
victim's email.

## Decisions

1. **Remove password auth entirely** (Approach A). Because password *sign-up* is
   removed, no new unverified accounts can ever be created — the exact attack
   the verified-email gate defended against. Linking existing accounts by plain
   email therefore becomes safe, so the gate, `findLinkableUserByEmail`, and the
   entire OTP flow (`ResendOTP`) are deleted. No data migration is required.
2. **Existing password users are trusted** legitimate accounts; linking them by
   email on Google sign-in is acceptable.

## Design

### Backend — `convex/auth.ts`

- Providers array becomes `[Google]`. Remove the `Password({...})` provider, the
  `Password` import, and the `ResendOTP` import.
- Delete the file `convex/ResendOTP.ts` (used only by the password flow).
- Remove `findLinkableUserByEmail` and the verified-email gate. The linking
  lookup in `createOrUpdateUser` reverts to `findUserByEmail` (plain unique-email
  match). Keep `findUserByEmail`.
- Simplify `createOrUpdateUser`:
  - Remove the join-code resolution branch (Google never sends a `joinCode`).
  - Remove the membership-creation block (org enrollment now flows only through
    `JoinOrgScreen` → `organizations.join`).
  - Retain: link existing user via `findUserByEmail` on OAuth sign-in; stamp
    `emailVerificationTime` for OAuth; insert-or-patch the user; seed
    `userProfiles.displayName` from the Google name on first creation; return
    `userId`.
  - Remove the now-unused `ConvexError` import (its only uses were the removed
    join-code/org branches).
- `convex/auth.config.ts` is unchanged.

Resulting user behavior:
- Returning Google user → matched by existing Google `authAccount`
  (`existingUserId` set).
- Existing password user → no Google `authAccount` yet, matched by email via
  `findUserByEmail`, linked to their existing account; `activeOrgId` and
  memberships preserved (no `joinCode`, so they are never touched).
- Brand-new user → new account with no org → routed to `JoinOrgScreen`.

### Frontend — `src/components/LoginScreen.tsx`

- Remove the email/password/join-code form, the `submit` handler, the
  `email`/`password`/`code`/`flow` state, and the sign-in/sign-up toggle.
- The screen becomes: brand, a short subtitle, the "Logga in med Google" button
  (with its `googleSignIn` handler and error display).
- `src/index.css`: remove the `.oauth-divider` rules (no form to divide from the
  button). Keep `.btn-google`.

### Unchanged

- `src/App.tsx` `AuthedApp` gate and `src/components/JoinOrgScreen.tsx` — still
  required for new Google users without an org.
- `convex/organizations.ts` (`join`, `myOrgs`, etc.).

### Tests

- `convex/auth.test.ts`: remove the password `signUp` tests and any
  `findLinkableUserByEmail` tests; keep the `findUserByEmail` tests.
- `convex/organizations.test.ts`: unchanged.

## Operational (no code)

- `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM` env vars become unused; remove from the
  deployment at leisure.
- Existing `authAccounts` rows for the `password` provider become orphaned but
  harmless (the user docs they point to are reused via email linking).

## Out of scope

- Deleting orphaned password `authAccounts` rows.
- Any change to the org/join-code model itself (codes still enroll via
  `JoinOrgScreen`).
- Removing the historical email-verification spec/plan docs.
