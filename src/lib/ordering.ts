type Orderable = { order?: number; _creationTime: number };
const ord = (x: Orderable) => x.order ?? x._creationTime;

// items: the target group's rows sorted ascending, EXCLUDING the dragged row.
// index: insertion position, 0..items.length. Returns the new order value.
export function orderForIndex(items: Orderable[], index: number): number {
  const prev = items[index - 1];
  const next = items[index];
  if (!prev && !next) return Date.now();
  if (!prev) return ord(next) - 1;
  if (!next) return ord(prev) + 1;
  return (ord(prev) + ord(next)) / 2;
}

export type DropHint = { key: string; id: string | null; before: boolean };

// Resolve an insertion index from a drop hint, given the group's rows sorted
// ascending with the dragged row removed (excl).
export function insertIndexFromHint(
  excl: { _id: string }[],
  hint: { id: string | null; before: boolean },
): number {
  if (hint.id === null) return excl.length;
  const targetIdx = excl.findIndex((x) => x._id === hint.id);
  if (targetIdx === -1) return excl.length;
  return hint.before ? targetIdx : targetIdx + 1;
}
