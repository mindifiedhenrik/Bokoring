import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import OrgSwitcher from "./OrgSwitcher";

type View = "kanban" | "contacts" | "tasks";

export default function Sidebar({ view, onNavigate, onOpenSettings }: {
  view: View;
  onNavigate: (v: View) => void;
  onOpenSettings: () => void;
}) {
  const leads = useQuery(api.leads.list) ?? [];
  const contacts = useQuery(api.contacts.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();

  const activeTasks = tasks.filter((t) => !t.archived).length;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">Boköring</span>
        <span className="dot"></span>
        <span className="sub">CRM</span>
      </div>
      <OrgSwitcher />

      <div
        className={"nav-item" + (view === "kanban" ? " active" : "")}
        onClick={() => onNavigate("kanban")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="18" rx="1"/>
          <rect x="14" y="3" width="7" height="11" rx="1"/>
        </svg>
        <span>Pipeline</span>
        <span className="count">{leads.length}</span>
      </div>

      <div
        className={"nav-item" + (view === "contacts" ? " active" : "")}
        onClick={() => onNavigate("contacts")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>Kontakter</span>
        <span className="count">{contacts.length}</span>
      </div>

      <div
        className={"nav-item" + (view === "tasks" ? " active" : "")}
        onClick={() => onNavigate("tasks")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        <span>Uppgifter</span>
        <span className="count">{activeTasks}</span>
      </div>

      <button className="settings-btn" onClick={onOpenSettings}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Inställningar</span>
      </button>

      <div className="account">{viewer?.email ?? "Inloggad"}</div>
      <button className="logout" onClick={() => signOut()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Logga ut</span>
      </button>

      <div className="foot">
        <b>Delad arbetsyta</b> · realtidssynk via Convex.
      </div>
    </aside>
  );
}
