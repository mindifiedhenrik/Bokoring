import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type Org = { _id: string; namn: string };
type OrgState = { activeOrgId: string | null; orgs: Org[]; loading: boolean };

const OrgCtx = createContext<OrgState>({ activeOrgId: null, orgs: [], loading: true });

export function OrgProvider({ children }: { children: ReactNode }) {
  const data = useQuery(api.organizations.myOrgs);
  const value: OrgState = data
    ? { activeOrgId: data.activeOrgId, orgs: data.orgs, loading: false }
    : { activeOrgId: null, orgs: [], loading: true };
  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>;
}

export function useOrg() {
  return useContext(OrgCtx);
}
