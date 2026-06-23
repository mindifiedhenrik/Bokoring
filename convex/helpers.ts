import { Auth } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "./_generated/server";

// All functions require a signed-in user, but data is shared (not filtered per user).
export async function requireAuth(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Inte inloggad");
  return identity;
}

// Resolve the caller's active organization and verify membership.
// Returns the signed-in userId and the orgId all data must be scoped to.
export async function requireOrg(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Inte inloggad");
  const user = await ctx.db.get("users", userId);
  const orgId = user?.activeOrgId;
  if (!orgId) throw new Error("Ingen aktiv organisation");
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
    .first();
  if (!membership) throw new Error("Ingen åtkomst till organisationen");
  return { userId, orgId };
}

export const PROJECT_COLORS = [
  "#6b8aa8", "#c45b32", "#8a6fa8", "#4f7a52", "#c8923a", "#3f7e8c", "#a8567a",
];
