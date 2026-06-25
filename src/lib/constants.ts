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

// Board element color palette (presentation-only; backend stores whatever string the client sends).
export const BOARD_COLORS = ["#ffe9a8", "#f7c9d6", "#c8e6c9", "#bbdefb", "#d1c4e9", "#ffccbc", "#1f1b16"];

export const BOARD_TOOLS = ["select", "note", "text", "rect", "circle", "line"] as const;
export type BoardTool = (typeof BOARD_TOOLS)[number];

// Pointer movement (px) before a press becomes a drag.
export const BOARD_DRAG_THRESHOLD = 4;

// Board text sizing. Defaults per kind when an element has no explicit fontSize.
export const BOARD_FONT_DEFAULT: Record<string, number> = { note: 13, text: 16, rect: 13, circle: 13 };
export const BOARD_FONT_MIN = 10;
export const BOARD_FONT_MAX = 48;
export const BOARD_FONT_STEP = 2;
