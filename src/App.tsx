import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import LoginScreen from "./components/LoginScreen";
import JoinOrgScreen from "./components/JoinOrgScreen";
import Sidebar from "./components/Sidebar";
import ModalHost from "./components/ModalHost";
import { ToastProvider } from "./context/ToastContext";
import { ModalProvider, useModal } from "./context/ModalContext";
import { OrgProvider } from "./context/OrgContext";
import PipelineView from "./components/kanban/PipelineView";
import ContactsView from "./components/contacts/ContactsView";
import TasksView from "./components/tasks/TasksView";
import RoadmapView from "./components/roadmap/RoadmapView";
import BoardView from "./components/board/BoardView";

type View = "kanban" | "contacts" | "tasks" | "roadmap" | "board";

function Workspace() {
  const [view, setView] = useState<View>("kanban");
  const modal = useModal();
  return (
    <div className="app">
      <Sidebar view={view} onNavigate={setView} onOpenSettings={modal.openSettings} />
      <main className="main">
        {view === "kanban" && <PipelineView />}
        {view === "contacts" && <ContactsView />}
        {view === "tasks" && <TasksView />}
        {view === "roadmap" && <RoadmapView />}
        {view === "board" && <BoardView />}
      </main>
      <ModalHost />
    </div>
  );
}

function AuthedApp() {
  const orgState = useQuery(api.organizations.myOrgs);
  if (orgState === undefined) return <div className="boot">Laddar…</div>;
  if (!orgState.activeOrgId) return <JoinOrgScreen />;
  return (
    <ToastProvider>
      <ModalProvider>
        <OrgProvider>
          <Workspace />
        </OrgProvider>
      </ModalProvider>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading><div className="boot">Laddar…</div></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated>
        <AuthedApp />
      </Authenticated>
    </>
  );
}
