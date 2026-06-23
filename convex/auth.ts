import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import { DatabaseWriter } from "./_generated/server";

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
  ],
  callbacks: {
    // Awaited mutation callback with `ctx.db`. Resolves the join code to an org,
    // creates/links the user, sets the active org, and creates the membership.
    // The callback ctx is typed against a generic data model, so we narrow `db`
    // to this deployment's generated DatabaseWriter for index/table typing.
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
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
      const userData = { ...rest, ...(orgId ? { activeOrgId: orgId } : null) };

      let userId: Id<"users">;
      if (existingUserId) {
        userId = existingUserId as Id<"users">;
        await db.patch(userId, userData);
      } else {
        userId = await db.insert("users", userData);
      }

      if (orgId) {
        const existing = await db
          .query("memberships")
          .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId!))
          .first();
        if (!existing) await db.insert("memberships", { userId, orgId });
      }

      return userId;
    },
  },
});
