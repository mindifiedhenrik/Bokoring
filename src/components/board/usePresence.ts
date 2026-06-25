import { useCallback, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Point } from "../../lib/board";

export function usePresence(boardId: Id<"boards"> | null) {
  const heartbeat = useMutation(api.boardPresence.heartbeat);
  const others = useQuery(api.boardPresence.listByBoard, boardId ? { boardId } : "skip") ?? [];
  const last = useRef(0);
  const report = useCallback((world: Point) => {
    if (!boardId) return;
    const now = Date.now();
    if (now - last.current < 60) return; // throttle to ~16/sec
    last.current = now;
    heartbeat({ boardId, x: world.x, y: world.y });
  }, [boardId, heartbeat]);
  return { others, report };
}
