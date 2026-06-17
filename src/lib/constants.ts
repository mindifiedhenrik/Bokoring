export const STAGES = ["Lead", "Kvalificerat", "Förslag", "Offererat", "Stängd"] as const;
export const STAGE_VAR: Record<string, string> = {
  Lead: "var(--s0)", Kvalificerat: "var(--s1)", Förslag: "var(--s2)",
  Offererat: "var(--s3)", Stängd: "var(--s4)",
};
export const TASK_STATUSES = ["Backlog", "Todo", "In Progress", "In Review", "Done"] as const;
export const PRIORITIES = ["Låg", "Normal", "Hög"] as const;
export const PRIORITY_CLASS: Record<string, string> = { Låg: "low", Normal: "normal", Hög: "high" };
