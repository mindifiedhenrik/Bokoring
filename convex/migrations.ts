import { internalMutation } from "./_generated/server";

// Engångsmigrering: ta bort legacy fritextfältet `agare` från alla leads/tasks
// så att den smalnade schemadefinitionen (utan `agare`) validerar mot befintliga
// dokument. Ansvarig hanteras hädanefter via `agareId`.
export const dropLegacyAgare = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0;
    for (const l of await ctx.db.query("leads").collect()) {
      if ("agare" in l) {
        await ctx.db.patch("leads", l._id, { agare: undefined });
        cleared++;
      }
    }
    for (const t of await ctx.db.query("tasks").collect()) {
      if ("agare" in t) {
        await ctx.db.patch("tasks", t._id, { agare: undefined });
        cleared++;
      }
    }
    return { cleared };
  },
});
