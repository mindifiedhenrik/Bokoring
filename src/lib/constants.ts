export const STAGES = ["Lead", "Kvalificerat", "Förslag", "Offererat", "Stängd"] as const;
export const STAGE_VAR: Record<string, string> = {
  Lead: "var(--s0)", Kvalificerat: "var(--s1)", Förslag: "var(--s2)",
  Offererat: "var(--s3)", Stängd: "var(--s4)",
};
export const TASK_STATUSES = ["Backlog", "Todo", "In Progress", "In Review", "Done"] as const;
export const PRIORITIES = ["Låg", "Normal", "Hög"] as const;
export const PRIORITY_CLASS: Record<string, string> = { Låg: "low", Normal: "normal", Hög: "high" };

// Swatch palette for milestone markers (mirrors PROJECT_COLORS in convex/helpers.ts).
export const MILESTONE_COLORS = ["#6b8aa8", "#c45b32", "#8a6fa8", "#4f7a52", "#c8923a", "#3f7e8c", "#a8567a"];
