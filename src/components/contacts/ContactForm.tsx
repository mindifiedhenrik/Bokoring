import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface ContactFormProps {
  id?: Id<"contacts">;
}

export default function ContactForm({ id }: ContactFormProps) {
  const contacts = useQuery(api.contacts.list) ?? [];
  const create = useMutation(api.contacts.create);
  const update = useMutation(api.contacts.update);
  const modal = useModal();
  const toast = useToast();

  const existing = id ? contacts.find((c) => c._id === id) : undefined;
  const isEdit = !!existing;

  const [form, setForm] = useState({
    namn: existing?.namn ?? "",
    foretag: existing?.foretag ?? "",
    epost: existing?.epost ?? "",
    telefon: existing?.telefon ?? "",
  });

  function set<K extends keyof typeof form>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    if (!form.namn.trim()) return;
    const payload = {
      namn: form.namn.trim(),
      foretag: form.foretag.trim(),
      epost: form.epost.trim(),
      telefon: form.telefon.trim(),
    };
    if (id) {
      await update({ id, ...payload });
      toast("Kontakt uppdaterad");
    } else {
      await create(payload);
      toast("Kontakt skapad");
    }
    modal.close();
  }

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <h2>{isEdit ? "Redigera kontakt" : "Ny kontakt"}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label>Namn *</label>
            <input
              name="namn"
              required
              value={form.namn}
              onChange={(e) => set("namn", e.target.value)}
              placeholder="För- och efternamn"
              autoFocus
            />
          </div>

          <div className="field">
            <label>Företag</label>
            <input
              name="foretag"
              value={form.foretag}
              onChange={(e) => set("foretag", e.target.value)}
              placeholder="Företagsnamn"
            />
          </div>

          <div className="field row2">
            <div className="field">
              <label>E-post</label>
              <input
                type="email"
                name="epost"
                value={form.epost}
                onChange={(e) => set("epost", e.target.value)}
                placeholder="namn@foretag.se"
              />
            </div>
            <div className="field">
              <label>Telefon</label>
              <input
                name="telefon"
                value={form.telefon}
                onChange={(e) => set("telefon", e.target.value)}
                placeholder="070-000 00 00"
              />
            </div>
          </div>
        </form>
      </div>

      <div className="modal-foot">
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>
          {isEdit ? "Spara" : "Skapa kontakt"}
        </button>
      </div>
    </Modal>
  );
}
