import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MILESTONE_COLORS } from "../../lib/constants";
import { ZOOM_LEVELS, DEFAULT_ZOOM_INDEX, clampZoomIndex } from "../../lib/timeline";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import Timeline from "./Timeline";

export default function RoadmapView() {
  const milestones = useQuery(api.milestones.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const projects = useQuery(api.projects.list) ?? [];
  const create = useMutation(api.milestones.create);
  const setDate = useMutation(api.milestones.setDate);
  const modal = useModal();
  const toast = useToast();
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  const taskById = new Map(tasks.map((t) => [t._id as string, t]));
  const projColor = new Map(projects.map((p) => [p._id as string, p.color]));
  // Linked task cards for a milestone, dropping any whose task was since deleted.
  const linkedTasks = (m: { taskIds: Id<"tasks">[] }) =>
    m.taskIds
      .map((id) => taskById.get(id as string))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ id: t._id as string, titel: t.titel, color: projColor.get(t.projectId as string) ?? "var(--line)" }));

  async function createMilestone() {
    const today = new Date().toISOString().slice(0, 10);
    const id = await create({ titel: "Namnlös milstolpe", beskrivning: "", datum: today, color: MILESTONE_COLORS[0] });
    modal.openMilestoneDetail(id);
  }
  function zoom(delta: number) {
    setZoomIndex((i) => clampZoomIndex(i + delta));
  }

  return (
    <>
      <div className="topbar">
        <h1>Roadmap</h1>
        <div className="spacer" />
        <div className="tl-zoom">
          <button className="btn btn-ghost" onClick={() => zoom(-1)} disabled={zoomIndex === 0} aria-label="Zooma ut">−</button>
          <button className="btn btn-ghost" onClick={() => zoom(1)} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label="Zooma in">+</button>
        </div>
        <button className="btn btn-primary" onClick={createMilestone}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Ny milstolpe
        </button>
      </div>

      {milestones.length === 0 ? (
        <div className="tl-empty">Inga milstolpar än. Skapa din första med "Ny milstolpe".</div>
      ) : (
        <Timeline
          milestones={milestones}
          linkedTasks={linkedTasks}
          zoomIndex={zoomIndex}
          onZoom={zoom}
          onOpen={(id) => modal.openMilestoneDetail(id)}
          onSetDate={async (id, datum) => { await setDate({ id, datum }); toast("Milstolpe flyttad"); }}
        />
      )}
    </>
  );
}
