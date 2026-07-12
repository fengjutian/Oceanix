import { useState, useEffect, useCallback } from "react";
import { GlassBtn } from "@oceanix/glass";
import { AgentWorkspace } from "@oceanix/agent-workspace";
import { useAgentService } from "../services/agentService";
import { sessionTitle } from "../services/agentPersistence";
import { useResizable, resizeHandleStyle, RESIZE_CURSORS } from "../hooks/useResizable";

// ─── Minimized floating badge ──────────────────────

function MinimizedBadge({
  running,
  taskCount,
  onRestore,
  onClose,
}: {
  running: boolean;
  taskCount: number;
  onRestore: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onRestore}
      title="Restore agent"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 10001,
        background: "var(--bg-secondary, #252526)",
        border: "1px solid var(--border-color, #3e3e42)",
        borderRadius: 8,
        padding: "8px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        fontSize: 13,
        color: "var(--text-primary, #ccc)",
        userSelect: "none",
      }}
    >
      <span>{running ? "⏳" : "✨"}</span>
      <span>Agent{taskCount > 0 ? ` (${taskCount})` : ""}</span>
      <span
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close agent"
        style={{ marginLeft: 4, opacity: 0.6, cursor: "pointer" }}
      >
        ✕
      </span>
    </div>
  );
}

// ─── Resizable sash between sidebar and workspace ──

function Sash({
  onDrag,
}: {
  onDrag: (dx: number) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const onMove = (ev: MouseEvent) => onDrag(ev.clientX - startX);
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onDrag],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: 4,
        cursor: "ew-resize",
        flexShrink: 0,
        background: "var(--border-color, #3e3e42)",
        transition: "background 0.15s",
      }}
    />
  );
}

// ─── Sessions sidebar ──────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◉",
  awaiting_confirm: "⚠",
  completed: "✅",
  failed: "❌",
};

function sessionStatus(session: import("../services/agentPersistence").AgentSession): string {
  if (session.tasks.length === 0) return "○";
  const statuses = session.tasks.map((t) => t.status);
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "completed")) return "completed";
  return "pending";
}

function SessionsSidebar({
  sessions,
  activeId,
  onSwitch,
  onDelete,
  onCreate,
  width,
}: {
  sessions: import("../services/agentPersistence").AgentSession[];
  activeId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  width: number;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
        borderRight: "none", // sash handles the border
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* New Session button */}
      <div style={{ padding: "6px 8px" }}>
        <button
          onClick={onCreate}
          style={{
            width: "100%",
            background: "var(--bg-tertiary, #2d2d30)",
            color: "var(--text-secondary, #858585)",
            border: "1px solid var(--border-color, #3e3e42)",
            borderRadius: 4,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          + New Session
        </button>
      </div>

      {/* Session list */}
      {sessions.map((s) => {
        const isActive = s.id === activeId;
        const status = sessionStatus(s);
        return (
          <div
            key={s.id}
            onClick={() => onSwitch(s.id)}
            onMouseEnter={() => setHoverId(s.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
              color: isActive
                ? "var(--text-primary, #ccc)"
                : "var(--text-secondary, #858585)",
              background: isActive
                ? "var(--bg-tertiary, #2d2d30)"
                : "transparent",
              display: "flex",
              alignItems: "center",
              gap: 6,
              borderLeft: isActive
                ? "2px solid var(--accent, #007acc)"
                : "2px solid transparent",
            }}
          >
            <span>{STATUS_ICONS[status] || "○"}</span>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sessionTitle(s)}
            </span>
            {hoverId === s.id && sessions.length > 1 && (
              <span
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                title="Delete session"
                style={{ opacity: 0.5, cursor: "pointer", flexShrink: 0 }}
              >
                ✕
              </span>
            )}
          </div>
        );
      })}

      {sessions.length === 0 && (
        <div
          style={{
            padding: 12,
            color: "var(--text-secondary, #858585)",
            fontSize: 12,
          }}
        >
          No sessions yet
        </div>
      )}
    </div>
  );
}

// ─── AgentDialog ────────────────────────────────────

interface AgentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the task input (e.g. from "Open in Agent" context menu). */
  initialTask?: string;
}

export default function AgentDialog({ open, onClose, initialTask }: AgentDialogProps) {
  const {
    sessions,
    activeSessionId,
    tasks,
    activeTaskId,
    setActiveTaskId,
    createSession,
    switchSession,
    deleteSession,
    input,
    setInput,
    execute,
    running,
  } = useAgentService();

  const { width, height, isResizing, startResize } = useResizable("agent-dialog");
  const [isPinned, setIsPinned] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sashX, setSashX] = useState(() => {
    try {
      const raw = localStorage.getItem("oceanix-agent-sash");
      return raw ? Math.max(120, Math.min(400, Number(raw))) : 200;
    } catch {
      return 200;
    }
  });

  // Persist sash width
  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem("oceanix-agent-sash", String(sashX)); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(id);
  }, [sashX]);

  // Apply initialTask when dialog opens
  useEffect(() => {
    if (open && initialTask) {
      setInput(initialTask);
    }
  }, [open, initialTask, setInput]);

  // Reset minimized state when opened from outside
  useEffect(() => {
    if (open) setIsMinimized(false);
  }, [open]);

  const handleExecute = () => execute(input);
  const handleOverlayClick = () => {
    if (!isPinned) onClose();
  };
  const handleSashDrag = useCallback((dx: number) => {
    setSashX((x) => Math.max(120, Math.min(400, x + dx)));
  }, []);

  if (!open) return null;

  // Minimized: show floating badge
  if (isMinimized) {
    return (
      <MinimizedBadge
        running={running}
        taskCount={tasks.length}
        onRestore={() => setIsMinimized(false)}
        onClose={onClose}
      />
    );
  }

  // Prevent text selection while resizing
  const bodyStyle = isResizing
    ? { userSelect: "none" as const, cursor: RESIZE_CURSORS.se }
    : {};

  return (
    <div
      className="glass-overlay"
      onClick={handleOverlayClick}
      style={bodyStyle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width,
          height,
          maxWidth: "95vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-primary, #1e1e1e)",
          border: "1px solid var(--border-color, #3e3e42)",
          borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* ── Resize handles (8 directions) ── */}
        {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((dir) => (
          <div
            key={dir}
            onMouseDown={(e) => e.button === 0 && startResize(dir, e)}
            style={resizeHandleStyle(dir)}
          />
        ))}

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border-color, #3e3e42)",
            background: "var(--bg-secondary, #252526)",
            flexShrink: 0,
          }}
        >
          {/* Minimize */}
          <GlassBtn
            onClick={() => setIsMinimized(true)}
            title="Minimize"
            style={{ fontSize: 14, padding: "2px 6px", minWidth: "unset" }}
          >
            ⊟
          </GlassBtn>

          {/* Pin */}
          <GlassBtn
            onClick={() => setIsPinned((p) => !p)}
            title={isPinned ? "Unpin" : "Pin (keep open)"}
            style={{
              fontSize: 14,
              padding: "2px 6px",
              minWidth: "unset",
              color: isPinned ? "var(--accent, #007acc)" : undefined,
            }}
          >
            {isPinned ? "📌" : "📍"}
          </GlassBtn>

          {/* Title */}
          <span
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary, #ccc)",
              textAlign: "center",
            }}
          >
            ✨ Oceanix Agent
          </span>

          {/* Close */}
          <GlassBtn onClick={onClose} title="Close" style={{ fontSize: 14, padding: "2px 6px", minWidth: "unset" }}>
            ✕
          </GlassBtn>
        </div>

        {/* ── Input bar ── */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border-color, #3e3e42)",
            background: "var(--bg-secondary, #252526)",
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleExecute(); }}
            placeholder="Describe what the agent should do..."
            disabled={running}
            autoFocus
            style={{
              flex: 1,
              background: "var(--bg-tertiary, #2d2d30)",
              color: "var(--text-primary, #ccc)",
              border: "1px solid var(--border-color, #3e3e42)",
              borderRadius: 4,
              padding: "7px 10px",
              fontSize: 13,
              outline: "none",
            }}
          />
          <GlassBtn
            accent
            onClick={handleExecute}
            disabled={running || !input.trim()}
            style={{ minWidth: 60 }}
          >
            {running ? "⏳" : "Run"}
          </GlassBtn>
        </div>

        {/* ── Body: Sessions sidebar + Sash + Workspace ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          <SessionsSidebar
            sessions={sessions}
            activeId={activeSessionId}
            onSwitch={switchSession}
            onDelete={deleteSession}
            onCreate={() => createSession()}
            width={sashX}
          />
          <Sash onDrag={handleSashDrag} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <AgentWorkspace
              tasks={tasks}
              activeTaskId={activeTaskId}
              onSelectTask={setActiveTaskId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
