import { STAGE_VAR } from "../../lib/constants";
import { fmtTimestamp } from "../../lib/format";
import type { Doc } from "../../../convex/_generated/dataModel";

type LogEntry = Doc<"leads">["log"][number];

export default function CardLog({ type, log }: { type: "lead" | "task"; log: LogEntry[] }) {
  const sorted = [...log].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  if (sorted.length === 0) return <div className="muted">Ingen historik ännu.</div>;

  const stageBadge = (s: string | null | undefined) =>
    type === "lead"
      ? <span className="stage-badge" style={{ background: s ? STAGE_VAR[s] : undefined }}>{s}</span>
      : <span className="pill">{s}</span>;

  return (
    <div className="log">
      {sorted.map((e, i) => {
        const isFirst = e.from === null || e.from === undefined;
        return (
          <div key={i} className={"log-item" + (isFirst && e.fromProject === undefined && !e.restored && !e.archived ? " first" : "")}>
            <span className="node" />
            <div className="when">{fmtTimestamp(e.ts)}</div>
            <div className="what">
              {e.restored ? <span>Återställd från arkiv</span>
                : e.archived ? <span>Arkiverad från Done</span>
                : e.fromProject !== undefined ? <><span>Projektbyte:</span> <span className="pill">{e.fromProject}</span> <span className="arrow">→</span> <span className="pill">{e.toProject}</span></>
                : isFirst ? <><span>{type === "lead" ? "Skapat i" : "Skapad i"}</span> {stageBadge(e.to)}</>
                : <>{stageBadge(e.from)} <span className="arrow">→</span> {stageBadge(e.to)}</>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
