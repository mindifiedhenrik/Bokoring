import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BOARD_COLORS, type BoardTool } from "../../lib/constants";
import BoardTabs from "./BoardTabs";
import Toolbar from "./Toolbar";
import Canvas from "./Canvas";

export default function BoardView() {
  const boards = useQuery(api.boards.list) ?? [];
  const [activeId, setActiveId] = useState<Id<"boards"> | null>(null);
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const elements = useQuery(api.boardElements.listByBoard, activeId ? { boardId: activeId } : "skip") ?? [];

  // Default to the first board once boards load / after deletion.
  useEffect(() => {
    if (boards.length === 0) { setActiveId(null); return; }
    if (!activeId || !boards.some((b) => b._id === activeId)) {
      setActiveId(boards[0]._id);
    }
  }, [boards, activeId]);

  return (
    <div className="board-view">
      <BoardTabs boards={boards} activeId={activeId} onSelect={setActiveId} />
      <Toolbar tool={tool} color={color} onTool={setTool} onColor={setColor} />
      {activeId === null ? (
        <div className="board-empty">Ingen tavla ännu. Skapa en med "+ Ny tavla".</div>
      ) : (
        <Canvas elements={elements} />
      )}
    </div>
  );
}
