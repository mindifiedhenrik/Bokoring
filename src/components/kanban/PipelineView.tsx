import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStages, errorMessage, type Stage } from "../../lib/stages";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import { orderForIndex, insertIndexFromHint, type DropHint } from "../../lib/ordering";
import { ownerName } from "../../lib/users";
import LeadCard from "./LeadCard";
import StageColumnHead from "./StageColumnHead";
import StageDeleteModal from "./StageDeleteModal";
import AddStageColumn from "./AddStageColumn";

export default function PipelineView() {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const stages = useStages();
  const move = useMutation(api.leads.move);
  const reorder = useMutation(api.leads.reorder);
  const create = useMutation(api.leads.create);
  const createStage = useMutation(api.stages.create);
  const renameStage = useMutation(api.stages.rename);
  const colorStage = useMutation(api.stages.setColor);
  const reorderStage = useMutation(api.stages.reorder);
  const removeStage = useMutation(api.stages.remove);
  const modal = useModal();
  const toast = useToast();

  async function createLead(stageId: Id<"stages">) {
    const today = new Date().toISOString().slice(0, 10);
    const id = await create({ titel: "Namnlöst lead", beskrivning: "", sannolikhet: 25, datum: today, stageId });
    modal.openLeadDetail(id);
  }

  const [dragId, setDragId] = useState<Id<"leads"> | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [colDragId, setColDragId] = useState<Id<"stages"> | null>(null);
  const [colHint, setColHint] = useState<{ id: Id<"stages">; before: boolean } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Stage | null>(null);

  const lastStage = stages.at(-1);
  const won = lastStage ? leads.filter((l) => l.stageId === lastStage._id).length : 0;

  function clearDrag() {
    setOverStage(null);
    setDropHint(null);
    setDragId(null);
  }

  async function run(p: Promise<unknown>, ok?: string) {
    try { await p; if (ok) toast(ok); return true; }
    catch (err) { toast(errorMessage(err)); return false; }
  }

  async function onColumnDrop() {
    const id = colDragId;
    const hint = colHint;
    setColDragId(null);
    setColHint(null);
    if (!id || !hint || hint.id === id) return;
    const excl = stages.filter((s) => s._id !== id);
    const order = orderForIndex(excl.map((s) => ({ order: s.order, _creationTime: s._creationTime })), insertIndexFromHint(excl, hint));
    await run(reorderStage({ id, order }));
  }

  async function onDrop(stage: Stage) {
    const id = dragId;
    const hint = dropHint;
    clearDrag();
    if (!id) return;
    const lead = leads.find((l) => l._id === id);
    if (!lead) return;
    const excl = leads.filter((l) => l.stageId === stage._id && l._id !== id);
    const insertIndex = hint && hint.key === stage._id ? insertIndexFromHint(excl, hint) : excl.length;
    const order = orderForIndex(excl, insertIndex);
    if (lead.stageId === stage._id) {
      await reorder({ id, order });
      toast("Ordning uppdaterad");
    } else {
      await move({ id, stageId: stage._id, order });
      toast(`Flyttad till "${stage.namn}"`);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Pipeline</h1>
          <div className="lead-sub">
            {leads.length} affärer i pipeline · {won} stängda · dra korten för att byta steg.
          </div>
        </div>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => stages[0] && createLead(stages[0]._id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nytt lead
        </button>
      </div>

      <div className="board" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(240px, 1fr)) 180px` }}>
        {stages.map((stage) => {
          const items = leads.filter((l) => l.stageId === stage._id);
          return (
            <div
              key={stage._id}
              className={"col" + (overStage === stage._id ? " drag-over" : "")
                + (colHint?.id === stage._id && colDragId !== stage._id ? (colHint.before ? " col-drop-before" : " col-drop-after") : "")}
              onDragOver={(e) => {
                e.preventDefault();
                if (colDragId) {
                  const r = e.currentTarget.getBoundingClientRect();
                  setColHint({ id: stage._id, before: e.clientX < r.left + r.width / 2 });
                  return;
                }
                setOverStage(stage._id);
                if (dragId) setDropHint({ key: stage._id, id: null, before: false });
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => (colDragId ? onColumnDrop() : onDrop(stage))}
            >
              <StageColumnHead
                stage={stage}
                count={items.length}
                canDelete={stages.length > 1}
                onRename={(namn) => run(renameStage({ id: stage._id, namn }))}
                onColor={(color) => run(colorStage({ id: stage._id, color }))}
                onRequestDelete={() => setPendingDelete(stage)}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setColDragId(stage._id); }}
                onDragEnd={() => { setColDragId(null); setColHint(null); }}
              />
              <div
                className="col-body"
                onDragOver={(e) => {
                  if (colDragId) return;
                  e.preventDefault();
                  if (dragId) setDropHint({ key: stage._id, id: null, before: false });
                }}
              >
                {items.length > 0
                  ? items.map((lead) => {
                      const contact = contacts.find((c) => c._id === lead.contactId);
                      const contactName = contact?.namn ?? "Ingen kontakt";
                      const hintMatch = dropHint && dropHint.key === stage._id && dropHint.id === lead._id;
                      return (
                        <div key={lead._id} className="drop-slot">
                          {hintMatch && dropHint!.before && <div className="drop-line" />}
                          <LeadCard
                            lead={lead}
                            contactName={contactName}
                            color={stage.color}
                            ownerName={ownerName(users, lead.agareId)}
                            onClick={() => modal.openLeadDetail(lead._id)}
                            onDragStart={() => setDragId(lead._id)}
                            onDragEnd={clearDrag}
                            onDragOver={(e) => {
                              if (colDragId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              if (!dragId) return;
                              const r = e.currentTarget.getBoundingClientRect();
                              const before = e.clientY < r.top + r.height / 2;
                              setOverStage(stage._id);
                              setDropHint({ key: stage._id, id: lead._id, before });
                            }}
                          />
                          {hintMatch && !dropHint!.before && <div className="drop-line" />}
                        </div>
                      );
                    })
                  : <div className="empty-hint">Inga affärer här</div>
                }
              </div>
              <button
                className="add-card"
                onClick={() => createLead(stage._id)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Lägg till
              </button>
            </div>
          );
        })}
        <AddStageColumn onCreate={(namn) => run(createStage({ namn }), `Steget "${namn}" skapat`)} />
      </div>

      {pendingDelete && (
        <StageDeleteModal
          stage={pendingDelete}
          count={leads.filter((l) => l.stageId === pendingDelete._id).length}
          others={stages.filter((s) => s._id !== pendingDelete._id)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async (moveToId) => {
            const target = pendingDelete;
            setPendingDelete(null);
            await run(removeStage({ id: target._id, moveToId }), `Steget "${target.namn}" borttaget`);
          }}
        />
      )}
    </>
  );
}
