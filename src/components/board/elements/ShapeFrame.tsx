import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { BOARD_FONT_DEFAULT } from "../../../lib/constants";

// Transparent HTML overlay covering a rect/circle's bounding box. Provides the wide
// hit area (select/move) and an editable centered label. The visible outline is the
// SVG ShapeElement underneath (pointer-events: none).
export default function ShapeFrame({
  el, selected, editing, onCommitText, onStartEdit, onPointerDown,
}: {
  el: Doc<"boardElements">;
  selected: boolean;
  editing: boolean;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const [draftText, setDraftText] = useState(el.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { setDraftText(el.text ?? ""); ref.current?.focus(); } }, [editing, el.text]);

  return (
    <div
      className={"board-shape-frame" + (selected ? " selected" : "") + (el.kind === "circle" ? " circle" : "")}
      style={{
        left: el.x, top: el.y, width: Math.max(1, el.w), height: Math.max(1, el.h),
        fontSize: el.fontSize ?? BOARD_FONT_DEFAULT.rect,
        fontWeight: el.bold ? 700 : 400,
      }}
      onDoubleClick={onStartEdit}
      onPointerDown={onPointerDown}
      data-element-id={el._id}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={() => onCommitText(draftText)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } }}
        />
      ) : (
        <div className="board-shape-text">{el.text}</div>
      )}
    </div>
  );
}
