import { convexTest } from "convex-test";
import schema from "./schema";
import { Id } from "./_generated/dataModel";

export { schema };
export const modules = import.meta.glob("./**/*.ts");

/**
 * Create an org + a member user and return a client acting as that user.
 * Use the returned `as` client for api calls; mutations will stamp `orgId`
 * from the user's active org automatically.
 */
export async function setupOrg(
  t: ReturnType<typeof convexTest>,
  opts?: { namn?: string; joinCode?: string; email?: string },
) {
  const { orgId, userId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", {
      namn: opts?.namn ?? "Testorg",
      joinCode: opts?.joinCode ?? "TESTCODE",
    });
    const userId = await ctx.db.insert("users", {
      email: opts?.email ?? "user@firma.se",
      activeOrgId: orgId,
    });
    await ctx.db.insert("memberships", { userId, orgId });
    return { orgId, userId };
  });
  const as = t.withIdentity({ subject: `${userId}|s` });
  return { orgId: orgId as Id<"organizations">, userId: userId as Id<"users">, as };
}
