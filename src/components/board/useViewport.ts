import { useCallback, useState } from "react";
import { screenToWorld, worldToScreen, zoomAt, type Point, type Viewport } from "../../lib/board";

export function useViewport() {
  const [vp, setVp] = useState<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  const pan = useCallback((dx: number, dy: number) => {
    setVp((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
  }, []);
  const zoom = useCallback((cursor: Point, factor: number) => {
    setVp((v) => zoomAt(v, cursor, factor));
  }, []);
  const toWorld = useCallback((p: Point) => screenToWorld(p, vp), [vp]);
  const toScreen = useCallback((p: Point) => worldToScreen(p, vp), [vp]);
  return { vp, pan, zoom, toWorld, toScreen };
}
