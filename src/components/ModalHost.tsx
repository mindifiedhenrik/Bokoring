import { useModal } from "../context/ModalContext";
import LeadDetail from "./kanban/LeadDetail";
import LeadForm from "./kanban/LeadForm";
import ContactDetail from "./contacts/ContactDetail";
import ContactForm from "./contacts/ContactForm";
import TaskForm from "./tasks/TaskForm";
import ProjectForm from "./tasks/ProjectForm";

export default function ModalHost() {
  const m = useModal();
  switch (m.state?.kind) {
    case "leadDetail": return <LeadDetail id={m.state.id} />;
    case "leadForm": return <LeadForm id={m.state.id} presetSteg={m.state.presetSteg} />;
    case "contactDetail": return <ContactDetail id={m.state.id} />;
    case "contactForm": return <ContactForm id={m.state.id} />;
    case "taskForm": return <TaskForm id={m.state.id} presetProject={m.state.presetProject} presetStatus={m.state.presetStatus} />;
    case "projectForm": return <ProjectForm id={m.state.id} />;
    // settings added in a later task
    default: return null;
  }
}
