import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { initials } from "../../lib/format";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";

export default function ContactsView() {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const remove = useMutation(api.contacts.remove);
  const create = useMutation(api.contacts.create);
  const modal = useModal();
  const toast = useToast();

  const leadCount = (id: Id<"contacts">) =>
    leads.filter((l) => l.contactId === id).length;

  async function createContact() {
    const id = await create({ namn: "Namnlös kontakt", foretag: "", epost: "", telefon: "" });
    modal.openContactDetail(id);
  }

  async function handleDelete(id: Id<"contacts">) {
    const contact = contacts.find((c) => c._id === id);
    if (!contact) return;
    const linked = leads.filter((l) => l.contactId === id);
    const warn = linked.length
      ? `\n\n${linked.length} kopplade ${linked.length === 1 ? "affär" : "affärer"} blir utan kontakt (raderas inte).`
      : "";
    if (!confirm(`Ta bort kontakten "${contact.namn}"?${warn}`)) return;
    await remove({ id });
    toast("Kontakt borttagen");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Kontakter</h1>
          <div className="lead-sub">Kunddatabas – personer kopplade till dina affärer.</div>
        </div>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={createContact}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Ny kontakt
        </button>
      </div>

      <div className="contacts-wrap">
        <div className="table-card">
          {contacts.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              </svg>
              <p><b>Inga kontakter ännu</b><br/>Lägg till din första kundkontakt.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>E-post</th>
                  <th>Telefon</th>
                  <th>Affärer</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const n = leadCount(c._id);
                  return (
                    <tr key={c._id}>
                      <td>
                        <div className="person">
                          <span className="avatar">{initials(c.namn)}</span>
                          <div>
                            <div className="nm">{c.namn}</div>
                            <div className="co">{c.foretag || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <a
                          href={`mailto:${c.epost}`}
                          style={{ color: "var(--accent-deep)", textDecoration: "none" }}
                        >
                          {c.epost || "—"}
                        </a>
                      </td>
                      <td className="muted">{c.telefon || "—"}</td>
                      <td>
                        <span className="pill">{n} {n === 1 ? "affär" : "affärer"}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Visa / redigera"
                            onClick={() => modal.openContactDetail(c._id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
                            </svg>
                          </button>
                          <button
                            className="icon-btn danger"
                            title="Ta bort"
                            onClick={() => handleDelete(c._id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
