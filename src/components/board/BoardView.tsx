import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BOARD_COLORS, BOARD_DRAG_THRESHOLD, BOARD_FONT_DEFAULT, BOARD_FONT_MIN, BOARD_FONT_MAX, BOARD_FONT_STEP, type BoardTool } from "../../lib/constants";
import Modal from "../ui/Modal";
import BoardTabs from "./BoardTabs";
import Toolbar from "./Toolbar";
import BoardHelp from "./BoardHelp";
import Canvas, { type CanvasHandle } from "./Canvas";
import { useUndo } from "./useUndo";

export default function BoardView() {
  const boards = useQuery(api.boards.list) ?? [];
  const [activeId, setActiveId] = useState<Id<"boards"> | null>(null);
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [fontSize, setFontSize] = useState<number>(BOARD_FONT_DEFAULT.text);
  const [bold, setBold] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Id<"boardElements">[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const elements = useQuery(api.boardElements.listByBoard, activeId ? { boardId: activeId } : "skip") ?? [];
  const updateEl = useMutation(api.boardElements.update);
  const undo = useUndo();
  const canvasRef = useRef<CanvasHandle>(null);

  // swatch drag (press a color, drag onto the canvas to drop a note)
  const [ghost, setGhost] = useState<{ x: number; y: number; color: string } | null>(null);
  const swatch = useRef<{ color: string; startX: number; startY: number; dragging: boolean } | null>(null);

  useEffect(() => {
    if (boards.length === 0) { setActiveId(null); return; }
    if (!activeId || !boards.some((b) => b._id === activeId)) setActiveId(boards[0]._id);
  }, [boards, activeId]);

  useEffect(() => { setSelectedIds([]); undo.clear(); }, [activeId, undo]);

  const applyToSelection = (patch: { color?: string; fontSize?: number; bold?: boolean }) => {
    const targets = elements.filter((el) => selectedIds.includes(el._id));
    if (targets.length === 0) return;
    const inverses = targets.map((el) => ({ id: el._id, color: el.color, fontSize: el.fontSize, bold: el.bold }));
    for (const el of targets) updateEl({ id: el._id, ...patch });
    undo.record(async () => {
      for (const inv of inverses) {
        await updateEl({ id: inv.id, color: inv.color, fontSize: inv.fontSize ?? undefined, bold: inv.bold ?? undefined });
      }
    });
  };

  const handleColor = (c: string) => { setColor(c); applyToSelection({ color: c }); };
  const handleFontStep = (delta: number) => {
    const next = Math.min(BOARD_FONT_MAX, Math.max(BOARD_FONT_MIN, fontSize + delta * BOARD_FONT_STEP));
    setFontSize(next);
    applyToSelection({ fontSize: next });
  };
  const handleBold = () => { const next = !bold; setBold(next); applyToSelection({ bold: next }); };

  // swatch drag lifecycle
  const onSwatchPointerDown = (c: string, e: React.PointerEvent) => {
    swatch.current = { color: c, startX: e.clientX, startY: e.clientY, dragging: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = swatch.current; if (!s) return;
      if (!s.dragging && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > BOARD_DRAG_THRESHOLD) s.dragging = true;
      if (s.dragging) setGhost({ x: e.clientX, y: e.clientY, color: s.color });
    };
    const up = (e: PointerEvent) => {
      const s = swatch.current; swatch.current = null; setGhost(null);
      if (!s || !s.dragging) return; // a plain click is handled by the swatch's onClick
      const node = document.querySelector(".board-canvas") as HTMLElement | null;
      if (!node) return;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        canvasRef.current?.createNoteAt(e.clientX, e.clientY, s.color);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  return (
    <div className="board-view">
      <BoardTabs boards={boards} activeId={activeId} onSelect={setActiveId} />
      <Toolbar
        tool={tool} color={color} bold={bold} fontSize={fontSize}
        onTool={setTool} onColor={handleColor} onSwatchPointerDown={onSwatchPointerDown}
        onFontStep={handleFontStep} onBold={handleBold} onHelp={() => setHelpOpen(true)}
      />
      {activeId === null ? (
        <div className="board-empty">Ingen tavla ännu. Skapa en med "+ Ny tavla".</div>
      ) : (
        <Canvas
          ref={canvasRef}
          boardId={activeId} elements={elements} tool={tool} setTool={setTool}
          color={color} fontSize={fontSize} bold={bold}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds}
          record={undo.record} undo={undo.undo}
        />
      )}
      {ghost && (
        <div className="board-swatch-ghost" style={{ left: ghost.x, top: ghost.y, background: ghost.color }} />
      )}
      {helpOpen && <Modal onClose={() => setHelpOpen(false)}><BoardHelp onClose={() => setHelpOpen(false)} /></Modal>}
    </div>
  );
}
