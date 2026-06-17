import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES, STAGE_VAR } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import LeadCard from "./LeadCard";

export default function PipelineView() {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const move = useMutation(api.leads.move);
  const modal = useModal();
  const toast = useToast();

  const [dragId, setDragId] = useState<Id<"leads"> | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const won = leads.filter((l) => l.steg === "Stängd").length;

  async function onDrop(stage: string) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l._id === id);
    if (!lead || lead.steg === stage) return;
    await move({ id, steg: stage });
    toast(`Flyttad till "${stage}"`);
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
        <button className="btn btn-primary" onClick={() => modal.openLeadForm()}>
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
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => onDrop(stage)}
            >
              <div className="col-head">
                <span className="swatch" style={{ background: STAGE_VAR[stage] }}></span>
                <h2>{stage}</h2>
                <span className="n">{items.length}</span>
              </div>
              <div className="col-body">
                {items.length > 0
                  ? items.map((lead) => {
                      const contact = contacts.find((c) => c._id === lead.contactId);
                      const contactName = contact?.namn ?? "Ingen kontakt";
                      return (
                        <LeadCard
                          key={lead._id}
                          lead={lead}
                          contactName={contactName}
                          onClick={() => modal.openLeadDetail(lead._id)}
                          onDragStart={() => setDragId(lead._id)}
                          onDragEnd={() => setDragId(null)}
                        />
                      );
                    })
                  : <div className="empty-hint">Inga affärer här</div>
                }
              </div>
              <button
                className="add-card"
                onClick={() => modal.openLeadForm(undefined, stage)}
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
