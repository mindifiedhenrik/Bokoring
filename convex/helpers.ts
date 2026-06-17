import { Auth } from "convex/server";

// All functions require a signed-in user, but data is shared (not filtered per user).
export async function requireAuth(ctx: { auth: Auth }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Inte inloggad");
  return identity;
}

export const PROJECT_COLORS = [
  "#6b8aa8", "#c45b32", "#8a6fa8", "#4f7a52", "#c8923a", "#3f7e8c", "#a8567a",
];
