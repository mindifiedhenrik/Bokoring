import { useRef } from "react";

export type Inverse = () => Promise<void> | void;

// Plain factory (testable without React): a LIFO stack of inverse operations.
export function createUndoStack() {
  const stack: Inverse[] = [];
  return {
    record(inverse: Inverse) { stack.push(inverse); },
    async undo() {
      const inverse = stack.pop();
      if (inverse) await inverse();
    },
    clear() { stack.length = 0; },
  };
}

// React hook wrapper: a single stable stack instance per mounted board.
export function useUndo() {
  const ref = useRef<ReturnType<typeof createUndoStack> | null>(null);
  if (ref.current === null) ref.current = createUndoStack();
  return ref.current;
}
