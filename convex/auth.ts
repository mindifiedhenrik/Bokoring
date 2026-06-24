import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { DatabaseReader, DatabaseWriter } from "./_generated/server";

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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      // On sign-up the `code` must match an organization's join code; the new
      // user is enrolled into that org (membership + activeOrgId set in
      // `createOrUpdateUser` below). Sign-in of existing accounts is unaffected
      // (no code required).
      //
      // NOTE: `@convex-dev/auth` 0.0.94 calls this `profile` synchronously (it
      // does NOT await the result), so we cannot do the async org lookup here.
      // We only validate the code's presence and hand it to the awaited
      // `createOrUpdateUser` callback via a transient `joinCode` field, which is
      // stripped before the user document is written.
      profile(params): { email: string; joinCode?: string } {
        const email = params.email as string;
        if (params.flow === "signUp") {
          const code = (params.code as string | undefined)?.trim();
          if (!code) throw new ConvexError("Organisationskod krävs");
          return { email, joinCode: code };
        }
        return { email };
      },
    }),
    Google,
  ],
  callbacks: {
    // Awaited mutation callback with `ctx.db`. Resolves the join code to an org,
    // creates/links the user, sets the active org, and creates the membership.
    // The callback ctx is typed against a generic data model, so we narrow `db`
    // to this deployment's generated DatabaseWriter for index/table typing.
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

      const userData = {
        ...rest,
        ...(orgId ? { activeOrgId: orgId } : null),
        // Google verifies the email; record it to stay consistent with the
        // library's verified-email model. (Our findUserByEmail links by email
        // only, so this field is not load-bearing for linking here.)
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
  },
});
