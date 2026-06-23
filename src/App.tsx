import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import ModalHost from "./components/ModalHost";
import { ToastProvider } from "./context/ToastContext";
import { ModalProvider, useModal } from "./context/ModalContext";
import { OrgProvider } from "./context/OrgContext";
import PipelineView from "./components/kanban/PipelineView";
import ContactsView from "./components/contacts/ContactsView";
import TasksView from "./components/tasks/TasksView";
import RoadmapView from "./components/roadmap/RoadmapView";

type View = "kanban" | "contacts" | "tasks" | "roadmap";

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
      </main>
      <ModalHost />
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading><div className="boot">Laddar…</div></AuthLoading>
      <Unauthenticated><LoginScreen /></Unauthenticated>
      <Authenticated>
        <ToastProvider>
          <ModalProvider>
            <OrgProvider>
              <Workspace />
            </OrgProvider>
          </ModalProvider>
        </ToastProvider>
      </Authenticated>
    </>
  );
}
