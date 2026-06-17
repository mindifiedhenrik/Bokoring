import { useModal } from "../context/ModalContext";
import LeadDetail from "./kanban/LeadDetail";
import LeadForm from "./kanban/LeadForm";

export default function ModalHost() {
  const m = useModal();
  switch (m.state?.kind) {
    case "leadDetail": return <LeadDetail id={m.state.id} />;
    case "leadForm": return <LeadForm id={m.state.id} presetSteg={m.state.presetSteg} />;
    // contactDetail/contactForm/taskForm/projectForm/settings added in later tasks
    default: return null;
  }
}
