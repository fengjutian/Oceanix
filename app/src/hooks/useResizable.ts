import { useState, useCallback, useEffect, useRef } from "react";

export type ResizeDirection =
  | "n" | "s" | "e" | "w"
  | "ne" | "nw" | "se" | "sw";

interface ResizeState {
  width: number;
  height: number;
}

interface ResizeDragState {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

const STORAGE_PREFIX = "oceanix-agent-size-";

function loadSize(key: string, defaultW: number, defaultH: number): ResizeState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width || defaultW)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed.height || defaultH)),
      };
    }
  } catch { /* ignore */ }
  return { width: defaultW, height: defaultH };
}

function saveSize(key: string, size: ResizeState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(size));
  } catch { /* ignore quota */ }
}

/**
 * Hook for edge/corner drag-to-resize with localStorage persistence.
 *
 * Pattern inspired by VSCode's Sash — the resizable splitter that separates
 * the AgentSessionsControl sidebar from the chat widget in ChatViewPane.
 */
export function useResizable(
  storageKey: string,
  defaultWidth = 720,
  defaultHeight = 520,
) {
  const [size, setSize] = useState<ResizeState>(() =>
    loadSize(storageKey, defaultWidth, defaultHeight),
  );
  const dragRef = useRef<ResizeDragState | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Persist on size change (debounced via effect)
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    const id = setTimeout(() => saveSize(storageKey, sizeRef.current), 300);
    return () => clearTimeout(id);
  }, [size, storageKey]);

  const startResize = useCallback((direction: ResizeDirection, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: sizeRef.current.width,
      startHeight: sizeRef.current.height,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      let newW = d.startWidth;
      let newH = d.startHeight;

      // Horizontal
      if (d.direction.includes("e")) newW = d.startWidth + dx;
      if (d.direction.includes("w")) newW = d.startWidth - dx;

      // Vertical
      if (d.direction.includes("s")) newH = d.startHeight + dy;
      if (d.direction.includes("n")) newH = d.startHeight - dy;

      newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newW));
      newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, newH));

      setSize({ width: newW, height: newH });
    };

    const onUp = () => {
      dragRef.current = null;
      setIsResizing(false);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  return {
    width: size.width,
    height: size.height,
    isResizing,
    startResize,
  };
}

/** CSS cursor per direction for the resize handles. */
export const RESIZE_CURSORS: Record<ResizeDirection, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

/** Inline style for a resize handle bar. */
export function resizeHandleStyle(dir: ResizeDirection): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    zIndex: 10,
  };
  const size = 6;

  if (dir === "e") return { ...base, top: 0, right: -size / 2, bottom: 0, width: size, cursor: RESIZE_CURSORS.e };
  if (dir === "w") return { ...base, top: 0, left: -size / 2, bottom: 0, width: size, cursor: RESIZE_CURSORS.w };
  if (dir === "s") return { ...base, left: 0, right: 0, bottom: -size / 2, height: size, cursor: RESIZE_CURSORS.s };
  if (dir === "n") return { ...base, left: 0, right: 0, top: -size / 2, height: size, cursor: RESIZE_CURSORS.n };
  // Corners: slightly larger hit area
  const corner = 10;
  if (dir === "se") return { ...base, right: -corner / 2, bottom: -corner / 2, width: corner, height: corner, cursor: RESIZE_CURSORS.se };
  if (dir === "sw") return { ...base, left: -corner / 2, bottom: -corner / 2, width: corner, height: corner, cursor: RESIZE_CURSORS.sw };
  if (dir === "ne") return { ...base, right: -corner / 2, top: -corner / 2, width: corner, height: corner, cursor: RESIZE_CURSORS.ne };
  if (dir === "nw") return { ...base, left: -corner / 2, top: -corner / 2, width: corner, height: corner, cursor: RESIZE_CURSORS.nw };
  return base;
}
