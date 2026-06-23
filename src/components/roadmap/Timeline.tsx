import { useEffect, useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ZOOM_LEVELS, addDays, dateToX, daysBetween, monthTicks, timelineWindow, xToDate } from "../../lib/timeline";
import { fmtDate } from "../../lib/format";

type Milestone = {
  _id: Id<"milestones">;
  titel: string;
  datum: string;
  color: string;
  taskIds: Id<"tasks">[];
  lane?: number;
};

type LinkedTask = { id: string; titel: string; color: string };

type Props = {
  milestones: Milestone[];
  linkedTasks: (m: Milestone) => LinkedTask[];
  zoomIndex: number;
  onZoom: (delta: number) => void;
  onOpen: (id: Id<"milestones">) => void;
  onSetPosition: (id: Id<"milestones">, datum: string, lane: number) => void;
  onCreateAt: (datum: string) => void;
};

const TODAY = new Date().toISOString().slice(0, 10);

// Vertical geometry: the axis sits at LINE_Y; a card in row `lane` hangs
// BASE_GAP + lane * ROW_H below it, connected by a line. ROW_H is larger than a
// card so stacked rows never overlap.
const LINE_Y = 100;
const BASE_GAP = 14;
const ROW_H = 80;
const MAX_LANE = 8;

type Drag = {
  id: Id<"milestones">;
  startX: number;
  startY: number;
  date: string;
  lane: number;
  previewDate: string;
  previewLane: number;
};

type Pending = { id: Id<"milestones">; date: string; lane: number };

export default function Timeline({ milestones, linkedTasks, zoomIndex, onZoom, onOpen, onSetPosition, onCreateAt }: Props) {
  const pxPerDay = ZOOM_LEVELS[zoomIndex];
  const canvasRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Hold the just-dropped position until the server round-trips, so the card
  // doesn't flash back to its old spot between drop and the query update.
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!pending) return;
    const m = milestones.find((x) => x._id === pending.id);
    if (!m || (m.datum === pending.date && m.lane === pending.lane)) setPending(null);
  }, [milestones, pending]);

  // Persistent row for a milestone, falling back to a staggered default for any
  // that have never been placed.
  const laneOf = (m: Milestone, i: number) => m.lane ?? i % 3;

  // Effective (date, lane) to render: live drag preview > just-dropped pending > stored.
  const effPos = (m: Milestone, i: number) => {
    if (drag?.id === m._id) return { date: drag.previewDate, lane: drag.previewLane };
    if (pending?.id === m._id) return { date: pending.date, lane: pending.lane };
    return { date: m.datum, lane: laneOf(m, i) };
  };

  const { startDate, endDate } = timelineWindow(milestones.map((m) => m.datum), TODAY);
  const width = Math.max(daysBetween(startDate, endDate) * pxPerDay, 600);

  // Zoomed far out: keep only quarter-start labels so they don't crowd.
  const ticks = monthTicks(startDate, endDate).filter(
    (t) => pxPerDay >= 4 || new Date(t).getUTCMonth() % 3 === 0,
  );

  // Grow the canvas so the deepest row (and its hover popover) is never clipped.
  const deepestLane = milestones.reduce((mx, m, i) => Math.max(mx, effPos(m, i).lane), 0);
  const minHeight = LINE_Y + BASE_GAP + deepestLane * ROW_H + 64 + 180;

  function onPointerDown(e: React.PointerEvent, m: Milestone, lane: number) {
    canvasRef.current?.setPointerCapture(e.pointerId);
    movedRef.current = false;
    setDrag({ id: m._id, startX: e.clientX, startY: e.clientY, date: m.datum, lane, previewDate: m.datum, previewLane: lane });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
    const deltaLanes = Math.round((e.clientY - drag.startY) / ROW_H);
    const previewDate = addDays(drag.date, deltaDays);
    const previewLane = Math.max(0, Math.min(MAX_LANE, drag.lane + deltaLanes));
    if (deltaDays !== 0 || deltaLanes !== 0) movedRef.current = true;
    setDrag({ ...drag, previewDate, previewLane });
  }
  function onPointerUp() {
    if (!drag) return;
    if (drag.previewDate !== drag.date || drag.previewLane !== drag.lane) {
      setPending({ id: drag.id, date: drag.previewDate, lane: drag.previewLane });
      onSetPosition(drag.id, drag.previewDate, drag.previewLane);
    }
    setDrag(null);
  }
  function onPointerCancel() {
    // Interrupted gesture (e.g. OS pointercancel): abandon the drag without committing.
    setDrag(null);
    movedRef.current = false;
  }
  function onCardClick(id: Id<"milestones">) {
    if (movedRef.current) { movedRef.current = false; return; }
    onOpen(id);
  }
  function onWheel(e: React.WheelEvent) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); onZoom(e.deltaY < 0 ? 1 : -1); }
  }
  function onCanvasClick(e: React.MouseEvent) {
    // Ignore clicks on a card (those open it) and the click that ends a drag.
    if (movedRef.current) { movedRef.current = false; return; }
    if ((e.target as HTMLElement).closest(".tl-card")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    onCreateAt(xToDate(e.clientX - rect.left, startDate, pxPerDay));
  }

  const todayX = dateToX(TODAY, startDate, pxPerDay);

  return (
    <div className="tl-scroll" onWheel={onWheel}>
      <div ref={canvasRef} className="tl-canvas" style={{ width, minHeight }}
        onClick={onCanvasClick}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
        <div className="tl-axis">
          {ticks.map((t) => (
            <div key={t} className="tl-tick" style={{ left: dateToX(t, startDate, pxPerDay) }}>
              <span className="tl-tick-label">
                {new Date(t).toLocaleDateString("sv-SE", { month: "short", year: pxPerDay < 8 ? "2-digit" : undefined })}
              </span>
            </div>
          ))}
        </div>

        <div className="tl-line" />
        <div className="tl-today" style={{ left: todayX }} title={"Idag · " + fmtDate(TODAY)}>
          <span className="tl-today-label">Idag</span>
        </div>

        {milestones.map((m, i) => {
          const dragging = drag?.id === m._id;
          const { date, lane } = effPos(m, i);
          const x = dateToX(date, startDate, pxPerDay);
          const linked = linkedTasks(m);
          return (
            <div key={m._id} className={"tl-ms" + (dragging ? " dragging" : "")} style={{ left: x }}>
              <span className="tl-dot" style={{ background: m.color }} />
              <span className="tl-connector" style={{ height: BASE_GAP + lane * ROW_H }} />
              <div className="tl-card" style={{ borderLeftColor: m.color }}
                onPointerDown={(e) => onPointerDown(e, m, lane)} onClick={() => onCardClick(m._id)}>
                <div className="tl-card-titel">{m.titel}</div>
                <div className="tl-card-meta">
                  <span>{fmtDate(date)}</span>
                  {linked.length > 0 && <span className="tl-card-count">{linked.length} kort</span>}
                </div>
                {linked.length > 0 && (
                  <div className="tl-pop">
                    <div className="tl-pop-head">Kopplade uppgifter</div>
                    {linked.map((t) => (
                      <div key={t.id} className="tl-pop-row">
                        <span className="tl-pop-dot" style={{ background: t.color }} />
                        <span className="tl-pop-titel">{t.titel}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
