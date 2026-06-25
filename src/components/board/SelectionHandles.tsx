import type { Doc } from "../../../convex/_generated/dataModel";
import { normalizeRect } from "../../lib/board";

// Renders a selection box + corner handles for an element, inside the SVG <g>.
// onResizeStart reports which corner the user grabbed.
export default function SelectionHandles({
  el, onResizeStart,
}: {
  el: Doc<"boardElements">;
  onResizeStart: (corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => void;
}) {
  const box = el.kind === "line"
    ? normalizeRect({ x: el.x, y: el.y, w: el.w, h: el.h })
    : { x: el.x, y: el.y, w: Math.max(1, el.w), h: Math.max(1, el.h) };
  const corners: Array<{ id: "nw" | "ne" | "sw" | "se"; cx: number; cy: number }> = [
    { id: "nw", cx: box.x, cy: box.y },
    { id: "ne", cx: box.x + box.w, cy: box.y },
    { id: "sw", cx: box.x, cy: box.y + box.h },
    { id: "se", cx: box.x + box.w, cy: box.y + box.h },
  ];
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#c45b32" strokeDasharray="4 3" strokeWidth={1} />
      {corners.map((c) => (
        <rect
          key={c.id}
          x={c.cx - 5} y={c.cy - 5} width={10} height={10}
          fill="#fffdf8" stroke="#c45b32" strokeWidth={1}
          style={{ cursor: c.id === "nw" || c.id === "se" ? "nwse-resize" : "nesw-resize" }}
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(c.id, e); }}
        />
      ))}
    </g>
  );
}
