import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STAGES, STAGE_VAR, TASK_STATUSES, PRIORITIES } from "../../lib/constants";
import { initials, fmtDate } from "../../lib/format";
import { ownerName } from "../../lib/users";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Modal from "../ui/Modal";
import InlineField from "./InlineField";
import CardLog from "./CardLog";

type Props = { type: "lead"; id: Id<"leads"> } | { type: "task"; id: Id<"tasks"> };

const NONE = "__none__";
const NEW_CONTACT = "__new_contact__";

export default function CardDetail(props: Props) {
  const { type } = props;
  const leads = useQuery(api.leads.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const updateLead = useMutation(api.leads.update);
  const updateTask = useMutation(api.tasks.update);
  const removeLead = useMutation(api.leads.remove);
  const removeTask = useMutation(api.tasks.remove);
  const createContact = useMutation(api.contacts.create);
  const modal = useModal();
  const toast = useToast();
  const [tab, setTab] = useState<"info" | "log">("info");

  const lead = type === "lead" ? leads.find((l) => l._id === props.id) : undefined;
  const task = type === "task" ? tasks.find((t) => t._id === props.id) : undefined;
  const doc = lead ?? task;
  if (!doc) return null;

  const userOptions = [
    { value: NONE, label: "Ingen" },
    ...users.map((u) => ({ value: u._id as string, label: u.displayName })),
  ];

  async function saveLead(patch: Partial<{ titel: string; beskrivning: string; contactId?: Id<"contacts">; sannolikhet: number; agareId?: Id<"users">; datum: string; steg: string }>) {
    if (!lead) return;
    await updateLead({
      id: lead._id,
      titel: lead.titel, beskrivning: lead.beskrivning, contactId: lead.contactId,
      sannolikhet: lead.sannolikhet, agareId: lead.agareId, datum: lead.datum, steg: lead.steg,
      ...patch,
    });
  }
  async function saveTask(patch: Partial<{ titel: string; beskrivning: string; projectId: Id<"projects">; status: string; agareId?: Id<"users">; prioritet: string }>) {
    if (!task) return;
    await updateTask({
      id: task._id,
      titel: task.titel, beskrivning: task.beskrivning, projectId: task.projectId,
      status: task.status, agareId: task.agareId, prioritet: task.prioritet,
      ...patch,
    });
  }
  const idToUser = (v: string) => (v === NONE ? undefined : (v as Id<"users">));

  async function handleDelete() {
    if (!confirm(`Ta bort "${doc!.titel}"? Detta går inte att ångra.`)) return;
    if (lead) await removeLead({ id: lead._id });
    else if (task) await removeTask({ id: task._id });
    modal.close();
    toast(type === "lead" ? "Lead borttaget" : "Uppgift borttagen");
  }

  const headColor = lead ? STAGE_VAR[lead.steg]
    : projects.find((p) => p._id === task!.projectId)?.color ?? "var(--line)";
  const headTag = lead ? lead.steg : task!.status;

  return (
    <Modal onClose={modal.close}>
      <div className="modal-head">
        <span className="stage-tag" style={{ background: headColor }}>{headTag}</span>
        <h2 style={{ flex: 1, minWidth: 0 }}>
          <InlineField type="text" label="" className="title-inline" value={doc.titel}
            onSave={(v) => (lead ? saveLead({ titel: v.trim() || doc.titel }) : saveTask({ titel: v.trim() || doc.titel }))} />
        </h2>
        <button className="x" onClick={modal.close}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="det-tabs">
          <button className={"det-tab" + (tab === "info" ? " active" : "")} onClick={() => setTab("info")}>Översikt</button>
          <button className={"det-tab" + (tab === "log" ? " active" : "")} onClick={() => setTab("log")}>
            {lead ? "Stegslogg" : "Historik"} ({doc.log.length})
          </button>
        </div>

        {tab === "info" && (
          <div className="tab-pane active">
            <div className="info-grid">
              {lead && (
                <>
                  <div className="info-item full">
                    <div className="k">Kundkontakt</div>
                    <div className="v">
                      <InlineField type="select" label="" value={lead.contactId ?? NONE}
                        options={[
                          { value: NONE, label: "Ingen kontakt" },
                          { value: NEW_CONTACT, label: "➕ Skapa ny kontakt" },
                          ...contacts.map((c) => ({ value: c._id as string, label: c.namn + (c.foretag ? " · " + c.foretag : "") })),
                        ]}
                        render={(v) => {
                          const c = contacts.find((x) => x._id === v);
                          return c ? (
                            <span className="contact-chip" onClick={(e) => { e.stopPropagation(); modal.openContactDetail(c._id, lead._id); }}>
                              <span className="avatar">{initials(c.namn)}</span>
                              <span style={{ fontWeight: 600 }}>{c.namn}</span>
                            </span>
                          ) : <span className="muted">Ingen kontakt kopplad</span>;
                        }}
                        onSave={async (v) => {
                          if (v === NEW_CONTACT) {
                            // Create a blank contact, link it to this lead, and open it for naming.
                            const cid = await createContact({ namn: "Namnlös kontakt", foretag: "", epost: "", telefon: "" });
                            await saveLead({ contactId: cid });
                            modal.openContactDetail(cid, lead!._id);
                            return;
                          }
                          await saveLead({ contactId: v === NONE ? undefined : (v as Id<"contacts">) });
                        }} />
                    </div>
                  </div>
                  <InlineField type="number" label="Sannolikhet" value={lead.sannolikhet} min={0} max={100} step={5} suffix="%"
                    onSave={(v) => saveLead({ sannolikhet: Math.max(0, Math.min(100, v)) })} />
                  <InlineField type="select" label="Ansvarig" value={lead.agareId ?? NONE} options={userOptions}
                    render={(v) => ownerName(users, v === NONE ? undefined : (v as Id<"users">)) ?? "—"}
                    onSave={(v) => saveLead({ agareId: idToUser(v) })} />
                  <InlineField type="date" label="Datum" value={lead.datum} display={fmtDate(lead.datum)}
                    onSave={(v) => saveLead({ datum: v })} />
                  <InlineField type="select" label="Steg" value={lead.steg} options={STAGES.map((s) => ({ value: s, label: s }))}
                    render={(v) => <span className="stage-badge" style={{ background: STAGE_VAR[v] }}>{v}</span>}
                    onSave={(v) => saveLead({ steg: v })} />
                  <InlineField type="textarea" label="Beskrivning" className="full" value={lead.beskrivning}
                    placeholder="Bakgrund, behov, nästa steg…" onSave={(v) => saveLead({ beskrivning: v })} />
                </>
              )}
              {task && (
                <>
                  <InlineField type="select" label="Projekt" value={task.projectId} options={projects.map((p) => ({ value: p._id as string, label: p.namn }))}
                    onSave={(v) => saveTask({ projectId: v as Id<"projects"> })} />
                  <InlineField type="select" label="Status" value={task.status} options={TASK_STATUSES.map((s) => ({ value: s, label: s }))}
                    onSave={(v) => saveTask({ status: v })} />
                  <InlineField type="select" label="Ansvarig" value={task.agareId ?? NONE} options={userOptions}
                    render={(v) => ownerName(users, v === NONE ? undefined : (v as Id<"users">)) ?? "—"}
                    onSave={(v) => saveTask({ agareId: idToUser(v) })} />
                  <InlineField type="select" label="Prioritet" value={task.prioritet} options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                    render={(v) => <span className={"prio " + (v === "Hög" ? "high" : v === "Låg" ? "low" : "normal")}>{v}</span>}
                    onSave={(v) => saveTask({ prioritet: v })} />
                  <InlineField type="textarea" label="Beskrivning" className="full" value={task.beskrivning}
                    placeholder="Detaljer, definition of done…" onSave={(v) => saveTask({ beskrivning: v })} />
                </>
              )}
            </div>
          </div>
        )}

        {tab === "log" && <div className="tab-pane active"><CardLog type={type} log={doc.log} /></div>}
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={handleDelete}>Ta bort</button>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={modal.close}>Stäng</button>
      </div>
    </Modal>
  );
}
