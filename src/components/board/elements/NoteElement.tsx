import { useEffect, useRef, useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";

export default function NoteElement({
  el, selected, editing, onCommitText, onStartEdit, onPointerDown,
}: {
  el: Doc<"boardElements">;
  selected: boolean;
  editing: boolean;
  onCommitText: (text: string) => void;
  onStartEdit: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const [draft, setDraft] = useState(el.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) { setDraft(el.text ?? ""); ref.current?.focus(); } }, [editing, el.text]);

  return (
    <div
      className={"board-note" + (selected ? " selected" : "")}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, background: el.color }}
      onDoubleClick={onStartEdit}
      onPointerDown={onPointerDown}
      data-element-id={el._id}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitText(draft)}
          onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } }}
        />
      ) : (
        <div className="board-note-text">{el.text}</div>
      )}
    </div>
  );
}
