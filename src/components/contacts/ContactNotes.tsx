import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { fmtDate } from "../../lib/format";
import { ownerName } from "../../lib/users";

export default function ContactNotes({ contactId }: { contactId: Id<"contacts"> }) {
  const notes = useQuery(api.notes.listByContact, { contactId }) ?? [];
  const users = useQuery(api.users.list) ?? [];
  const add = useMutation(api.notes.add);
  const remove = useMutation(api.notes.remove);
  const markRead = useMutation(api.contacts.markRead);

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setAdding(false);
    await add({ contactId, text });
    // The author has obviously "read" their own note — keep it from showing unread.
    void markRead({ id: contactId });
  }

  function cancel() {
    setDraft("");
    setAdding(false);
  }

  return (
    <>
      <div className="section-label">Anteckningar ({notes.length})</div>

      {adding ? (
        <div className="note-add">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Kort anteckning…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          />
          <div className="note-add-actions">
            <button className="btn btn-primary" onClick={submit} disabled={!draft.trim()}>
              Lägg till
            </button>
            <button className="btn btn-ghost" onClick={cancel}>Avbryt</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost note-add-btn" onClick={() => setAdding(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Skapa anteckning
        </button>
      )}

      <div className="note-list">
        {notes.length === 0 ? (
          <div className="muted">Inga anteckningar ännu.</div>
        ) : (
          notes.map((n) => {
            const open = expanded.has(n._id);
            const firstLine = n.text.split("\n")[0];
            const author = ownerName(users, n.authorId) ?? "Okänd";
            return (
              <div key={n._id} className={"note-item" + (open ? " open" : "")} onClick={() => toggle(n._id)}>
                <div className="note-body">{open ? n.text : firstLine}</div>
                <div className="note-meta">
                  <span>{fmtDate(new Date(n._creationTime).toISOString())} · {author}</span>
                  <button
                    className="note-del"
                    title="Ta bort anteckning"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove({ id: n._id });
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
