# Multi-organization support — design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan

## Goal

Turn the currently single-tenant CRM into a multi-tenant app where each
**organization** has its own isolated data. The login/invite **code** controls
which organization a user joins. A user can belong to **several** organizations
and switch between them.

**Hard constraint:** existing production data must not be lost. The migration is
purely additive — no row is deleted and no existing field is overwritten.

## Current state (baseline)

- Single tenant: every signed-in user shares all data. `requireAuth` only checks
  that a user is logged in; nothing is scoped.
- Auth: `@convex-dev/auth` Password provider, signup gated by a single shared
  `SIGNUP_CODE` env var (`convex/auth.ts`).
- Business tables: `contacts`, `leads`, `projects`, `tasks`, `notes`,
  `contactReads`, `settings`. Plus `userProfiles` (per-user display name) and the
  `authTables` (`users`, sessions, …).

## Decisions

- **Org definition:** a DB `organizations` table, managed in-app.
- **Active org:** stored server-side, per user (`users.activeOrgId`). Single-org
  users are auto-selected; a switcher appears only with 2+ memberships.
- **Roles:** flat — every member of an org can manage it (rotate code, remove
  members).
- **Org creation:** any logged-in user can create a new org in-app (generates a
  join code, makes them a member). New people join an existing org via a code at
  signup. The first/default org is created by the data migration.
- **Existing data:** migrated into one seeded default organization. Nothing is
  deleted.
- **Enforcement:** centralized `requireOrg` helper + per-table `by_org` index
  (Approach A), matching the existing `requireAuth` style.

## 1. Data model

### New tables

```ts
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
```

### Extend `users`

Extend the `authTables` `users` table with:

```ts
activeOrgId: v.optional(v.id("organizations")),
```

This pointer is both the server-side "currently active org" and the carrier that
lets the signup callback enrol a new user into the right org.

### Org-scoped business tables

Each of `contacts`, `leads`, `projects`, `tasks`, `notes`, `settings` gains
`orgId: v.id("organizations")` and a `by_org` index. Existing indexes are kept.

- `userProfiles` stays **global** — a user's display name is shared across orgs.
- `contactReads` stays keyed by `userId` + `contactId`; the contact it points to
  is already org-scoped, so the read marker is implicitly scoped.
- `settings` becomes **one row per org** (gains `orgId` + `by_org` index).

## 2. Backend enforcement (Approach A)

Replace `requireAuth` with `requireOrg(ctx)` in `convex/helpers.ts`:

```
requireOrg(ctx) -> { userId, orgId }
  - userId  = getAuthUserId(ctx); throw "Inte inloggad" if null
  - orgId   = user.activeOrgId; throw if unset
  - verify a memberships row exists for (userId, orgId); throw "Ingen åtkomst" otherwise
```

- **Queries** filter with `.withIndex("by_org", q => q.eq("orgId", orgId))`.
- **Mutations** stamp `orgId` on insert. On update/delete they `get` the target
  doc and assert `doc.orgId === orgId` before touching it — prevents cross-org
  access via a guessed id.
- `users.list` becomes "members of the active org": query `memberships` by_org,
  then resolve users + profiles.
- `users.remove` becomes **`removeMember({ userId })`**: deletes the membership
  for the active org and nulls that user's `agareId` on the org's leads/tasks.
  Full account deletion is out of scope for this change.

## 3. Org lifecycle & flows

All in a new `convex/organizations.ts` plus changes to `convex/auth.ts`.

- **Create org** (any logged-in user): `organizations.create({ namn })` →
  generate a unique random `joinCode`, insert the org, create a membership, set
  it as the caller's `activeOrgId`. Returns the code to display.
- **Signup** (`convex/auth.ts`): `profile(params, ctx)` looks up the org by
  `params.code` (on the `signUp` flow); throws `"Ogiltig kod"` if none found.
  Returns `{ email, activeOrgId: org._id }`. `afterUserCreatedOrUpdated` inserts
  the `memberships` row for the new user. The `signIn` flow requires no code
  (unchanged).
- **Join another org while logged in**: `organizations.join({ code })` →
  validate the code, create a membership if not already a member, switch active
  org to it.
- **Switch active org**: `organizations.setActive({ orgId })` → verify
  membership, set `user.activeOrgId`.
- **Rotate code**: `organizations.rotateCode()` → any member regenerates the
  active org's `joinCode` (flat roles).

Code generation: short, URL-safe, random, uniqueness-checked against
`by_joinCode`.

## 4. Migration (widen → backfill → narrow)

Uses the `@convex-dev/migrations` pattern. **Additive and reversible-safe — no
deletes, no field overwrites.**

1. **Widen:** ship `orgId` as `v.optional(...)` on all business tables; add
   `organizations`, `memberships`, and `users.activeOrgId`. `requireOrg` and
   handlers tolerate a missing/optional `orgId` during this phase only.
2. **Backfill** (idempotent internal migration):
   - Create one `organizations` row (`namn: "Boköring"`, generated `joinCode`)
     if none exists; reuse it on re-runs.
   - Set `orgId` on every existing `contacts` / `leads` / `projects` / `tasks` /
     `notes` / `settings` row that lacks one, pointing at the default org.
   - Create a `memberships` row for every existing user (skip if present) and set
     each user's `activeOrgId` to the default org if unset.
   - Re-runnable: only touches rows still missing the value.
3. **Verify:** confirm zero business rows remain without an `orgId` before
   proceeding. Document this as a gate.
4. **Narrow:** change `orgId` to required (`v.id("organizations")`) and remove
   the optional fallbacks in `requireOrg`/handlers.

The narrow step must not run until the verify gate passes in the target
deployment.

## 5. Cron

`convex/crons.ts` `archiveStaleDone` loops over `organizations`, reads each org's
`settings` row, and archives that org's stale Done tasks — instead of a single
global `settings` row plus all tasks.

## 6. Frontend

- **Login screen** (`src/components/LoginScreen`): the code field becomes
  "organisationskod"; copy update; surfaces `"Ogiltig kod"` on a bad code.
- **Org context:** a small `OrgProvider` exposes the active org and the member's
  org list (from a `viewer`-style query) so views don't each refetch.
- **Org switcher** in `src/components/Sidebar`: shown only when the user has 2+
  memberships; calls `setActive`. Single-org users just see the org name.
- **Org settings / create-join:** a panel in the existing settings modal to
  create an org, view/rotate the join code, and join another org by code.

## 7. Testing

Each backend module already has a `.test.ts`. Add:

- **Cross-org isolation:** a user in org A cannot read or update org B's rows
  (leads, contacts, tasks, projects, notes, settings).
- **Signup:** signup with a valid code creates the membership and sets
  `activeOrgId`; a bad code is rejected before account creation.
- **Org lifecycle:** create / join / setActive / rotateCode happy paths and
  failure paths (non-member switch, duplicate join, bad code).
- **removeMember:** detaches the member and nulls their ownership within the org;
  cannot remove from an org you're not in.
- **Migration:** a test asserting the backfill assigns every legacy row to the
  default org and creates memberships for all users; re-running is a no-op.

Existing tests get a shared setup helper that creates an org + membership and
stamps `orgId` on fixtures.

## Out of scope

- Full account deletion (replaced by per-org `removeMember`).
- Org-level roles/permissions beyond flat membership.
- Per-org branding/theming.
- `contactReads` and `userProfiles` org scoping (intentionally global).
