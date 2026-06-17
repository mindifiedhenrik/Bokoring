import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface ProjectFormProps {
  id?: Id<"projects">;
}

export default function ProjectForm({ id }: ProjectFormProps) {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);
  const remove = useMutation(api.projects.remove);
  const modal = useModal();
  const toast = useToast();

  const existing = id ? projects.find((p) => p._id === id) : undefined;
  const isEdit = !!existing;

  const [form, setForm] = useState({
    namn: existing?.namn ?? "",
    beskrivning: existing?.beskrivning ?? "",
  });

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    const data = { namn: form.namn.trim(), beskrivning: form.beskrivning.trim() };
    if (!data.namn) return;
    if (id) {
      await update({ id, ...data });
      toast("Projekt uppdaterat");
    } else {
      await create(data);
      toast("Projekt skapat");
    }
    modal.close();
  }

  async function del() {
    if (!id) return;
    const n = tasks.filter((t) => t.projectId === id).length;
    const warn = n ? `\n\n${n} ${n === 1 ? "uppgift" : "uppgifter"} i projektet raderas också.` : "";
    if (!confirm(`Ta bort projektet ”${existing?.namn}”?${warn}`)) return;
    await remove({ id });
    modal.close();
    toast("Projekt borttaget");
  }

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <h2>{isEdit ? "Redigera projekt" : "Nytt projekt"}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="field">
            <label>Projektnamn *</label>
            <input
              name="namn"
              required
              value={form.namn}
              onChange={(e) => set("namn", e.target.value)}
              placeholder="t.ex. Kundportal 2.0"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Beskrivning</label>
            <textarea
              name="beskrivning"
              value={form.beskrivning}
              onChange={(e) => set("beskrivning", e.target.value)}
              placeholder="Kort om projektet…"
            />
          </div>
        </form>
      </div>

      <div className="modal-foot">
        {isEdit && (
          <button className="btn btn-danger" onClick={del}>
            Ta bort
          </button>
        )}
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={modal.close}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>
          {isEdit ? "Spara" : "Skapa projekt"}
        </button>
      </div>
    </Modal>
  );
}
