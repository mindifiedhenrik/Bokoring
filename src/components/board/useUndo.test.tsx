import { expect, test, vi } from "vitest";
import { createUndoStack } from "./useUndo";

test("undo runs the most recent inverse and pops it", async () => {
  const stack = createUndoStack();
  const a = vi.fn(); const b = vi.fn();
  stack.record(a);
  stack.record(b);
  await stack.undo();
  expect(b).toHaveBeenCalledTimes(1);
  expect(a).not.toHaveBeenCalled();
  await stack.undo();
  expect(a).toHaveBeenCalledTimes(1);
  await stack.undo(); // empty: no throw
});

test("clear empties the stack", async () => {
  const stack = createUndoStack();
  const a = vi.fn();
  stack.record(a);
  stack.clear();
  await stack.undo();
  expect(a).not.toHaveBeenCalled();
});
