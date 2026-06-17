import { createContext, useContext, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type ModalState =
  | { kind: "leadDetail"; id: Id<"leads"> }
  | { kind: "leadForm"; id?: Id<"leads">; presetSteg?: string }
  | { kind: "contactDetail"; id: Id<"contacts"> }
  | { kind: "contactForm"; id?: Id<"contacts"> }
  | { kind: "taskForm"; id?: Id<"tasks">; presetProject?: Id<"projects">; presetStatus?: string }
  | { kind: "projectForm"; id?: Id<"projects"> }
  | { kind: "settings" }
  | null;

type Api = {
  state: ModalState;
  openLeadDetail: (id: Id<"leads">) => void;
  openLeadForm: (id?: Id<"leads">, presetSteg?: string) => void;
  openContactDetail: (id: Id<"contacts">) => void;
  openContactForm: (id?: Id<"contacts">) => void;
  openTaskForm: (id?: Id<"tasks">, presetProject?: Id<"projects">, presetStatus?: string) => void;
  openProjectForm: (id?: Id<"projects">) => void;
  openSettings: () => void;
  close: () => void;
};

const Ctx = createContext<Api>(null as unknown as Api);
export const useModal = () => useContext(Ctx);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ModalState>(null);
  const api: Api = {
    state,
    openLeadDetail: (id) => setState({ kind: "leadDetail", id }),
    openLeadForm: (id, presetSteg) => setState({ kind: "leadForm", id, presetSteg }),
    openContactDetail: (id) => setState({ kind: "contactDetail", id }),
    openContactForm: (id) => setState({ kind: "contactForm", id }),
    openTaskForm: (id, presetProject, presetStatus) => setState({ kind: "taskForm", id, presetProject, presetStatus }),
    openProjectForm: (id) => setState({ kind: "projectForm", id }),
    openSettings: () => setState({ kind: "settings" }),
    close: () => setState(null),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
