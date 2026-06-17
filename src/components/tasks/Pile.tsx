import type { Doc } from "../../../convex/_generated/dataModel";

interface PileProps {
  items: Doc<"tasks">[];
  color: string;
  onOpen: () => void;
}

// A collapsed pile of cards in one phase of one project.
export default function Pile({ items, color, onOpen }: PileProps) {
  const top = items.slice(0, 2).map((t) => t.titel).join(" · ");
  return (
    <div
      className="pile"
      style={{ ["--tc" as any]: color }}
      onClick={onOpen}
      title={`Öppna högen – ${items.length} kort`}
    >
      <div className="pile-head">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 2 7l10 5 10-5-10-5z" />
          <path d="m2 17 10 5 10-5" />
          <path d="m2 12 10 5 10-5" />
        </svg>
        <span className="pile-count">{items.length} kort</span>
        <span className="pile-toggle">Öppna</span>
      </div>
      <div className="pile-preview">
        {top}
        {items.length > 2 ? ` · +${items.length - 2}` : ""}
      </div>
    </div>
  );
}
