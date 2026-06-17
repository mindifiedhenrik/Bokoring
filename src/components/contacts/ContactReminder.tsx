import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { fmtDate } from "../../lib/format";
import { ownerName } from "../../lib/users";

const NONE = "__none__";

export default function ContactReminder({ contact }: { contact: Doc<"contacts"> }) {
  const users = useQuery(api.users.list) ?? [];
  const setReminder = useMutation(api.contacts.setReminder);
  const clearReminder = useMutation(api.contacts.clearReminder);

  const has = !!contact.reminderDatum;
  const [editing, setEditing] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const [agareId, setAgareId] = useState<string>(contact.reminderAgareId ?? NONE);
  const [datum, setDatum] = useState<string>(contact.reminderDatum ?? today);
  const [text, setText] = useState<string>(contact.reminderText ?? "");

  function open() {
    setAgareId(contact.reminderAgareId ?? NONE);
    setDatum(contact.reminderDatum ?? today);
    setText(contact.reminderText ?? "");
    setEditing(true);
  }

  async function save() {
    if (!datum || !text.trim()) return;
    setEditing(false);
    await setReminder({
      id: contact._id,
      agareId: agareId === NONE ? undefined : (agareId as Id<"users">),
      datum,
      text,
    });
  }

  async function clear() {
    setEditing(false);
    await clearReminder({ id: contact._id });
  }

  if (editing) {
    return (
      <>
        <div className="section-label">Påminnelse</div>
        <div className="reminder-edit">
          <div className="field">
            <label>Text</label>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="t.ex. Ring och följ upp förra mötet"
            />
          </div>
          <div className="field row2">
            <div className="field">
              <label>Datum</label>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <div className="field">
              <label>Ansvarig</label>
              <select value={agareId} onChange={(e) => setAgareId(e.target.value)}>
                <option value={NONE}>Ingen</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="reminder-actions">
            <button className="btn btn-primary" onClick={save} disabled={!datum || !text.trim()}>Spara</button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>Avbryt</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-label">Påminnelse</div>
      {has ? (
        <div className="reminder-card">
          <div className="reminder-main">
            <div className="reminder-text">{contact.reminderText}</div>
            <div className="reminder-meta">
              {fmtDate(contact.reminderDatum)}
              {ownerName(users, contact.reminderAgareId) ? ` · ${ownerName(users, contact.reminderAgareId)}` : ""}
            </div>
          </div>
          <div className="reminder-actions">
            <button className="btn btn-ghost" onClick={open}>Ändra</button>
            <button className="btn btn-ghost" onClick={clear}>Ta bort</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost note-add-btn" onClick={open}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Lägg till påminnelse
        </button>
      )}
    </>
  );
}
