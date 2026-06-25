import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

export default function BoardTabs({
  boards, activeId, onSelect,
}: {
  boards: Doc<"boards">[];
  activeId: Id<"boards"> | null;
  onSelect: (id: Id<"boards">) => void;
}) {
  const create = useMutation(api.boards.create);
  const remove = useMutation(api.boards.remove);
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const submitCreate = async () => {
    const namn = name.trim();
    if (!namn) return;
    try {
      const id = await create({ namn });
      onSelect(id);
      setCreating(false);
      setName("");
    } catch {
      toast("Något gick fel");
    }
  };

  const deleteBoard = async (id: Id<"boards">, namn: string) => {
    if (!window.confirm(`Ta bort tavlan "${namn}" och allt innehåll?`)) return;
    try {
      await remove({ id });
      toast("Tavla borttagen");
    } catch {
      toast("Något gick fel");
    }
  };

  return (
    <div className="board-tabs">
      {boards.map((b) => (
        <div
          key={b._id}
          className={"board-tab" + (b._id === activeId ? " active" : "")}
          onClick={() => onSelect(b._id)}
        >
          <span>{b.namn}</span>
          {b._id === activeId && (
            <button
              className="board-tab-del"
              title="Ta bort tavla"
              onClick={(e) => { e.stopPropagation(); deleteBoard(b._id, b.namn); }}
            >×</button>
          )}
        </div>
      ))}
      <button className="board-tab-add" onClick={() => { setName(""); setCreating(true); }}>+ Ny tavla</button>

      {creating && (
        <Modal onClose={() => setCreating(false)}>
          <div className="modal-head">
            <h2>Skapa tavla</h2>
            <button className="x" onClick={() => setCreating(false)} aria-label="Stäng">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Vad ska tavlan heta?</label>
              <input
                autoFocus
                type="text"
                value={name}
                placeholder="T.ex. Sprintplanering"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitCreate(); }}
              />
            </div>
          </div>
          <div className="modal-foot">
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Avbryt</button>
            <button className="btn btn-primary" onClick={submitCreate} disabled={!name.trim()}>Skapa tavla</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
