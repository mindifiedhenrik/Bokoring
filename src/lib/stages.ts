import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type Stage = Doc<"stages">;

// Color for log entries whose stage was renamed or deleted since.
export const NEUTRAL_STAGE_COLOR = "var(--line)";

// The active org's pipeline stages, left → right. Empty while loading.
export function useStages(): Stage[] {
  return useQuery(api.stages.list) ?? [];
}

export function stageById(stages: Stage[], id: Id<"stages"> | undefined) {
  return id ? stages.find((s) => s._id === id) : undefined;
}

export function stageColorByName(stages: Stage[], name: string | null | undefined) {
  return stages.find((s) => s.namn === name)?.color ?? NEUTRAL_STAGE_COLOR;
}

// User-facing text for a failed mutation: our ConvexError messages, else generic.
export function errorMessage(err: unknown) {
  return err instanceof ConvexError && typeof err.data === "string" ? err.data : "Något gick fel";
}
