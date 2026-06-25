import { useRef } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useViewport } from "./useViewport";
import ShapeElement from "./elements/ShapeElement";
import NoteElement from "./elements/NoteElement";
import TextElement from "./elements/TextElement";

type El = Doc<"boardElements">;

export default function Canvas({ elements }: { elements: El[] }) {
  const { vp, pan, zoom } = useViewport();
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Pan only when the empty canvas is the target.
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("board-svg")) {
      dragging.current = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) {
      pan(e.clientX - dragging.current.x, e.clientY - dragging.current.y);
      dragging.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = () => { dragging.current = null; };

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
