import { createContext, useContext, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export type CardType = "lead" | "task";

type ModalState =
  | { kind: "cardDetail"; type: "lead"; id: Id<"leads"> }
  | { kind: "cardDetail"; type: "task"; id: Id<"tasks"> }
  | { kind: "contactDetail"; id: Id<"contacts"> }
  | { kind: "projectForm"; id?: Id<"projects"> }
  | { kind: "settings" }
  | null;

type Api = {
  state: ModalState;
  openLeadDetail: (id: Id<"leads">) => void;
  openTaskDetail: (id: Id<"tasks">) => void;
  openContactDetail: (id: Id<"contacts">) => void;
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
    openLeadDetail: (id) => setState({ kind: "cardDetail", type: "lead", id }),
    openTaskDetail: (id) => setState({ kind: "cardDetail", type: "task", id }),
    openContactDetail: (id) => setState({ kind: "contactDetail", id }),
    openProjectForm: (id) => setState({ kind: "projectForm", id }),
    openSettings: () => setState({ kind: "settings" }),
    close: () => setState(null),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
