import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES, STAGE_VAR } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import { orderForIndex, insertIndexFromHint, type DropHint } from "../../lib/ordering";
import { ownerName } from "../../lib/users";
import LeadCard from "./LeadCard";

export default function PipelineView() {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const move = useMutation(api.leads.move);
  const reorder = useMutation(api.leads.reorder);
  const create = useMutation(api.leads.create);
  const modal = useModal();
  const toast = useToast();

  async function createLead(stage: string) {
    const today = new Date().toISOString().slice(0, 10);
    const id = await create({ titel: "Namnlöst lead", beskrivning: "", sannolikhet: 25, datum: today, steg: stage });
    modal.openLeadDetail(id);
  }

  const [dragId, setDragId] = useState<Id<"leads"> | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  const won = leads.filter((l) => l.steg === "Stängd").length;

  function clearDrag() {
    setOverStage(null);
    setDropHint(null);
    setDragId(null);
  }

  async function onDrop(stage: string) {
    const id = dragId;
    const hint = dropHint;
    clearDrag();
    if (!id) return;
    const lead = leads.find((l) => l._id === id);
    if (!lead) return;
    const excl = leads.filter((l) => l.steg === stage && l._id !== id);
    const insertIndex = hint && hint.key === stage ? insertIndexFromHint(excl, hint) : excl.length;
    const order = orderForIndex(excl, insertIndex);
    if (lead.steg === stage) {
      await reorder({ id, order });
      toast("Ordning uppdaterad");
    } else {
      await move({ id, steg: stage, order });
      toast(`Flyttad till "${stage}"`);
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
        <button className="btn btn-primary" onClick={() => createLead("Lead")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nytt lead
        </button>
      </div>

      <div className="board">
        {STAGES.map((stage) => {
          const items = leads.filter((l) => l.steg === stage);
          return (
            <div
              key={stage}
              className={"col" + (overStage === stage ? " drag-over" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
                if (dragId) setDropHint({ key: stage, id: null, before: false });
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => onDrop(stage)}
            >
              <div className="col-head">
                <span className="swatch" style={{ background: STAGE_VAR[stage] }}></span>
                <h2>{stage}</h2>
                <span className="n">{items.length}</span>
              </div>
              <div
                className="col-body"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId) setDropHint({ key: stage, id: null, before: false });
                }}
              >
                {items.length > 0
                  ? items.map((lead) => {
                      const contact = contacts.find((c) => c._id === lead.contactId);
                      const contactName = contact?.namn ?? "Ingen kontakt";
                      const hintMatch = dropHint && dropHint.key === stage && dropHint.id === lead._id;
                      return (
                        <div key={lead._id} className="drop-slot">
                          {hintMatch && dropHint!.before && <div className="drop-line" />}
                          <LeadCard
                            lead={lead}
                            contactName={contactName}
                            ownerName={ownerName(users, lead.agareId)}
                            onClick={() => modal.openLeadDetail(lead._id)}
                            onDragStart={() => setDragId(lead._id)}
                            onDragEnd={clearDrag}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!dragId) return;
                              const r = e.currentTarget.getBoundingClientRect();
                              const before = e.clientY < r.top + r.height / 2;
                              setOverStage(stage);
                              setDropHint({ key: stage, id: lead._id, before });
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
                onClick={() => createLead(stage)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Lägg till
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
