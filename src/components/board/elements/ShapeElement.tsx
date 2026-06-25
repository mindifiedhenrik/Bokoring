import type { Doc } from "../../../../convex/_generated/dataModel";

// Renders one shape element as an SVG primitive in world coordinates.
// (x,y,w,h) are world coords; the parent <g> applies the pan/zoom transform.
export default function ShapeElement({ el, selected }: { el: Doc<"boardElements">; selected: boolean }) {
  const stroke = el.color;
  const sw = selected ? 3 : 2;
  if (el.kind === "line") {
    return <line x1={el.x} y1={el.y} x2={el.x + el.w} y2={el.y + el.h} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />;
  }
  if (el.kind === "rect") {
    return <rect x={el.x} y={el.y} width={Math.max(1, el.w)} height={Math.max(1, el.h)} fill="none" stroke={stroke} strokeWidth={sw} rx={4} style={{ pointerEvents: "none" }} />;
  }
  // circle: bounding box (x,y,w,h) -> ellipse
  return (
    <ellipse
      cx={el.x + el.w / 2}
      cy={el.y + el.h / 2}
      rx={Math.max(1, Math.abs(el.w / 2))}
      ry={Math.max(1, Math.abs(el.h / 2))}
      fill="none" stroke={stroke} strokeWidth={sw}
      style={{ pointerEvents: "none" }}
    />
  );
}
