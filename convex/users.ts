import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOrg } from "./helpers";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get("users", userId);
    return user ? { email: user.email ?? null } : null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { userId: me, orgId } = await requireOrg(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const profiles = await ctx.db.query("userProfiles").collect();
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    const out = [];
    for (const m of memberships) {
      const u = await ctx.db.get("users", m.userId);
      if (!u) continue;
      out.push({
        _id: u._id,
        email: u.email ?? null,
        displayName:
          nameById.get(u._id) || (u.email ? u.email.split("@")[0] : "Användare"),
        isSelf: u._id === me,
      });
    }
    return out;
  },
});

// Remove a user from the active org: delete their membership and null their
// ownership on this org's leads/tasks. Does not delete the user account.
export const removeMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: me, orgId } = await requireOrg(ctx);
    if (me === userId) throw new Error("Du kan inte ta bort dig själv");

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    if (!membership) throw new Error("Användaren är inte med i organisationen");

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const l of leads) {
      if (l.orgId === orgId) await ctx.db.patch("leads", l._id, { agareId: undefined });
    }
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const tk of tasks) {
      if (tk.orgId === orgId) await ctx.db.patch("tasks", tk._id, { agareId: undefined });
    }

    await ctx.db.delete("memberships", membership._id);

    // If this was the user's active org, clear the pointer so they re-pick on next load.
    const removed = await ctx.db.get("users", userId);
    if (removed?.activeOrgId === orgId) {
      const another = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      await ctx.db.patch("users", userId, { activeOrgId: another?.orgId });
    }
  },
});
