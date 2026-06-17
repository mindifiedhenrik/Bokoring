import type { Id } from "../../convex/_generated/dataModel";

type UserLite = { _id: Id<"users">; displayName: string };

/** Display name for a card owner, or null when unassigned/unknown. */
export function ownerName(users: UserLite[], id?: Id<"users">): string | null {
  if (!id) return null;
  return users.find((u) => u._id === id)?.displayName ?? null;
}
