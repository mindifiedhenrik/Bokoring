import { useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ZOOM_LEVELS, addDays, dateToX, daysBetween, monthTicks } from "../../lib/timeline";
import { fmtDate } from "../../lib/format";

type Milestone = {
  _id: Id<"milestones">;
  titel: string;
  datum: string;
  color: string;
  taskIds: Id<"tasks">[];
};

type LinkedTask = { id: string; titel: string; color: string };

type Props = {
  milestones: Milestone[];
  linkedTasks: (m: Milestone) => LinkedTask[];
  zoomIndex: number;
  onZoom: (delta: number) => void;
  onOpen: (id: Id<"milestones">) => void;
  onSetDate: (id: Id<"milestones">, datum: string) => void;
};

const TODAY = new Date().toISOString().slice(0, 10);

type Drag = { id: Id<"milestones">; startX: number; date: string; preview: string };

export default function Timeline({ milestones, linkedTasks, zoomIndex, onZoom, onOpen, onSetDate }: Props) {
  const pxPerDay = ZOOM_LEVELS[zoomIndex];
  const canvasRef = useRef<HTMLDivElement>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Time window: pad around the earliest/latest milestone and today.
  const dates = [TODAY, ...milestones.map((m) => m.datum)];
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  const startDate = addDays(min, -30);
  const endDate = addDays(max, 60);
  const width = Math.max(daysBetween(startDate, endDate) * pxPerDay, 600);

  // Zoomed far out: keep only quarter-start labels so they don't crowd.
  const ticks = monthTicks(startDate, endDate).filter(
    (t) => pxPerDay >= 4 || new Date(t).getUTCMonth() % 3 === 0,
  );

  function onPointerDown(e: React.PointerEvent, m: Milestone) {
    canvasRef.current?.setPointerCapture(e.pointerId);
    movedRef.current = false;
    setDrag({ id: m._id, startX: e.clientX, date: m.datum, preview: m.datum });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
    if (deltaDays !== 0) movedRef.current = true;
    setDrag((d) => (d ? { ...d, preview: addDays(d.date, deltaDays) } : d));
  }
  function onPointerUp() {
    if (!drag) return;
    if (drag.preview !== drag.date) onSetDate(drag.id, drag.preview);
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

  const todayX = dateToX(TODAY, startDate, pxPerDay);

  return (
    <div className="tl-scroll" onWheel={onWheel}>
      <div ref={canvasRef} className="tl-canvas" style={{ width }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
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
          const date = drag && drag.id === m._id ? drag.preview : m.datum;
          const x = dateToX(date, startDate, pxPerDay);
          const lane = i % 3;
          const linked = linkedTasks(m);
          return (
            <div key={m._id} className={"tl-ms lane-" + lane + (drag?.id === m._id ? " dragging" : "")} style={{ left: x }}>
              <span className="tl-dot" style={{ background: m.color }} />
              <span className="tl-connector" />
              <div className="tl-card" style={{ borderLeftColor: m.color }}
                onPointerDown={(e) => onPointerDown(e, m)} onClick={() => onCardClick(m._id)}>
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
