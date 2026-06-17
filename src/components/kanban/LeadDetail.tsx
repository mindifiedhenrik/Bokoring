import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials, fmtDate, fmtTimestamp } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface LeadDetailProps {
  id: Id<"leads">;
}

export default function LeadDetail({ id }: LeadDetailProps) {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const remove = useMutation(api.leads.remove);
  const modal = useModal();
  const toast = useToast();

  const [tab, setTab] = useState<"info" | "log">("info");

  const leadMaybe = leads.find((l) => l._id === id);
  if (!leadMaybe) return null;
  const lead = leadMaybe;

  const contact = contacts.find((c) => c._id === lead.contactId) ?? null;
  const color = STAGE_VAR[lead.steg];
  const prob = lead.sannolikhet ?? 0;

  const log = [...lead.log].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  async function handleDelete() {
    if (!confirm(`Ta bort leadet "${lead.titel}"? Detta går inte att ångra.`)) return;
    await remove({ id: lead._id });
    modal.close();
    toast("Lead borttaget");
  }

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <span className="stage-tag" style={{ background: color }}>{lead.steg}</span>
        <h2>{lead.titel}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="det-tabs">
          <button
            className={"det-tab" + (tab === "info" ? " active" : "")}
            onClick={() => setTab("info")}
          >
            Översikt
          </button>
          <button
            className={"det-tab" + (tab === "log" ? " active" : "")}
            onClick={() => setTab("log")}
          >
            Stegslogg ({log.length})
          </button>
        </div>

        {tab === "info" && (
          <div className="tab-pane active">
            <div className="info-grid">
              <div className="info-item full">
                <div className="k">Kundkontakt</div>
                <div className="v">
                  {contact ? (
                    <div
                      className="contact-chip"
                      onClick={() => modal.openContactDetail(contact._id)}
                    >
                      <span className="avatar">{initials(contact.namn)}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{contact.namn}</div>
                        <div className="meta-sm">
                          {contact.foretag || ""}
                          {contact.foretag && contact.epost ? " · " : ""}
                          {contact.epost || ""}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="muted">Ingen kontakt kopplad</div>
                  )}
                </div>
              </div>

              <div className="info-item">
                <div className="k">Sannolikhet</div>
                <div className="v">
                  <span className="prob">
                    <span className="bar" style={{ width: "80px" }}>
                      <i style={{ width: prob + "%", background: color }} />
                    </span>
                    {" "}{prob}%
                  </span>
                </div>
              </div>

              <div className="info-item">
                <div className="k">Ägare</div>
                <div className="v">{lead.agare || "—"}</div>
              </div>

              <div className="info-item">
                <div className="k">Datum</div>
                <div className="v">{fmtDate(lead.datum)}</div>
              </div>

              <div className="info-item">
                <div className="k">Steg</div>
                <div className="v">
                  <span className="stage-badge" style={{ background: color }}>{lead.steg}</span>
                </div>
              </div>

              <div className="info-item full">
                <div className="k">Beskrivning</div>
                <div className="v desc">
                  {lead.beskrivning
                    ? lead.beskrivning
                    : <span className="muted">Ingen beskrivning.</span>
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "log" && (
          <div className="tab-pane active">
            <div className="log">
              {log.length > 0
                ? log.map((entry, i) => (
                    <div key={i} className={"log-item" + (entry.from === null || entry.from === undefined ? " first" : "")}>
                      <span className="node"></span>
                      <div className="when">{fmtTimestamp(entry.ts)}</div>
                      <div className="what">
                        {(entry.from === null || entry.from === undefined) ? (
                          <>
                            <span>Lead skapat i </span>
                            <span
                              className="stage-badge"
                              style={{ background: entry.to ? STAGE_VAR[entry.to] : undefined }}
                            >
                              {entry.to}
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="stage-badge"
                              style={{ background: STAGE_VAR[entry.from] }}
                            >
                              {entry.from}
                            </span>
                            <span className="arrow">→</span>
                            <span
                              className="stage-badge"
                              style={{ background: entry.to ? STAGE_VAR[entry.to] : undefined }}
                            >
                              {entry.to}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                : <div className="muted">Ingen historik ännu.</div>
              }
            </div>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={handleDelete}>Ta bort</button>
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
        <button className="btn btn-primary" onClick={() => modal.openLeadForm(lead._id)}>Redigera</button>
      </div>
    </Modal>
  );
}
