import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";
import InlineField from "../cards/InlineField";
import ContactNotes from "./ContactNotes";

interface ContactDetailProps {
  id: Id<"contacts">;
}

export default function ContactDetail({ id }: ContactDetailProps) {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const update = useMutation(api.contacts.update);
  const remove = useMutation(api.contacts.remove);
  const modal = useModal();
  const toast = useToast();

  const contact = contacts.find((c) => c._id === id);
  if (!contact) return null;

  const linked = leads.filter((l) => l.contactId === id);

  // Inline saves rebuild the full payload from the current doc and override one field.
  async function save(patch: Partial<{ namn: string; foretag: string; epost: string; telefon: string }>) {
    if (!contact) return;
    await update({
      id: contact._id,
      namn: contact.namn,
      foretag: contact.foretag,
      epost: contact.epost,
      telefon: contact.telefon,
      ...patch,
    });
  }

  async function del() {
    if (!contact) return;
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
        <h2 style={{ flex: 1, minWidth: 0, marginLeft: "2px" }}>
          <InlineField
            type="text"
            label=""
            className="title-inline"
            value={contact.namn}
            onSave={(v) => save({ namn: v.trim() || contact.namn })}
          />
        </h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="info-grid">
          <InlineField
            type="text"
            label="Företag"
            value={contact.foretag}
            placeholder="Företagsnamn"
            onSave={(v) => save({ foretag: v.trim() })}
          />
          <InlineField
            type="text"
            label="Telefon"
            value={contact.telefon}
            placeholder="070-000 00 00"
            onSave={(v) => save({ telefon: v.trim() })}
          />
          <InlineField
            type="text"
            label="E-post"
            className="full"
            value={contact.epost}
            placeholder="namn@foretag.se"
            onSave={(v) => save({ epost: v.trim() })}
          />
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

        <ContactNotes contactId={contact._id} />
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={del}>Ta bort</button>
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
      </div>
    </Modal>
  );
}
