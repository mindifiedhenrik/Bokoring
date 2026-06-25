import { useRef } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { normalizeRect } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";
import { useViewport } from "./useViewport";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";

type El = Doc<"boardElements">;

export default function Canvas({
  boardId, elements, tool, color,
}: {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  color: string;
}) {
  const { vp, pan, zoom, toWorld } = useViewport();
  const create = useMutation(api.boardElements.create);
  const ref = useRef<HTMLDivElement>(null);
  const panState = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const screenInCanvas = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const onEmpty = e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("board-svg");
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      if (onEmpty) panState.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // Drawing tools start from the world point under the cursor.
    const w = toWorld(screenInCanvas(e));
    drawStart.current = w;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panState.current) {
      pan(e.clientX - panState.current.x, e.clientY - panState.current.y);
      panState.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
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

  const onWheel = (e: React.WheelEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoom(cursor, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

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
      onWheel={onWheel}
    >
      <svg className="board-svg" width="100%" height="100%">
        <g transform={`translate(${vp.panX}, ${vp.panY}) scale(${vp.zoom})`}>
          {shapes.map((el) => (
            <ShapeElement key={el._id} el={el} selected={false} />
          ))}
        </g>
      </svg>
      <div className="board-html-layer" style={{ transform, transformOrigin: "0 0" }}>
        {htmlEls.map((el) =>
          el.kind === "note" ? (
            <NoteElement key={el._id} el={el} selected={false} editing={false} onCommitText={() => {}} onStartEdit={() => {}} />
          ) : (
            <TextElement key={el._id} el={el} selected={false} editing={false} onCommitText={() => {}} onStartEdit={() => {}} />
          ),
        )}
      </div>
    </div>
  );
}
