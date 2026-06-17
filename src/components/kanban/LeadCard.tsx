import type React from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { STAGE_VAR } from "../../lib/constants";
import { initials } from "../../lib/format";

interface LeadCardProps {
  lead: Doc<"leads">;
  contactName: string;
  ownerName: string;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
}

export default function LeadCard({ lead, contactName, ownerName, onClick, onDragStart, onDragEnd, onDragOver }: LeadCardProps) {
  const color = STAGE_VAR[lead.steg];
  const prob = lead.sannolikhet ?? 0;

  return (
    <div
      className="card"
      draggable
      style={{ ["--stage-color" as any]: color }}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <h3>{lead.titel}</h3>
      <div className="contact">
        <span className="avatar">{initials(contactName)}</span>
        {contactName}
      </div>
      <div className="meta">
        <span className="prob">
          <span className="bar">
            <i style={{ width: prob + "%" }} />
          </span>
          {prob}%
        </span>
        <span className="owner">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          {ownerName}
        </span>
      </div>
    </div>
  );
}
