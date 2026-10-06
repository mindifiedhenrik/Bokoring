import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Stage } from "../../lib/stages";
import Modal from "../ui/Modal";

type Props = {
  stage: Stage;
  count: number;
  others: Stage[];
  onCancel: () => void;
  onConfirm: (moveToId?: Id<"stages">) => void;
};

export default function StageDeleteModal({ stage, count, others, onCancel, onConfirm }: Props) {
  const [moveTo, setMoveTo] = useState<Id<"stages"> | undefined>(others[0]?._id);
  return (
    <Modal onClose={onCancel}>
      <div className="modal-head">
        <h2>Ta bort steg</h2>
        <button className="x" onClick={onCancel} aria-label="Stäng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="modal-body">
        {count === 0 ? (
          <p className="board-confirm-text">Vill du ta bort steget <b>{stage.namn}</b>?</p>
        ) : (
          <>
            <p className="board-confirm-text">
              Steget <b>{stage.namn}</b> har {count} {count === 1 ? "affär" : "affärer"}. Flytta {count === 1 ? "den" : "dem"} till:
            </p>
            <div className="field">
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value as Id<"stages">)}>
                {others.map((s) => <option key={s._id} value={s._id}>{s.namn}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
      <div className="modal-foot">
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={onCancel}>Avbryt</button>
        <button className="btn btn-danger" onClick={() => onConfirm(count > 0 ? moveTo : undefined)}>Ta bort</button>
      </div>
    </Modal>
  );
}
