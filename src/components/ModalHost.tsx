import { useModal } from "../context/ModalContext";
import CardDetail from "./cards/CardDetail";
import ContactDetail from "./contacts/ContactDetail";
import ProjectForm from "./tasks/ProjectForm";
import SettingsModal from "./settings/SettingsModal";
import MilestoneDetail from "./roadmap/MilestoneDetail";

export default function ModalHost() {
  const m = useModal();
  switch (m.state?.kind) {
    case "cardDetail":
      return m.state.type === "lead" ? (
        <CardDetail type="lead" id={m.state.id} />
      ) : (
        <CardDetail type="task" id={m.state.id} />
      );
    case "contactDetail": return <ContactDetail id={m.state.id} returnLeadId={m.state.returnLeadId} />;
    case "projectForm": return <ProjectForm id={m.state.id} />;
    case "milestoneDetail": return <MilestoneDetail id={m.state.id} />;
    case "settings": return <SettingsModal />;
    default: return null;
  }
}
