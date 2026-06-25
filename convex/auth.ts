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
