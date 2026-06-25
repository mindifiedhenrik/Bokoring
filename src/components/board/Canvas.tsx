import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { screenToWorld } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";
import { useViewport } from "./useViewport";
import { useCanvasInteractions } from "./useCanvasInteractions";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";
import ShapeFrame from "./elements/ShapeFrame";
import SelectionHandles from "./SelectionHandles";
import { usePresence } from "./usePresence";
import Cursors from "./Cursors";

type El = Doc<"boardElements">;

export type CanvasHandle = { createNoteAt: (clientX: number, clientY: number, color: string) => void };

type Props = {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  setTool: (t: BoardTool) => void;
  color: string;
  fontSize: number;
  bold: boolean;
  selectedIds: Id<"boardElements">[];
  setSelectedIds: (ids: Id<"boardElements">[]) => void;
  record: (inverse: () => Promise<void> | void) => void;
  undo: () => void;
};

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { boardId, elements, tool, setTool, color, fontSize, bold, selectedIds, setSelectedIds, record, undo }, fwdRef,
) {
  const { vp, pan, zoom } = useViewport();
  const { others, report } = usePresence(boardId);
  const update = useMutation(api.boardElements.update);
  const create = useMutation(api.boardElements.create);
  const removeEl = useMutation(api.boardElements.remove);
  const ref = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<Id<"boardElements"> | null>(null);

  const ix = useCanvasInteractions({
    boardId, elements, tool, setTool, color, fontSize, bold, vp, pan,
    selectedIds, setSelectedIds, setEditingId, containerRef: ref, record,
  });

  useImperativeHandle(fwdRef, () => ({ createNoteAt: ix.createNoteAt }), [ix.createNoteAt]);

  const reportMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    report(screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, vp));
  };

  const geoOf = (el: El): El => (ix.live[el._id] ? { ...el, ...ix.live[el._id] } : el);
  const commitText = async (id: Id<"boardElements">, text: string) => {
    const prev = elements.find((e) => e._id === id)?.text ?? "";
    await update({ id, text });
    record(() => { void update({ id, text: prev }); });
    setEditingId(null);
  };

  // wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      zoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [zoom]);

  // keyboard: delete (multi), Esc/Space -> select, Cmd/Ctrl+Z -> undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editing = document.activeElement?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (editing) return; // let the textarea do its own undo
        e.preventDefault();
        undo();
        return;
      }
      if (editing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        const saved = elements.filter((el) => selectedIds.includes(el._id));
        for (const el of saved) removeEl({ id: el._id });
        record(async () => {
          for (const el of saved) {
            // Recreated elements get a NEW id, so undo entries recorded before a delete that
            // reference the old id become no-ops (acceptable for v1 undo).
            await create({
              boardId, kind: el.kind, x: el.x, y: el.y, w: el.w, h: el.h,
              text: el.text, color: el.color, fontSize: el.fontSize, bold: el.bold,
              order: el.order,
            });
          }
        });
        setSelectedIds([]);
      } else if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, elements, boardId, removeEl, create, record, setSelectedIds, setTool, undo]);

  // clear editing when its element leaves the selection
  useEffect(() => {
    if (editingId && !selectedIds.includes(editingId)) setEditingId(null);
  }, [selectedIds, editingId]);

  const transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
  const lines = elements.filter((el) => el.kind === "line");
  const boxes = elements.filter((el) => el.kind === "rect" || el.kind === "circle");
  const notesTexts = elements.filter((el) => el.kind === "note" || el.kind === "text");
  const sel = (id: Id<"boardElements">) => selectedIds.includes(id);
  const single = selectedIds.length === 1 ? elements.find((e) => e._id === selectedIds[0]) : null;

  return (
    <div
      ref={ref}
      className={"board-canvas" + (tool === "select" ? "" : " placing")}
      onPointerDown={ix.onPointerDown}
      onPointerMove={(e) => { reportMove(e); ix.onPointerMove(e); }}
      onPointerUp={ix.onPointerUp}
    >
      <svg className="board-svg" width="100%" height="100%">
        <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>
          {lines.map((el) => (
            <g key={el._id} onPointerDown={(e) => ix.startMove(el, e)} style={{ cursor: tool === "select" ? "move" : "crosshair" }}>
              <ShapeElement el={geoOf(el)} selected={sel(el._id)} />
            </g>
          ))}
          {boxes.map((el) => (
            <ShapeElement key={el._id} el={geoOf(el)} selected={sel(el._id)} />
          ))}
          {ix.draft && (
            <g opacity={0.6}>
              <ShapeElement el={{ ...ix.draft, _id: "draft" as Id<"boardElements">, text: undefined } as unknown as El} selected={false} />
            </g>
          )}
          {single && (
            <SelectionHandles el={geoOf(single)} onResizeStart={(corner, e) => ix.startResize(single, corner, e)} />
          )}
          <Cursors cursors={others} />
        </g>
      </svg>

      <div className="board-html-layer" style={{ transform, transformOrigin: "0 0" }}>
        {boxes.map((el) => (
          <ShapeFrame
            key={el._id}
            el={geoOf(el)}
            selected={sel(el._id)}
            editing={el._id === editingId}
            onCommitText={(text) => commitText(el._id, text)}
            onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
            onPointerDown={(e) => ix.startMove(el, e)}
          />
        ))}
        {notesTexts.map((el) =>
          el.kind === "note" ? (
            <NoteElement
              key={el._id}
              el={geoOf(el)}
              selected={sel(el._id)}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
              onPointerDown={(e) => ix.startMove(el, e)}
            />
          ) : (
            <TextElement
              key={el._id}
              el={geoOf(el)}
              selected={sel(el._id)}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { setSelectedIds([el._id]); setEditingId(el._id); }}
              onPointerDown={(e) => ix.startMove(el, e)}
            />
          ),
        )}
      </div>

      {ix.marquee && (
        <div className="board-marquee" style={{ left: ix.marquee.x, top: ix.marquee.y, width: ix.marquee.w, height: ix.marquee.h }} />
      )}
    </div>
  );
});

export default Canvas;
