import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface ContactDetailProps {
  id: Id<"contacts">;
}

export default function ContactDetail({ id }: ContactDetailProps) {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const remove = useMutation(api.contacts.remove);
  const modal = useModal();
  const toast = useToast();

  const contactMaybe = contacts.find((c) => c._id === id);
  if (!contactMaybe) return null;
  const contact = contactMaybe;

  const linked = leads.filter((l) => l.contactId === id);

  async function del() {
    const warn = linked.length
      ? `\n\n${linked.length} kopplade ${linked.length === 1 ? "affär" : "affärer"} blir utan kontakt (raderas inte).`
      : "";
    if (!confirm(`Ta bort kontakten "${contact.namn}"?${warn}`)) return;
    await remove({ id });
    modal.close();
    toast("Kontakt borttagen");
  }

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <span
          className="avatar"
          style={{ width: "42px", height: "42px", fontSize: "16px", flex: "none" }}
        >
          {initials(contact.namn)}
        </span>
        <h2 style={{ marginLeft: "2px" }}>{contact.namn}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="info-grid">
          <div className="info-item">
            <div className="k">Företag</div>
            <div className="v">{contact.foretag || "—"}</div>
          </div>
          <div className="info-item">
            <div className="k">Telefon</div>
            <div className="v">{contact.telefon || "—"}</div>
          </div>
          <div className="info-item full">
            <div className="k">E-post</div>
            <div className="v">
              {contact.epost ? (
                <a href={`mailto:${contact.epost}`} style={{ color: "var(--accent-deep)" }}>
                  {contact.epost}
                </a>
              ) : "—"}
            </div>
          </div>
        </div>

        <div className="section-label">Kopplade affärer ({linked.length})</div>
        <div className="linked-leads">
          {linked.length > 0 ? (
            linked.map((l) => (
              <div
                key={l._id}
                className="linked-lead"
                onClick={() => modal.openLeadDetail(l._id)}
              >
                <span
                  className="stage-dot"
                  style={{ background: STAGE_VAR[l.steg] }}
                />
                <span className="ll-title">{l.titel}</span>
                <span className="pill">{l.steg}</span>
                <span className="ll-prob">{Number(l.sannolikhet) || 0}%</span>
              </div>
            ))
          ) : (
            <div className="muted">Inga affärer kopplade till denna kontakt ännu.</div>
          )}
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={del}>Ta bort</button>
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
        <button className="btn btn-primary" onClick={() => modal.openContactForm(contact._id)}>
          Redigera
        </button>
      </div>
    </Modal>
  );
}
