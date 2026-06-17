import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TASK_STATUSES, PRIORITIES } from "../../lib/constants";
import { fmtTimestamp } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";

interface TaskFormProps {
  id?: Id<"tasks">;
  presetProject?: Id<"projects">;
  presetStatus?: string;
}

export default function TaskForm({ id, presetProject, presetStatus }: TaskFormProps) {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const create = useMutation(api.tasks.create);
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);
  const modal = useModal();
  const toast = useToast();

  const existing = id ? tasks.find((t) => t._id === id) : undefined;
  const isEdit = !!existing;

  const [form, setForm] = useState({
    titel: existing?.titel ?? "",
    beskrivning: existing?.beskrivning ?? "",
    projectId: (existing?.projectId ?? presetProject ?? projects[0]?._id) as Id<"projects"> | undefined,
    status: existing?.status ?? presetStatus ?? "Backlog",
    agare: existing?.agare ?? "",
    prioritet: existing?.prioritet ?? "Normal",
  });

  // No projects yet — bounce to the project form instead.
  if (!id && projects.length === 0) {
    modal.openProjectForm();
    return null;
  }

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function save() {
    if (!form.titel.trim()) return;
    if (!form.projectId) return;
    const payload = {
      titel: form.titel.trim(),
      beskrivning: form.beskrivning.trim(),
      projectId: form.projectId,
      status: form.status,
      agare: form.agare.trim(),
      prioritet: form.prioritet,
    };
    if (id && existing && existing.projectId !== form.projectId) {
      const fromP = projects.find((p) => p._id === existing.projectId)?.namn ?? "—";
      const toP = projects.find((p) => p._id === form.projectId)?.namn ?? "—";
      if (!confirm(`Flytta ”${existing.titel}” från projektet ”${fromP}” till ”${toP}”?`)) return;
    }
    if (id) {
      await update({ id, ...payload });
      toast("Uppgift uppdaterad");
    } else {
      await create(payload);
      toast("Uppgift skapad");
    }
    modal.close();
  }

  async function del() {
    if (!id || !existing) return;
    if (!confirm(`Ta bort uppgiften ”${existing.titel}”?`)) return;
    await remove({ id });
    modal.close();
    toast("Uppgift borttagen");
  }

  // Move history — logged with timestamps, same idea as the sales pipeline.
  const log = existing
    ? [...existing.log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    : [];

  const chip = (s: string | null | undefined) => <span className="pill">{s}</span>;

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <h2>{isEdit ? "Redigera uppgift" : "Ny uppgift"}</h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
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
              placeholder="t.ex. API-integration mot ERP"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Beskrivning</label>
            <textarea
              name="beskrivning"
              value={form.beskrivning}
              onChange={(e) => set("beskrivning", e.target.value)}
              placeholder="Detaljer, definition of done…"
            />
          </div>
          <div className="field row2">
            <div className="field">
              <label>Projekt</label>
              <select
                name="projectId"
                value={form.projectId ?? ""}
                onChange={(e) => set("projectId", e.target.value as Id<"projects">)}
              >
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.namn}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select name="status" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field row2">
            <div className="field">
              <label>Ägare</label>
              <input
                name="agare"
                value={form.agare}
                onChange={(e) => set("agare", e.target.value)}
                placeholder="t.ex. Maria Ek"
              />
            </div>
            <div className="field">
              <label>Prioritet</label>
              <select name="prioritet" value={form.prioritet} onChange={(e) => set("prioritet", e.target.value)}>
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        {isEdit && (
          <>
            <div className="section-label" style={{ marginTop: "8px" }}>Historik ({log.length})</div>
            <div className="log">
              {log.length > 0 ? (
                log.map((e, i) => (
                  <div key={i} className={"log-item" + (e.from === null ? " first" : "")}>
                    <span className="node"></span>
                    <div className="when">{fmtTimestamp(e.ts)}</div>
                    <div className="what">
                      {e.restored ? (
                        <span>Återställd från arkiv</span>
                      ) : e.archived ? (
                        <span>Arkiverad från Done</span>
                      ) : e.fromProject !== undefined ? (
                        <>
                          <span>Projektbyte:</span> {chip(e.fromProject)} <span className="arrow">→</span> {chip(e.toProject)}
                        </>
                      ) : e.from === null ? (
                        <>
                          <span>Skapad i</span> {chip(e.to)}
                        </>
                      ) : (
                        <>
                          {chip(e.from)} <span className="arrow">→</span> {chip(e.to)}
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted">Ingen historik ännu.</div>
              )}
            </div>
          </>
        )}
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
          {isEdit ? "Spara" : "Skapa uppgift"}
        </button>
      </div>
    </Modal>
  );
}
