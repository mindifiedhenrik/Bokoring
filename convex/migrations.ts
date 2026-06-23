import { internalMutation, internalQuery } from "./_generated/server";

const DEFAULT_ORG_NAME = "Boköring";
const DEFAULT_JOIN_CODE = "BOKORING";

const BUSINESS_TABLES = ["contacts", "leads", "projects", "tasks", "notes", "settings"] as const;

// Find or create the single default org all legacy data is assigned to.
async function ensureDefaultOrg(ctx: any) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_joinCode", (q: any) => q.eq("joinCode", DEFAULT_JOIN_CODE))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("organizations", {
    namn: DEFAULT_ORG_NAME,
    joinCode: DEFAULT_JOIN_CODE,
  });
}

// Additive backfill: assigns orgId to legacy rows, enrols all users.
// Never deletes or overwrites existing values. Safe to run repeatedly.
export const backfillOrgs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgId = await ensureDefaultOrg(ctx);

    for (const table of BUSINESS_TABLES) {
      const rows = await (ctx.db as any).query(table).collect();
      for (const row of rows) {
        if ((row as any).orgId === undefined) {
          await (ctx.db as any).patch(table, row._id, { orgId });
        }
      }
    }

    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_user_org", (q) => q.eq("userId", user._id).eq("orgId", orgId))
        .first();
      if (!membership) await ctx.db.insert("memberships", { userId: user._id, orgId });
      if (user.activeOrgId === undefined) {
        await ctx.db.patch("users", user._id, { activeOrgId: orgId });
      }
    }

    return { orgId };
  },
});

// Read-only gate: confirm no legacy rows or users are left unassigned.
export const verifyOrgs = internalQuery({
  args: {},
  handler: async (ctx) => {
    let rowsMissingOrgId = 0;
    for (const table of BUSINESS_TABLES) {
      const rows = await (ctx.db as any).query(table).collect();
      rowsMissingOrgId += rows.filter((r: any) => r.orgId === undefined).length;
    }
    const users = await ctx.db.query("users").collect();
    let usersMissingMembership = 0;
    for (const user of users) {
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();
      if (!m || user.activeOrgId === undefined) usersMissingMembership += 1;
    }
    return { rowsMissingOrgId, usersMissingMembership };
  },
});
