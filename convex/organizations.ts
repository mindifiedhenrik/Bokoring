import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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
