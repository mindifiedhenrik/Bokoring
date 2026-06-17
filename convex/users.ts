import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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
    const me = await getAuthUserId(ctx);
    if (!me) throw new Error("Inte inloggad");
    const users = await ctx.db.query("users").collect();
    const profiles = await ctx.db.query("userProfiles").collect();
    const nameById = new Map(profiles.map((p) => [p.userId, p.displayName]));
    return users.map((u) => ({
      _id: u._id,
      email: u.email ?? null,
      displayName:
        nameById.get(u._id) || (u.email ? u.email.split("@")[0] : "Användare"),
      isSelf: u._id === me,
    }));
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await getAuthUserId(ctx);
    if (!me) throw new Error("Inte inloggad");
    if (me === userId) throw new Error("Du kan inte radera ditt eget konto");

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const l of leads) await ctx.db.patch("leads", l._id, { agareId: undefined });
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_agare", (q) => q.eq("agareId", userId))
      .collect();
    for (const t of tasks) await ctx.db.patch("tasks", t._id, { agareId: undefined });

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const acc of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", acc._id))
        .collect();
      for (const c of codes) await ctx.db.delete("authVerificationCodes", c._id);
      await ctx.db.delete("authAccounts", acc._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const s of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
        .collect();
      for (const tok of tokens) await ctx.db.delete("authRefreshTokens", tok._id);
      await ctx.db.delete("authSessions", s._id);
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profile) await ctx.db.delete("userProfiles", profile._id);
    await ctx.db.delete("users", userId);
  },
});
