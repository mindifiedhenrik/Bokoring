import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useToast } from "../../context/ToastContext";

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

  const addBoard = async () => {
    const namn = window.prompt("Namn på tavlan?", "Ny tavla")?.trim();
    if (!namn) return;
    try {
      const id = await create({ namn });
      onSelect(id);
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
      <button className="board-tab-add" onClick={addBoard}>+ Ny tavla</button>
    </div>
  );
}
