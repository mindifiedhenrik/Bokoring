import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOrg } from "../context/OrgContext";
import { Id } from "../../convex/_generated/dataModel";

export default function OrgSwitcher() {
  const { activeOrgId, orgs, loading } = useOrg();
  const setActive = useMutation(api.organizations.setActive);
  if (loading || orgs.length === 0) return null;

  const active = orgs.find((o) => o._id === activeOrgId);
  if (orgs.length === 1) {
    return <div className="org-name">{active?.namn ?? "Organisation"}</div>;
  }
  return (
    <select
      className="org-switcher"
      value={activeOrgId ?? ""}
      onChange={(e) => setActive({ orgId: e.target.value as Id<"organizations"> })}
    >
      {orgs.map((o) => (
        <option key={o._id} value={o._id}>{o.namn}</option>
      ))}
    </select>
  );
}
