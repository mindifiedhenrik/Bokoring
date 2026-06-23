import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOrg } from "../context/OrgContext";
import { Id } from "../../convex/_generated/dataModel";

export default function OrgSwitcher() {
  const { activeOrgId, orgs, loading } = useOrg();
  const setActive = useMutation(api.organizations.setActive);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading || orgs.length === 0) return null;

  const active = orgs.find((o) => o._id === activeOrgId);

  // A single org needs no switcher — just show its name.
  if (orgs.length === 1) {
    return <div className="org-name">{active?.namn ?? "Organisation"}</div>;
  }

  return (
    <div className="org-switcher" ref={ref}>
      <button
        type="button"
        className="org-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="org-switcher-label">{active?.namn ?? "Välj organisation"}</span>
        <svg
          className={"org-switcher-chevron" + (open ? " open" : "")}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="org-menu" role="listbox">
          {orgs.map((o) => {
            const isActive = o._id === activeOrgId;
            return (
              <button
                key={o._id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={"org-menu-item" + (isActive ? " active" : "")}
                onClick={() => {
                  if (!isActive) setActive({ orgId: o._id as Id<"organizations"> });
                  setOpen(false);
                }}
              >
                <svg
                  className="org-menu-check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  style={{ visibility: isActive ? "visible" : "hidden" }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{o.namn}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
