import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface LeadFormProps {
  id?: Id<"leads">;
  presetSteg?: string;
}

export default function LeadForm({ id, presetSteg }: LeadFormProps) {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const create = useMutation(api.leads.create);
  const update = useMutation(api.leads.update);
  const remove = useMutation(api.leads.remove);
  const modal = useModal();
  const toast = useToast();

  const existing = id ? leads.find((l) => l._id === id) : undefined;
  const isEdit = !!existing;

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    titel: existing?.titel ?? "",
    beskrivning: existing?.beskrivning ?? "",
    contactId: existing?.contactId ?? "",
    sannolikhet: existing?.sannolikhet ?? 25,
    agare: existing?.agare ?? "",
    datum: existing?.datum ?? today,
    steg: existing?.steg ?? presetSteg ?? "Lead",
  });

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    if (!form.titel.trim()) return;
    const payload = {
      titel: form.titel.trim(),
      beskrivning: form.beskrivning.trim(),
      contactId: form.contactId ? (form.contactId as Id<"contacts">) : undefined,
      sannolikhet: Number(form.sannolikhet),
      agare: form.agare.trim(),
      datum: form.datum,
      steg: form.steg,
    };
    if (id) {
      await update({ id, ...payload });
      toast("Lead uppdaterat");
    } else {
      await create(payload);
      toast("Lead skapat");
    }
    modal.close();
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Ta bort leadet "${form.titel}"? Detta går inte att ångra.`)) return;
    await remove({ id });
    modal.close();
    toast("Lead borttaget");
  }

  const noContacts = contacts.length === 0;

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <h2>{isEdit ? "Redigera lead" : "Nytt lead"}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label>Titel *</label>
            <input
              name="titel"
              required
              value={form.titel}
              onChange={(e) => set("titel", e.target.value)}
              placeholder="t.ex. Webbplattform & integration"
              autoFocus
            />
          </div>

          <div className="field">
            <label>Beskrivning</label>
            <textarea
              name="beskrivning"
              value={form.beskrivning}
              onChange={(e) => set("beskrivning", e.target.value)}
              placeholder="Bakgrund, behov, nästa steg…"
            />
          </div>

          <div className="field">
            <label>Kundkontakt</label>
            <select
              name="contactId"
              value={form.contactId}
              onChange={(e) => set("contactId", e.target.value)}
            >
              <option value="">— Ingen kontakt —</option>
              {contacts.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.namn}{c.foretag ? " · " + c.foretag : ""}
                </option>
              ))}
            </select>
            {noContacts && (
              <div className="muted" style={{ fontSize: "12.5px", marginTop: "7px" }}>
                Inga kontakter ännu — lägg till under <b>Kontakter</b>.
              </div>
            )}
          </div>

          <div className="field row2">
            <div className="field">
              <label>Ägare (säljare)</label>
              <input
                name="agare"
                value={form.agare}
                onChange={(e) => set("agare", e.target.value)}
                placeholder="t.ex. Maria Ek"
              />
            </div>
            <div className="field">
              <label>Datum</label>
              <input
                type="date"
                name="datum"
                value={form.datum}
                onChange={(e) => set("datum", e.target.value)}
              />
            </div>
          </div>

          <div className="field row2">
            <div className="field">
              <label>Steg</label>
              <select
                name="steg"
                value={form.steg}
                onChange={(e) => set("steg", e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Sannolikhet</label>
              <div className="range-wrap">
                <input
                  type="range"
                  name="sannolikhet"
                  min="0"
                  max="100"
                  step="5"
                  value={form.sannolikhet}
                  onChange={(e) => set("sannolikhet", Number(e.target.value))}
                />
                <span className="range-val">{form.sannolikhet}%</span>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="modal-foot">
        {isEdit && (
          <button className="btn btn-danger" onClick={handleDelete}>
            Ta bort
          </button>
        )}
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>
          {isEdit ? "Spara" : "Skapa lead"}
        </button>
      </div>
    </Modal>
  );
}
