import { mutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireOrg } from "./helpers";

// Unambiguous alphabet (no I/O/0/1). Math.random is allowed in Convex mutations.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

// Generate a join code not currently in use.
async function genJoinCode(ctx: { db: any }): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const clash = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q: any) => q.eq("joinCode", code))
      .first();
    if (!clash) return code;
  }
  throw new Error("Kunde inte generera unik kod");
}

export const findByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim()))
      .first();
  },
});

export const create = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const joinCode = await genJoinCode(ctx);
    const orgId = await ctx.db.insert("organizations", { namn: namn.trim() || "Organisation", joinCode });
    await ctx.db.insert("memberships", { userId, orgId });
    await ctx.db.patch("users", userId, { activeOrgId: orgId });
    return { orgId, joinCode };
  },
});

export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", code.trim()))
      .first();
    if (!org) throw new Error("Ogiltig kod");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", org._id))
      .first();
    if (!existing) await ctx.db.insert("memberships", { userId, orgId: org._id });
    await ctx.db.patch("users", userId, { activeOrgId: org._id });
    return { orgId: org._id, namn: org.namn };
  },
});

export const setActive = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, { orgId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Inte inloggad");
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user_org", (q) => q.eq("userId", userId).eq("orgId", orgId))
      .first();
    if (!membership) throw new Error("Ingen åtkomst till organisationen");
    await ctx.db.patch("users", userId, { activeOrgId: orgId });
  },
});

export const rotateCode = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const joinCode = await genJoinCode(ctx);
    await ctx.db.patch("organizations", orgId, { joinCode });
    return { joinCode };
  },
});

export const myOrgs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { activeOrgId: null, orgs: [] };
    const user = await ctx.db.get("users", userId);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const orgs = [];
    for (const m of memberships) {
      const org = await ctx.db.get("organizations", m.orgId);
      if (org) orgs.push({ _id: org._id, namn: org.namn });
    }
    return { activeOrgId: user?.activeOrgId ?? null, orgs };
  },
});

// The active org's display details, including the join code to share.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireOrg(ctx);
    const org = await ctx.db.get("organizations", orgId);
    return org ? { _id: org._id, namn: org.namn, joinCode: org.joinCode } : null;
  },
});

// Rename the active org (any member may rename — flat roles).
export const rename = mutation({
  args: { namn: v.string() },
  handler: async (ctx, { namn }) => {
    const { orgId } = await requireOrg(ctx);
    const clean = namn.trim();
    if (!clean) throw new Error("Namn krävs");
    await ctx.db.patch("organizations", orgId, { namn: clean });
  },
});
