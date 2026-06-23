import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MILESTONE_COLORS } from "../../lib/constants";
import { fmtDate } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";
import InlineField from "../cards/InlineField";

const NONE = "__none__";

export default function MilestoneDetail({ id }: { id: Id<"milestones"> }) {
  const milestones = useQuery(api.milestones.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const update = useMutation(api.milestones.update);
  const remove = useMutation(api.milestones.remove);
  const linkTask = useMutation(api.milestones.linkTask);
  const unlinkTask = useMutation(api.milestones.unlinkTask);
  const modal = useModal();
  const toast = useToast();

  const m = milestones.find((x) => x._id === id);
  if (!m) return null;

  async function save(patch: Partial<{ titel: string; beskrivning: string; datum: string; color: string }>) {
    if (!m) return;
    await update({ id: m._id, titel: m.titel, beskrivning: m.beskrivning, datum: m.datum, color: m.color, ...patch });
  }

  const linked = m.taskIds.map((tid) => tasks.find((t) => t._id === tid)).filter(Boolean) as typeof tasks;
  const linkedSet = new Set(linked.map((t) => t._id as string));
  const available = tasks.filter((t) => !t.archived && !linkedSet.has(t._id as string));
  const projName = (pid: Id<"projects">) => projects.find((p) => p._id === pid)?.namn ?? "—";
  const projColor = (pid: Id<"projects">) => projects.find((p) => p._id === pid)?.color ?? "var(--line)";

  async function handleDelete() {
    if (!confirm(`Ta bort "${m!.titel}"? Detta går inte att ångra.`)) return;
    await remove({ id: m!._id });
    modal.close();
    toast("Milstolpe borttagen");
  }

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <span className="stage-tag" style={{ background: m.color }}>{fmtDate(m.datum)}</span>
        <h2 style={{ flex: 1, minWidth: 0 }}>
          <InlineField type="text" label="" className="title-inline" value={m.titel}
            onSave={(v) => save({ titel: v.trim() || m.titel })} />
        </h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="info-grid">
          <InlineField type="date" label="Datum" value={m.datum} display={fmtDate(m.datum)}
            onSave={(v) => save({ datum: v })} />
          <div className="info-item inline">
            <div className="k">Färg</div>
            <div className="v" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MILESTONE_COLORS.map((c) => (
                <button key={c} type="button" className={"tl-swatch" + (c === m.color ? " active" : "")}
                  style={{ background: c }} onClick={() => save({ color: c })} aria-label={"Färg " + c} />
              ))}
            </div>
          </div>
          <InlineField type="textarea" label="Beskrivning" className="full" value={m.beskrivning}
            placeholder="Vad ska uppnås till denna milstolpe?" onSave={(v) => save({ beskrivning: v })} />
        </div>

        <div className="ms-tasks">
          <div className="k">Kopplade uppgifter ({linked.length})</div>
          {linked.map((t) => (
            <div key={t._id} className="ms-task-row">
              <span className="ms-task-dot" style={{ background: projColor(t.projectId) }} />
              <button className="ms-task-titel" onClick={() => modal.openTaskDetail(t._id)}>{t.titel}</button>
              <span className="ms-task-proj">{projName(t.projectId)}</span>
              <button className="ms-task-x" onClick={() => unlinkTask({ id: m._id, taskId: t._id })} aria-label="Ta bort koppling">×</button>
            </div>
          ))}
          {available.length > 0 && (
            <select className="ms-task-add" value={NONE}
              onChange={(e) => { if (e.target.value !== NONE) linkTask({ id: m._id, taskId: e.target.value as Id<"tasks"> }); }}>
              <option value={NONE}>+ Koppla uppgift…</option>
              {available.map((t) => <option key={t._id} value={t._id}>{t.titel} · {projName(t.projectId)}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={handleDelete}>Ta bort</button>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
      </div>
    </Modal>
  );
}
