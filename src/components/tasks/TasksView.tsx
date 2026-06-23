import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TASK_STATUSES } from "../../lib/constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import { orderForIndex, insertIndexFromHint, type DropHint } from "../../lib/ordering";
import { ownerName } from "../../lib/users";
import TaskCard from "./TaskCard";
import Pile from "./Pile";

export default function TasksView() {
  const projects = useQuery(api.projects.list) ?? [];
  const tasks = useQuery(api.tasks.list) ?? [];
  const milestones = useQuery(api.milestones.list) ?? [];
  const settings = useQuery(api.settings.get) ?? { archiveDays: 3, pileThreshold: 3 };

  // Earliest milestone date a task is linked to (a task may belong to several).
  const milestoneDateByTask = new Map<string, string>();
  for (const m of milestones) {
    for (const tid of m.taskIds) {
      const key = tid as string;
      const cur = milestoneDateByTask.get(key);
      if (!cur || m.datum < cur) milestoneDateByTask.set(key, m.datum);
    }
  }

  const users = useQuery(api.users.list) ?? [];
  const move = useMutation(api.tasks.move);
  const reorder = useMutation(api.tasks.reorder);
  const reorderProject = useMutation(api.projects.reorder);
  const create = useMutation(api.tasks.create);
  const modal = useModal();
  const toast = useToast();

  async function createTask(projectId: Id<"projects">, status: string) {
    const id = await create({ titel: "Namnlös uppgift", beskrivning: "", projectId, status, prioritet: "Normal" });
    modal.openTaskDetail(id);
  }

  const [dragId, setDragId] = useState<Id<"tasks"> | null>(null);
  const [dragProjectId, setDragProjectId] = useState<Id<"projects"> | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const th = Number(settings.pileThreshold);
  const archiveDays = Number(settings.archiveDays);

  const cellTasks = (pid: Id<"projects">, status: string) =>
    tasks.filter((t) => t.projectId === pid && t.status === status && !t.archived);

  function toggleKey(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Open or close every pile in one project at once.
  function toggleProject(pid: Id<"projects">) {
    const keys = TASK_STATUSES.filter((s) => th > 0 && cellTasks(pid, s).length > th).map((s) => pid + "|" + s);
    if (!keys.length) return;
    const allOpen = keys.every((k) => expanded.has(k));
    setExpanded((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOpen ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function clearDrag() {
    setOverKey(null);
    setDropHint(null);
    setDragId(null);
    setDragProjectId(null);
  }

  async function onDrop(pid: Id<"projects">, status: string) {
    const id = dragId;
    const hint = dropHint;
    // A project row is being dragged, not a task card — ignore for cells.
    if (!id) {
      clearDrag();
      return;
    }
    clearDrag();
    const task = tasks.find((t) => t._id === id);
    if (!task) return;
    const cellKey = pid + "|" + status;
    const excl = cellTasks(pid, status).filter((t) => t._id !== id);
    const insertIndex = hint && hint.key === cellKey ? insertIndexFromHint(excl, hint) : excl.length;
    const order = orderForIndex(excl, insertIndex);
    const sameCell = task.projectId === pid && task.status === status;
    if (sameCell) {
      await reorder({ id, order });
      toast("Ordning uppdaterad");
      return;
    }
    const crossProject = task.projectId !== pid;
    if (crossProject) {
      const fromP = projects.find((p) => p._id === task.projectId)?.namn ?? "—";
      const toP = projects.find((p) => p._id === pid)?.namn ?? "—";
      if (!confirm(`Flytta ”${task.titel}” från projektet ”${fromP}” till ”${toP}”?`)) return;
    }
    await move({ id, projectId: pid, status, order });
    toast(crossProject ? "Flyttad till annat projekt" : `Flyttad till ”${status}”`);
  }

  async function onDropProject(targetId: Id<"projects">) {
    const id = dragProjectId;
    const hint = dropHint;
    // A task card is being dragged, not a project row — ignore.
    if (!id) {
      clearDrag();
      return;
    }
    clearDrag();
    const excl = projects.filter((p) => p._id !== id);
    const insertIndex =
      hint && hint.key === "projects" ? insertIndexFromHint(excl, hint) : excl.length;
    const order = orderForIndex(excl, insertIndex);
    void targetId;
    await reorderProject({ id, order });
    toast("Projektordning uppdaterad");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Uppgifter</h1>
          <div className="lead-sub">Tasks per projekt – dra korten mellan stegen (Backlog → Done).</div>
        </div>
        <div className="spacer"></div>
        <button className="btn btn-ghost" onClick={() => modal.openProjectForm()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nytt projekt
        </button>
        <button className="btn btn-primary" onClick={() => { const p = projects[0]; if (p) createTask(p._id, "Backlog"); else modal.openProjectForm(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Ny uppgift
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="tasks-wrap">
          <div className="tasks-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <p>
              <b>Inga projekt ännu</b>
              <br />
              Skapa ett projekt för att börja planera uppgifter.
            </p>
            <button className="btn btn-primary" style={{ margin: "0 auto" }} onClick={() => modal.openProjectForm()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nytt projekt
            </button>
          </div>
        </div>
      ) : (
        <div className="tasks-wrap">
          <div className="swim-grid">
            <div className="swim-head">
              <div className="swim-corner">Projekt</div>
              {TASK_STATUSES.map((s) => {
                const n = tasks.filter((t) => t.status === s && !t.archived).length;
                return (
                  <div key={s}>
                    {s}
                    <span className="n">{n}</span>
                  </div>
                );
              })}
            </div>

            {projects.map((p) => {
              const total = tasks.filter((t) => t.projectId === p._id && !t.archived).length;
              const pileKeys = TASK_STATUSES.filter((s) => th > 0 && cellTasks(p._id, s).length > th).map((s) => p._id + "|" + s);
              const hasPiles = pileKeys.length > 0;
              const allOpen = hasPiles && pileKeys.every((k) => expanded.has(k));
              const projHint = dropHint && dropHint.key === "projects" && dropHint.id === p._id;
              return (
                <div className="swim-row" key={p._id}>
                  <div
                    className={"swim-label" + (projHint ? (dropHint!.before ? " drop-before" : " drop-after") : "")}
                    style={{ ["--pc" as any]: p.color, cursor: "grab" }}
                    draggable
                    onDragStart={() => setDragProjectId(p._id)}
                    onDragEnd={clearDrag}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!dragProjectId) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const before = e.clientY < r.top + r.height / 2;
                      setDropHint({ key: "projects", id: p._id, before });
                    }}
                    onDrop={() => onDropProject(p._id)}
                  >
                    <div className="swim-bar"></div>
                    <div className="pbody">
                      <div className="pn">{p.namn}</div>
                      <div className="pmeta">{total} {total === 1 ? "uppgift" : "uppgifter"}</div>
                    </div>
                    <div className="plabel-actions">
                      {hasPiles && (
                        <button
                          className="proj-piles"
                          title={allOpen ? "Stäng alla högar" : "Öppna alla högar"}
                          onClick={() => toggleProject(p._id)}
                        >
                          {allOpen ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m7 4 5 5 5-5M7 20l5-5 5 5" />
                            </svg>
                          )}
                        </button>
                      )}
                      <button className="pedit" title="Redigera projekt" onClick={() => modal.openProjectForm(p._id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {TASK_STATUSES.map((s) => {
                    const items = cellTasks(p._id, s);
                    const key = p._id + "|" + s;
                    const overflow = th > 0 && items.length > th;
                    const piled = overflow && !expanded.has(key);
                    return (
                      <div
                        key={s}
                        className={"swim-cell" + (overKey === key ? " drag-over" : "")}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setOverKey(key);
                          if (dragId) setDropHint({ key, id: null, before: false });
                        }}
                        onDragLeave={() => setOverKey(null)}
                        onDrop={() => onDrop(p._id, s)}
                      >
                        {piled ? (
                          <Pile items={items} color={p.color} onOpen={() => toggleKey(key)} />
                        ) : (
                          <>
                            {items.map((item) => {
                              const hintMatch = dropHint && dropHint.key === key && dropHint.id === item._id;
                              return (
                                <div key={item._id} className="drop-slot">
                                  {hintMatch && dropHint!.before && <div className="drop-line" />}
                                  <TaskCard
                                    task={item}
                                    projectColor={p.color}
                                    archiveDays={archiveDays}
                                    ownerName={ownerName(users, item.agareId)}
                                    milestoneDate={milestoneDateByTask.get(item._id as string)}
                                    onClick={() => modal.openTaskDetail(item._id)}
                                    onDragStart={() => setDragId(item._id)}
                                    onDragEnd={clearDrag}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!dragId) return;
                                      const r = e.currentTarget.getBoundingClientRect();
                                      const before = e.clientY < r.top + r.height / 2;
                                      setOverKey(key);
                                      setDropHint({ key, id: item._id, before });
                                    }}
                                  />
                                  {hintMatch && !dropHint!.before && <div className="drop-line" />}
                                </div>
                              );
                            })}
                            {overflow && (
                              <button className="pile-collapse" onClick={() => toggleKey(key)}>
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m6 9 6-6 6 6M6 15l6 6 6-6" />
                                </svg>
                                Lägg ihop hög ({items.length})
                              </button>
                            )}
                          </>
                        )}
                        <button className="cell-add" onClick={() => createTask(p._id, s)}>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          Uppgift
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
