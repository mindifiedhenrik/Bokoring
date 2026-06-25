import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { normalizeRect } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";
import { useViewport } from "./useViewport";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";
import SelectionHandles from "./SelectionHandles";
import { usePresence } from "./usePresence";
import Cursors from "./Cursors";

type El = Doc<"boardElements">;

export default function Canvas({
  boardId, elements, tool, color, selectedId, onSelect,
}: {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  color: string;
  selectedId: Id<"boardElements"> | null;
  onSelect: (id: Id<"boardElements"> | null) => void;
}) {
  const { vp, pan, zoom, toWorld } = useViewport();
  const { others, report } = usePresence(boardId);
  const create = useMutation(api.boardElements.create);
  const update = useMutation(api.boardElements.update);
  const removeEl = useMutation(api.boardElements.remove);
  const ref = useRef<HTMLDivElement>(null);
  const panState = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<Id<"boardElements"> | null>(null);
  const [drag, setDrag] = useState<null | {
    id: Id<"boardElements">;
    mode: "move" | "nw" | "ne" | "sw" | "se";
    startWorld: { x: number; y: number };
    orig: { x: number; y: number; w: number; h: number };
    live: { x: number; y: number; w: number; h: number };
  }>(null);

  const screenInCanvas = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startMove = (el: El, e: React.PointerEvent) => {
    if (tool !== "select") return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    e.stopPropagation();
    (ref.current as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(el._id);
    setDrag({
      id: el._id, mode: "move",
      startWorld: toWorld(screenInCanvas(e)),
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
      live: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };

  const startResize = (el: El, corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
    (ref.current as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(el._id);
    setDrag({
      id: el._id, mode: corner,
      startWorld: toWorld(screenInCanvas(e)),
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
      live: { x: el.x, y: el.y, w: el.w, h: el.h },
    });
  };

  const commitText = async (id: Id<"boardElements">, text: string) => {
    await update({ id, text });
    setEditingId(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const onEmpty = e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("board-svg");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      if (onEmpty) {
        onSelect(null);
        panState.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    // Drawing tools start from the world point under the cursor.
    const w = toWorld(screenInCanvas(e));
    drawStart.current = w;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    report(toWorld(screenInCanvas(e)));
    if (drag) {
      const w = toWorld(screenInCanvas(e));
      const dx = w.x - drag.startWorld.x;
      const dy = w.y - drag.startWorld.y;
      const o = drag.orig;
      let live = { ...o };
      if (drag.mode === "move") {
        live = { ...o, x: o.x + dx, y: o.y + dy };
      } else {
        // Resize from a corner; allow negative -> handled at commit via normalizeRect for box shapes.
        if (drag.mode === "nw") live = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
        if (drag.mode === "ne") live = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
        if (drag.mode === "sw") live = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
        if (drag.mode === "se") live = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      }
      setDrag({ ...drag, live });
      return;
    }
    if (panState.current) {
      pan(e.clientX - panState.current.x, e.clientY - panState.current.y);
      panState.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (drag) {
      const el = elements.find((x) => x._id === drag.id);
      let geo = drag.live;
      // Keep box shapes/notes positive; lines may stay as a vector.
      if (el && el.kind !== "line") geo = normalizeRect(geo);
      try {
        await update({ id: drag.id, x: geo.x, y: geo.y, w: geo.w, h: geo.h });
      } catch {
        /* element gone; ignore */
      }
      setDrag(null);
      return;
    }
    panState.current = null;
    const start = drawStart.current;
    drawStart.current = null;
    if (tool === "select" || !start) return;
    const end = toWorld(screenInCanvas(e));

    if (tool === "note") {
      await create({ boardId, kind: "note", x: start.x, y: start.y, w: 160, h: 120, text: "", color });
    } else if (tool === "text") {
      await create({ boardId, kind: "text", x: start.x, y: start.y, w: 200, h: 40, text: "", color });
    } else if (tool === "line") {
      await create({ boardId, kind: "line", x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, color });
    } else {
      // rect / circle: normalize the drag box; fall back to a default size on a bare click.
      let r = normalizeRect({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
      if (r.w < 4 && r.h < 4) r = { x: start.x, y: start.y, w: 120, h: 90 };
      await create({ boardId, kind: tool, x: r.x, y: r.y, w: r.w, h: r.h, color });
    }
  };

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const active = document.activeElement;
        if (active && active.tagName === "TEXTAREA") return; // don't delete while editing text
        removeEl({ id: selectedId });
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeEl, onSelect]);

  // Clear editing when nothing is selected.
  useEffect(() => {
    if (!selectedId) setEditingId(null);
  }, [selectedId]);

  const transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
  const shapes = elements.filter((el) => el.kind === "line" || el.kind === "rect" || el.kind === "circle");
  const htmlEls = elements.filter((el) => el.kind === "note" || el.kind === "text");

  return (
    <div
      ref={ref}
      className="board-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg className="board-svg" width="100%" height="100%">
        <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>
          {shapes.map((el) => (
            <g key={el._id} onPointerDown={(e) => startMove(el, e)} style={{ cursor: tool === "select" ? "move" : "crosshair" }}>
              <ShapeElement el={drag?.id === el._id ? { ...el, ...drag.live } : el} selected={el._id === selectedId} />
            </g>
          ))}
          {selectedId && (() => {
            const sel = elements.find((x) => x._id === selectedId);
            return sel ? <SelectionHandles el={drag?.id === sel._id ? { ...sel, ...drag.live } : sel} onResizeStart={(corner, e) => startResize(sel, corner, e)} /> : null;
          })()}
          <Cursors cursors={others} />
        </g>
      </svg>
      <div className="board-html-layer" style={{ transform, transformOrigin: "0 0" }}>
        {htmlEls.map((el) =>
          el.kind === "note" ? (
            <NoteElement
              key={el._id}
              el={drag?.id === el._id ? { ...el, ...drag.live } : el}
              selected={el._id === selectedId}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { onSelect(el._id); setEditingId(el._id); }}
              onPointerDown={(e) => startMove(el, e)}
            />
          ) : (
            <TextElement
              key={el._id}
              el={drag?.id === el._id ? { ...el, ...drag.live } : el}
              selected={el._id === selectedId}
              editing={el._id === editingId}
              onCommitText={(text) => commitText(el._id, text)}
              onStartEdit={() => { onSelect(el._id); setEditingId(el._id); }}
              onPointerDown={(e) => startMove(el, e)}
            />
          ),
        )}
      </div>
    </div>
  );
}
