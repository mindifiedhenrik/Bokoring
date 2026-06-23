import type React from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { PRIORITY_CLASS } from "../../lib/constants";
import { daysSinceMove, fmtDate } from "../../lib/format";

interface TaskCardProps {
  task: Doc<"tasks">;
  projectColor: string;
  archiveDays: number;
  ownerName: string | null;
  milestoneDate?: string;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
}

export default function TaskCard({ task, projectColor, archiveDays, ownerName, milestoneDate, onClick, onDragStart, onDragEnd, onDragOver }: TaskCardProps) {
  const cls = PRIORITY_CLASS[task.prioritet] ?? "normal";
  const days = daysSinceMove(task);
  // Highlight when a Done card is one day away from being archived.
  const warn = task.status === "Done" && archiveDays > 0 && days >= archiveDays - 1;

  return (
    <div
      className="task-card"
      draggable
      style={{ ["--tc" as any]: projectColor }}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <span
        className={"age" + (warn ? " warn" : "")}
        title={`${days} ${days === 1 ? "dag" : "dagar"} sedan senaste flytt`}
      >
        {days}d
      </span>
      <h4>{task.titel}</h4>
      <div className="tm">
        <span className={"prio " + cls}>{task.prioritet || "Normal"}</span>
        {ownerName ? <span className="task-owner">{ownerName}</span> : null}
      </div>
      {milestoneDate ? (
        <span className="task-flag" title={"Milstolpe: " + fmtDate(milestoneDate)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
          {fmtDate(milestoneDate)}
        </span>
      ) : null}
    </div>
  );
}
