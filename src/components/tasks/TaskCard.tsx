import type React from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import { PRIORITY_CLASS } from "../../lib/constants";
import { daysSinceMove } from "../../lib/format";

interface TaskCardProps {
  task: Doc<"tasks">;
  projectColor: string;
  archiveDays: number;
  ownerName: string | null;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
}

export default function TaskCard({ task, projectColor, archiveDays, ownerName, onClick, onDragStart, onDragEnd, onDragOver }: TaskCardProps) {
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
    </div>
  );
}
