import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { initials, fmtDate } from "../../lib/format";
import { useModal } from "../../context/ModalContext";

type Sort = "namn" | "reminder" | "note";

export default function ContactsView() {
  const contacts = useQuery(api.contacts.list) ?? [];
  const leads = useQuery(api.leads.list) ?? [];
  const create = useMutation(api.contacts.create);
  const modal = useModal();

  const [sort, setSort] = useState<Sort>("namn");
  const today = new Date().toISOString().slice(0, 10);

  const leadCount = (id: Id<"contacts">) =>
    leads.filter((l) => l.contactId === id).length;

  const sorted = [...contacts].sort((a, b) => {
    if (sort === "reminder") {
      const ad = a.reminderDatum ?? null;
      const bd = b.reminderDatum ?? null;
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1; // earliest first (ISO dates)
      if (ad && !bd) return -1; // contacts with a reminder before those without
      if (!ad && bd) return 1;
    } else if (sort === "note") {
      const an = a.lastNoteAt ?? 0;
      const bn = b.lastNoteAt ?? 0;
      if (an !== bn) return bn - an; // most recent note first
    }
    return a.namn.localeCompare(b.namn, "sv");
  });

  async function createContact() {
    const id = await create({ namn: "Namnlös kontakt", foretag: "", epost: "", telefon: "" });
    modal.openContactDetail(id);
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Kontakter</h1>
          <div className="lead-sub">Kunddatabas – personer kopplade till dina affärer.</div>
        </div>
        <div className="spacer"></div>
        <label className="sort-control">
          Sortera
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="namn">Namn</option>
            <option value="reminder">Påminnelsedatum</option>
            <option value="note">Senaste anteckning</option>
          </select>
        </label>
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
                  <th>Påminnelse</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const n = leadCount(c._id);
                  return (
                    <tr
                      key={c._id}
                      style={{ cursor: "pointer" }}
                      onClick={() => modal.openContactDetail(c._id)}
                    >
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.epost || "—"}
                        </a>
                      </td>
                      <td className="muted">{c.telefon || "—"}</td>
                      <td>
                        <span className="pill">{n} {n === 1 ? "affär" : "affärer"}</span>
                      </td>
                      <td>
                        {c.reminderDatum ? (
                          <div className="rem-cell">
                            <span className={"rem-date" + (c.reminderDatum < today ? " overdue" : "")}>
                              {fmtDate(c.reminderDatum)}
                            </span>
                            {c.reminderText ? <span className="rem-text">{c.reminderText}</span> : null}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
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
