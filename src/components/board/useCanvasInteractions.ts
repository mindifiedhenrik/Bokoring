import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { normalizeRect, elementBounds, rectsIntersect, screenToWorld, type Viewport } from "../../lib/board";
import type { BoardTool } from "../../lib/constants";

type El = Doc<"boardElements">;
type Geo = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
const THRESH = 4;

export type Draft = { kind: "line" | "rect" | "circle"; x: number; y: number; w: number; h: number; color: string } | null;
export type Marquee = { x: number; y: number; w: number; h: number } | null; // screen-space

export type InteractionOpts = {
  boardId: Id<"boards">;
  elements: El[];
  tool: BoardTool;
  setTool: (t: BoardTool) => void;
  color: string;
  fontSize: number;
  bold: boolean;
  vp: Viewport;
  pan: (dx: number, dy: number) => void;
  selectedIds: Id<"boardElements">[];
  setSelectedIds: (ids: Id<"boardElements">[]) => void;
  setEditingId: (id: Id<"boardElements"> | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  record: (inverse: () => Promise<void> | void) => void;
};

export function useCanvasInteractions(opts: InteractionOpts) {
  const {
    boardId, elements, tool, color, fontSize, bold, vp, pan,
    selectedIds, setSelectedIds, setEditingId, containerRef, record,
  } = opts;
  const create = useMutation(api.boardElements.create);
  const update = useMutation(api.boardElements.update);
  const removeEl = useMutation(api.boardElements.remove);

  const toWorld = useCallback((p: { x: number; y: number }) => screenToWorld(p, vp), [vp]);
  const screenInCanvas = (e: { clientX: number; clientY: number }) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const panStart = useRef<{ x: number; y: number } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<null | {
    mode: "move" | Corner;
    startWorld: { x: number; y: number };
    items: Array<{ id: Id<"boardElements">; kind: string; orig: Geo }>;
  }>(null);

  const [draft, setDraft] = useState<Draft>(null);
  const [marquee, setMarquee] = useState<Marquee>(null);
  const [live, setLive] = useState<Record<string, Geo>>({});

  const isToggle = (e: React.PointerEvent | { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    e.shiftKey || e.metaKey || e.ctrlKey;

  // --- element pointer-down: select-toggle or start a move ---
  const startMove = (el: El, e: React.PointerEvent) => {
    if (tool !== "select") return; // let it bubble so drawing tools can draw over elements
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    e.stopPropagation();
    if (isToggle(e)) {
      setSelectedIds(
        selectedIds.includes(el._id)
          ? selectedIds.filter((id) => id !== el._id)
          : [...selectedIds, el._id],
      );
      return;
    }
    containerRef.current!.setPointerCapture(e.pointerId);
    const moveIds = selectedIds.includes(el._id) && selectedIds.length > 0 ? selectedIds : [el._id];
    if (!selectedIds.includes(el._id)) setSelectedIds([el._id]);
    const items = moveIds
      .map((id) => elements.find((x) => x._id === id))
      .filter((m): m is El => !!m)
      .map((m) => ({ id: m._id, kind: m.kind, orig: { x: m.x, y: m.y, w: m.w, h: m.h } }));
    dragRef.current = { mode: "move", startWorld: toWorld(screenInCanvas(e)), items };
    setLive(Object.fromEntries(items.map((it) => [it.id, it.orig])));
  };

  const startResize = (el: El, corner: Corner, e: React.PointerEvent) => {
    e.stopPropagation();
    containerRef.current!.setPointerCapture(e.pointerId);
    setSelectedIds([el._id]);
    const orig = { x: el.x, y: el.y, w: el.w, h: el.h };
    dragRef.current = { mode: corner, startWorld: toWorld(screenInCanvas(e)), items: [{ id: el._id, kind: el.kind, orig }] };
    setLive({ [el._id]: orig });
  };

  // --- canvas pointer-down: draw / pan / marquee ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (tool !== "select") {
      containerRef.current!.setPointerCapture(e.pointerId);
      drawStart.current = toWorld(screenInCanvas(e));
      return;
    }
    const target = e.target as HTMLElement;
    const onEmpty = target === e.currentTarget || target.classList.contains("board-svg");
    if (!onEmpty) return; // element's own startMove handles it
    containerRef.current!.setPointerCapture(e.pointerId);
    if (isToggle(e)) {
      marqueeStart.current = screenInCanvas(e);
    } else {
      setSelectedIds([]);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const sp = screenInCanvas(e);
    if (dragRef.current) {
      const w = toWorld(sp); const d = dragRef.current;
      const dx = w.x - d.startWorld.x; const dy = w.y - d.startWorld.y;
      const next: Record<string, Geo> = {};
      for (const it of d.items) {
        const o = it.orig;
        if (d.mode === "move") next[it.id] = { ...o, x: o.x + dx, y: o.y + dy };
        else if (d.mode === "nw") next[it.id] = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
        else if (d.mode === "ne") next[it.id] = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
        else if (d.mode === "sw") next[it.id] = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
        else next[it.id] = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
      }
      setLive(next);
      return;
    }
    if (drawStart.current) {
      if (tool === "note" || tool === "text" || tool === "select") return;
      const w = toWorld(sp); const s = drawStart.current;
      if (tool === "line") setDraft({ kind: "line", x: s.x, y: s.y, w: w.x - s.x, h: w.y - s.y, color });
      else setDraft({ kind: tool, color, ...normalizeRect({ x: s.x, y: s.y, w: w.x - s.x, h: w.y - s.y }) });
      return;
    }
    if (marqueeStart.current) {
      const s = marqueeStart.current;
      setMarquee({ x: Math.min(s.x, sp.x), y: Math.min(s.y, sp.y), w: Math.abs(sp.x - s.x), h: Math.abs(sp.y - s.y) });
      return;
    }
    if (panStart.current) {
      pan(e.clientX - panStart.current.x, e.clientY - panStart.current.y);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    // 1. commit a move/resize
    if (dragRef.current) {
      const d = dragRef.current; dragRef.current = null;
      const liveMap = live;
      const moved = d.items.some((it) => {
        const g = liveMap[it.id];
        return g && (g.x !== it.orig.x || g.y !== it.orig.y || g.w !== it.orig.w || g.h !== it.orig.h);
      });
      const inverses = d.items.map((it) => ({ id: it.id, geo: it.orig }));
      for (const it of d.items) {
        let g = liveMap[it.id] ?? it.orig;
        if (it.kind !== "line") g = normalizeRect(g);
        try { await update({ id: it.id, x: g.x, y: g.y, w: g.w, h: g.h }); } catch { /* gone */ }
      }
      if (moved) record(async () => { for (const inv of inverses) { try { await update({ id: inv.id, ...inv.geo }); } catch { /* gone */ } } });
      setLive({});
      return;
    }
    // 2. commit a marquee selection
    if (marqueeStart.current) {
      marqueeStart.current = null;
      const m = marquee; setMarquee(null);
      if (m && (m.w > THRESH || m.h > THRESH)) {
        const tl = toWorld({ x: m.x, y: m.y });
        const br = toWorld({ x: m.x + m.w, y: m.y + m.h });
        const worldRect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
        const hits = elements.filter((el) => rectsIntersect(worldRect, elementBounds(el))).map((el) => el._id);
        setSelectedIds(Array.from(new Set([...selectedIds, ...hits])));
      }
      return;
    }
    // 3. end a pan
    if (panStart.current) { panStart.current = null; return; }
    // 4. finish a draw -> create
    const s = drawStart.current; drawStart.current = null;
    setDraft(null);
    if (tool === "select" || !s) return;
    const end = toWorld(screenInCanvas(e));
    let newId: Id<"boardElements"> | undefined;
    if (tool === "note") {
      newId = await create({ boardId, kind: "note", x: s.x, y: s.y, w: 160, h: 120, text: "", color, fontSize, bold });
      setEditingId(newId);
    } else if (tool === "text") {
      newId = await create({ boardId, kind: "text", x: s.x, y: s.y, w: 200, h: 40, text: "", color, fontSize, bold });
      setEditingId(newId);
    } else if (tool === "line") {
      newId = await create({ boardId, kind: "line", x: s.x, y: s.y, w: end.x - s.x, h: end.y - s.y, color });
    } else {
      let r = normalizeRect({ x: s.x, y: s.y, w: end.x - s.x, h: end.y - s.y });
      if (r.w < 4 && r.h < 4) r = { x: s.x, y: s.y, w: 120, h: 90 };
      newId = await create({ boardId, kind: tool, x: r.x, y: r.y, w: r.w, h: r.h, color, fontSize, bold });
    }
    if (newId) { const id = newId; record(() => { void removeEl({ id }); }); setSelectedIds([newId]); }
  };

  // --- swatch drop: create a note of `dropColor` at a screen point ---
  const createNoteAt = async (clientX: number, clientY: number, dropColor: string) => {
    const r = containerRef.current!.getBoundingClientRect();
    const w = toWorld({ x: clientX - r.left, y: clientY - r.top });
    const id = await create({ boardId, kind: "note", x: w.x, y: w.y, w: 160, h: 120, text: "", color: dropColor, fontSize, bold });
    record(() => { void removeEl({ id }); });
    setSelectedIds([id]);
    setEditingId(id);
  };

  return { onPointerDown, onPointerMove, onPointerUp, startMove, startResize, draft, marquee, live, createNoteAt };
}
