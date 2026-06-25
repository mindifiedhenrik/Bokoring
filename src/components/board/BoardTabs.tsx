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
  const rename = useMutation(api.boards.rename);
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: Id<"boards">; namn: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: Id<"boards">; value: string } | null>(null);

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

  const commitRename = async () => {
    if (!renaming) return;
    const namn = renaming.value.trim();
    const current = boards.find((b) => b._id === renaming.id);
    setRenaming(null);
    if (!namn || !current || namn === current.namn) return; // empty or unchanged → cancel
    try {
      await rename({ id: renaming.id, namn });
    } catch {
      toast("Något gick fel");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove({ id: pendingDelete.id });
      toast("Tavla borttagen");
    } catch {
      toast("Något gick fel");
    }
    setPendingDelete(null);
  };

  return (
    <div className="board-tabs">
      {boards.map((b) => (
        <div
          key={b._id}
          className={"board-tab" + (b._id === activeId ? " active" : "")}
          onClick={() => onSelect(b._id)}
          onDoubleClick={() => setRenaming({ id: b._id, value: b.namn })}
        >
          {renaming?.id === b._id ? (
            <input
              className="board-tab-rename"
              autoFocus
              value={renaming.value}
              onChange={(e) => setRenaming({ id: b._id, value: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span title="Dubbelklicka för att byta namn">{b.namn}</span>
          )}
          {b._id === activeId && renaming?.id !== b._id && (
            <button
              className="board-tab-del"
              title="Ta bort tavla"
              onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: b._id, namn: b.namn }); }}
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

      {pendingDelete && (
        <Modal onClose={() => setPendingDelete(null)}>
          <div className="modal-head">
            <h2>Ta bort tavla</h2>
            <button className="x" onClick={() => setPendingDelete(null)} aria-label="Stäng">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="modal-body">
            <p className="board-confirm-text">
              Vill du ta bort tavlan <b>{pendingDelete.namn}</b>? Allt innehåll på tavlan tas bort permanent.
            </p>
          </div>
          <div className="modal-foot">
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>Avbryt</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Ta bort</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
