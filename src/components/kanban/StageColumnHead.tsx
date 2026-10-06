import { useEffect, useRef, useState } from "react";
import type React from "react";
import { STAGE_COLORS } from "../../lib/constants";
import type { Stage } from "../../lib/stages";

type Props = {
  stage: Stage;
  count: number;
  canDelete: boolean;
  onRename: (namn: string) => void;
  onColor: (color: string) => void;
  onRequestDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
};

export default function StageColumnHead({ stage, count, canDelete, onRename, onColor, onRequestDelete, onDragStart, onDragEnd }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false); // set once a rename session is finished (Enter/Esc), so a trailing blur is ignored

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const startRename = () => {
    settled.current = false;
    setRenaming(stage.namn);
  };

  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    const namn = renaming?.trim();
    setRenaming(null);
    if (namn && namn !== stage.namn) onRename(namn); // empty or unchanged → cancel
  };

  return (
    <div
      className="col-head"
      draggable={renaming === null}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="swatch" style={{ background: stage.color }}></span>
      {renaming !== null ? (
        <input
          className="col-rename"
          autoFocus
          value={renaming}
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") { settled.current = true; setRenaming(null); }
          }}
        />
      ) : (
        <h2 title="Dubbelklicka för att byta namn" onDoubleClick={startRename}>{stage.namn}</h2>
      )}
      <span className="n">{count}</span>
      <div className="col-menu-wrap" ref={menuRef}>
        <button className="col-menu-btn" title="Hantera steg" aria-label="Hantera steg" onClick={() => setMenuOpen((o) => !o)}>⋯</button>
        {menuOpen && (
          <div className="col-menu">
            <div className="col-menu-swatches">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  className={"col-menu-swatch" + (c === stage.color ? " active" : "")}
                  style={{ background: c }}
                  aria-label={`Färg ${c}`}
                  onClick={() => { onColor(c); setMenuOpen(false); }}
                />
              ))}
            </div>
            <button className="col-menu-item" onClick={() => { setMenuOpen(false); startRename(); }}>Byt namn</button>
            <button
              className="col-menu-item danger"
              disabled={!canDelete}
              title={canDelete ? undefined : "Det sista steget kan inte tas bort"}
              onClick={() => { setMenuOpen(false); onRequestDelete(); }}
            >Ta bort steg</button>
          </div>
        )}
      </div>
    </div>
  );
}
