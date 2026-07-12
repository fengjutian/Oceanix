import { useState, useEffect, useCallback } from "react";
import { GlassBtn } from "@oceanix/glass";
import { AgentWorkspace } from "@oceanix/agent-workspace";
import { useAgentService } from "../services/agentService";
import { sessionTitle, groupSessionsByDate } from "../services/agentPersistence";
import { useResizable, resizeHandleStyle, RESIZE_CURSORS } from "../hooks/useResizable";
import { loadConfig, saveConfig, DEFAULT_CONFIG, type AgentConfig } from "../services/agentConfig";

// ─── Minimized floating badge ──────────────────────

function MinimizedBadge({
  running, taskCount, onRestore, onClose,
}: {
  running: boolean; taskCount: number; onRestore: () => void; onClose: () => void;
}) {
  return (
    <div onClick={onRestore} title="Restore agent" style={{
      position: "fixed", bottom: 16, right: 16, zIndex: 10001,
      background: "var(--bg-secondary, #252526)", border: "1px solid var(--border-color, #3e3e42)",
      borderRadius: 8, padding: "8px 14px", cursor: "pointer", display: "flex",
      alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      fontSize: 13, color: "var(--text-primary, #ccc)", userSelect: "none",
    }}>
      <span>{running ? "⏳" : "✨"}</span>
      <span>Agent{taskCount > 0 ? ` (${taskCount})` : ""}</span>
      <span onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close agent"
        style={{ marginLeft: 4, opacity: 0.6, cursor: "pointer" }}>✕</span>
    </div>
  );
}

// ─── Sash ──────────────────────────────────────────

function Sash({ onDrag }: { onDrag: (dx: number) => void }) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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
  }, [onDrag]);
  return <div onMouseDown={handleMouseDown} style={{
    width: 4, cursor: "ew-resize", flexShrink: 0,
    background: "var(--border-color, #3e3e42)", transition: "background 0.15s",
  }} />;
}

// ─── Sessions sidebar ──────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  idle: "○", running: "◉", needsInput: "⚠", completed: "✅", failed: "❌",
};

function SessionsSection({
  sessions, activeId, onSwitch, onDelete, onCreate, onPin, onArchive,
}: {
  sessions: import("../services/agentPersistence").AgentSession[];
  activeId: string;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showArchivedLocal, setShowArchivedLocal] = useState(false);
  const groups = groupSessionsByDate(sessions);

  return (
    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 3, padding: "4px 8px" }}>
        <button onClick={onCreate} style={toolbarBtnStyle}>+ New</button>
        <button onClick={onCreate} style={toolbarBtnStyle}>↻ Refresh</button>
      </div>

      {groups.map((group) => {
        if (group.label === "Archived" && !showArchivedLocal) return null;
        return (
          <div key={group.label}>
            <div style={groupLabelStyle}>{group.label}</div>
            {group.sessions.map((s) => {
              const isActive = s.id === activeId;
              return (
                <div key={s.id} onClick={() => onSwitch(s.id)}
                  onMouseEnter={() => setHoverId(s.id)} onMouseLeave={() => setHoverId(null)}
                  style={{
                    padding: "5px 10px", cursor: "pointer", fontSize: 12,
                    color: isActive ? "var(--text-primary, #ccc)" : "var(--text-secondary, #858585)",
                    background: isActive ? "var(--bg-tertiary, #2d2d30)" : "transparent",
                    display: "flex", alignItems: "center", gap: 4,
                    borderLeft: isActive ? "2px solid var(--accent, #007acc)" : "2px solid transparent",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{s.pinned ? "📌" : STATUS_ICONS[s.status]}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sessionTitle(s)}
                  </span>
                  {s.changes && s.changes.files > 0 && s.status !== "running" && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ec9b0", flexShrink: 0 }}
                      title={`${s.changes.files} files (+${s.changes.insertions}, -${s.changes.deletions})`} />
                  )}
                  {hoverId === s.id && (
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <span onClick={(e) => { e.stopPropagation(); onPin(s.id, !s.pinned); }}
                        title={s.pinned ? "Unpin" : "Pin"} style={{ opacity: 0.5, cursor: "pointer", fontSize: 11 }}>
                        {s.pinned ? "📌" : "📍"}
                      </span>
                      {!s.archived && (
                        <span onClick={(e) => { e.stopPropagation(); onArchive(s.id, true); }}
                          title="Archive" style={{ opacity: 0.5, cursor: "pointer", fontSize: 11 }}>📦</span>
                      )}
                      {sessions.length > 1 && (
                        <span onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          title="Delete" style={{ opacity: 0.5, cursor: "pointer", fontSize: 11 }}>✕</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {groups.some((g) => g.label === "Archived" && g.sessions.length > 0) && (
        <div onClick={() => setShowArchivedLocal((v) => !v)} style={archiveToggleStyle}>
          {showArchivedLocal ? "▲ Hide Archived" : "▼ Archived"}
        </div>
      )}
      {sessions.length === 0 && <div style={emptyStyle}>No sessions yet</div>}
    </div>
  );
}

// ─── Customizations panel (left sidebar) ───────────

const CUSTOMIZATION_ITEMS = [
  "Overview", "Agents", "Skills", "Instructions",
  "Hooks", "MCP Servers", "Plugins", "Tools",
];

function CustomizationsSection({
  config, onConfigChange,
}: {
  config: AgentConfig;
  onConfigChange: (c: AgentConfig) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--border-color, #3e3e42)", flexShrink: 0 }}>
      <div style={{ ...sectionHeaderStyle, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}>
        <span>Customizations</span>
        <span style={{ fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "4px 0" }}>
          {CUSTOMIZATION_ITEMS.map((item) => (
            <div key={item} style={customizationItemStyle}>
              {item === "Overview" ? "⚙" : "○"} {item}
            </div>
          ))}

          {/* Inline config controls (Overview) */}
          <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border-color, #3e3e42)", marginTop: 4 }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 6 }}>Model</div>
            <select value={config.model} onChange={(e) => onConfigChange({ ...config, model: e.target.value })}
              style={miniInputStyle}>
              <option value="">Auto</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="claude-sonnet">Claude Sonnet</option>
              <option value="deepseek-v3">DeepSeek V3</option>
            </select>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Steps: {config.maxSteps}</div>
                <input type="range" min={1} max={50} value={config.maxSteps}
                  onChange={(e) => onConfigChange({ ...config, maxSteps: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--accent, #007acc)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Temp: {config.temperature.toFixed(1)}</div>
                <input type="range" min={0} max={2} step={0.1} value={config.temperature}
                  onChange={(e) => onConfigChange({ ...config, temperature: Number(e.target.value) })}
                  style={{ width: "100%", accentColor: "var(--accent, #007acc)" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right sidebar: Changes & Files ────────────────

function RightSidebar({
  activeSession, rightSashX, onRightSashDrag,
}: {
  activeSession?: import("../services/agentPersistence").AgentSession;
  rightSashX: number;
  onRightSashDrag: (dx: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<"changes" | "files">("files");
  const changes = activeSession?.changes;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sash onDrag={onRightSashDrag} />
      <div style={{
        width: rightSashX, flexShrink: 0, display: "flex", flexDirection: "column",
        background: "var(--bg-secondary, #252526)", borderLeft: "none",
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color, #3e3e42)", flexShrink: 0 }}>
          {(["changes", "files"] as const).map((tab) => (
            <div key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, textAlign: "center", padding: "6px 8px", fontSize: 11, cursor: "pointer",
              color: activeTab === tab ? "var(--text-primary, #ccc)" : "var(--text-secondary, #858585)",
              borderBottom: activeTab === tab ? "2px solid var(--accent, #007acc)" : "2px solid transparent",
              fontWeight: activeTab === tab ? 600 : 400,
            }}>
              {tab === "changes" ? "Changes" : "Files"}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {activeTab === "changes" ? (
            <div style={{ padding: 10 }}>
              {changes && changes.files > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 8 }}>
                    📁 {changes.files} file{changes.files > 1 ? "s" : ""} changed
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 13, marginBottom: 12 }}>
                    <span style={{ color: "#4ec9b0", fontWeight: 600 }}>+{changes.insertions}</span>
                    <span style={{ color: "#f44747", fontWeight: 600 }}>-{changes.deletions}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Detailed per-file diff will appear here when the agent reports file-level changes.
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center", padding: "20px 0" }}>
                  No file changes yet.<br />Run the agent to see modifications.
                </div>
              )}
            </div>
          ) : (
            /* Files tab — project tree placeholder */
            <div style={{ padding: "0 4px" }}>
              <div style={{
                fontSize: 12, color: "var(--text-secondary)", padding: "8px 6px",
                textAlign: "center", fontStyle: "italic",
              }}>
                Project files will appear here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────

const toolbarBtnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary, #2d2d30)", color: "var(--text-secondary, #858585)",
  border: "1px solid var(--border-color, #3e3e42)", borderRadius: 3,
  padding: "3px 8px", fontSize: 11, cursor: "pointer", flex: 1, textAlign: "center",
};
const groupLabelStyle: React.CSSProperties = {
  padding: "4px 10px", fontSize: 10, fontWeight: 600,
  color: "var(--text-secondary, #858585)", textTransform: "uppercase", letterSpacing: "0.5px",
};
const archiveToggleStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 11, color: "var(--text-secondary, #858585)",
  cursor: "pointer", textAlign: "center", borderTop: "1px solid var(--border-color, #3e3e42)",
};
const emptyStyle: React.CSSProperties = {
  padding: 12, color: "var(--text-secondary, #858585)", fontSize: 12, textAlign: "center",
};
const sectionHeaderStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 11, fontWeight: 600,
  color: "var(--text-secondary, #858585)", display: "flex",
  alignItems: "center", justifyContent: "space-between",
};
const customizationItemStyle: React.CSSProperties = {
  padding: "3px 14px", fontSize: 12, color: "var(--text-secondary, #858585)", cursor: "pointer",
};
const miniInputStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg-tertiary, #2d2d30)", color: "var(--text-primary, #ccc)",
  border: "1px solid var(--border-color, #3e3e42)", borderRadius: 3,
  padding: "3px 6px", fontSize: 11, outline: "none", cursor: "pointer",
};

// ─── AgentDialog ────────────────────────────────────

interface AgentDialogProps {
  open: boolean;
  onClose: () => void;
  initialTask?: string;
}

export default function AgentDialog({ open, onClose, initialTask }: AgentDialogProps) {
  const {
    sessions, activeSessionId, activeSession, tasks, activeTaskId, setActiveTaskId,
    createSession, switchSession, deleteSession, pinSession, archiveSession,
    input, setInput, execute, running,
  } = useAgentService();

  const vp80w = Math.round(window.innerWidth * 0.8);
  const vp80h = Math.round(window.innerHeight * 0.8);
  const { width, height, isResizing, startResize } = useResizable("agent-dialog-v2", vp80w, vp80h);
  const [isPinned, setIsPinned] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Config (inline in left sidebar)
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  useEffect(() => { setConfig(loadConfig()); }, []);
  const handleConfigChange = useCallback((c: AgentConfig) => {
    setConfig(c);
    saveConfig(c);
  }, []);

  // Sash positions
  const [leftSashX, setLeftSashX] = useState(() => {
    try { const v = localStorage.getItem("oceanix-agent-leftsash"); return v ? clamp(Number(v), 180, 400) : 260; }
    catch { return 260; }
  });
  const [rightSashX, setRightSashX] = useState(() => {
    try { const v = localStorage.getItem("oceanix-agent-rightsash"); return v ? clamp(Number(v), 150, 350) : 200; }
    catch { return 200; }
  });

  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem("oceanix-agent-leftsash", String(leftSashX)); localStorage.setItem("oceanix-agent-rightsash", String(rightSashX)); } catch { /* */ } }, 300);
    return () => clearTimeout(id);
  }, [leftSashX, rightSashX]);

  useEffect(() => { if (open && initialTask) setInput(initialTask); }, [open, initialTask, setInput]);
  useEffect(() => { if (open) setIsMinimized(false); }, [open]);

  const handleExecute = () => execute(input);
  const handleOverlayClick = () => { if (!isPinned) onClose(); };

  if (!open) return null;
  if (isMinimized) return <MinimizedBadge running={running} taskCount={tasks.length} onRestore={() => setIsMinimized(false)} onClose={onClose} />;

  const bodyStyle = isResizing ? { userSelect: "none" as const, cursor: RESIZE_CURSORS.se } : {};
  const sessionTitleText = activeSession ? sessionTitle(activeSession) : "New Session";

  return (
    <div className="glass-overlay" onClick={handleOverlayClick} style={bodyStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "relative", width, height, maxWidth: "80vw", maxHeight: "80vh",
        display: "flex", flexDirection: "column", background: "var(--bg-primary, #1e1e1e)",
        border: "1px solid var(--border-color, #3e3e42)", borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden",
      }}>
        {/* Resize handles */}
        {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((dir) => (
          <div key={dir} onMouseDown={(e) => e.button === 0 && startResize(dir, e)} style={resizeHandleStyle(dir)} />
        ))}

        {/* ── Header bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
          borderBottom: "1px solid var(--border-color, #3e3e42)",
          background: "var(--bg-secondary, #252526)", flexShrink: 0,
        }}>
          <GlassBtn onClick={() => setIsMinimized(true)} title="Minimize"
            style={{ fontSize: 14, padding: "2px 6px", minWidth: "unset" }}>⊟</GlassBtn>
          <GlassBtn onClick={() => setIsPinned((p) => !p)} title={isPinned ? "Unpin" : "Pin"}
            style={{ fontSize: 14, padding: "2px 6px", minWidth: "unset",
              color: isPinned ? "var(--accent, #007acc)" : undefined }}>{isPinned ? "📌" : "📍"}</GlassBtn>

          {/* Session name + project */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #ccc)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {sessionTitleText}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-secondary, #858585)" }}>Oceanix</span>
          </div>

          <GlassBtn onClick={onClose} title="Close" style={{ fontSize: 14, padding: "2px 6px", minWidth: "unset" }}>✕</GlassBtn>
        </div>

        {/* ── Input bar ── */}
        <div style={{
          display: "flex", gap: 6, padding: "8px 12px",
          borderBottom: "1px solid var(--border-color, #3e3e42)",
          background: "var(--bg-secondary, #252526)", flexShrink: 0, alignItems: "center",
        }}>
          {/* Model selector */}
          <select value={config.model} onChange={(e) => handleConfigChange({ ...config, model: e.target.value })}
            style={{
              background: "var(--bg-tertiary, #2d2d30)", color: "var(--text-secondary, #858585)",
              border: "1px solid var(--border-color, #3e3e42)", borderRadius: 4,
              padding: "4px 6px", fontSize: 11, outline: "none", cursor: "pointer", maxWidth: 100,
            }}>
            <option value="">Copilot</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="claude-sonnet">Claude</option>
            <option value="deepseek-v3">DeepSeek</option>
          </select>

          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleExecute(); }}
            placeholder="What's the goal?" disabled={running} autoFocus
            style={{
              flex: 1, background: "var(--bg-tertiary, #2d2d30)", color: "var(--text-primary, #ccc)",
              border: "1px solid var(--border-color, #3e3e42)", borderRadius: 4,
              padding: "7px 10px", fontSize: 13, outline: "none",
            }} />

          <GlassBtn style={{ fontSize: 11, padding: "4px 8px", minWidth: "unset" }}>Add</GlassBtn>
          <GlassBtn style={{ fontSize: 11, padding: "4px 8px", minWidth: "unset" }}>Agent</GlassBtn>
          <GlassBtn accent onClick={handleExecute} disabled={running || !input.trim()}
            style={{ fontSize: 11, padding: "4px 10px", minWidth: 44 }}>
            {running ? "⏳" : "Auto"}
          </GlassBtn>
        </div>

        {/* ── Three-column body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {/* LEFT: Sessions + Customizations */}
          <div style={{
            width: leftSashX, flexShrink: 0, display: "flex", flexDirection: "column",
            background: "var(--bg-secondary, #252526)", borderRight: "none",
          }}>
            <div style={sectionHeaderStyle}>Sessions</div>
            <SessionsSection
              sessions={sessions} activeId={activeSessionId}
              onSwitch={switchSession} onDelete={deleteSession} onCreate={() => createSession()}
              onPin={pinSession} onArchive={archiveSession}
            />
            <CustomizationsSection config={config} onConfigChange={handleConfigChange} />
          </div>
          <Sash onDrag={(dx) => setLeftSashX((x) => clamp(x + dx, 180, 400))} />

          {/* CENTER: Workspace */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
            <AgentWorkspace tasks={tasks} activeTaskId={activeTaskId} onSelectTask={setActiveTaskId} />
          </div>

          {/* RIGHT: Changes / Files */}
          <RightSidebar
            activeSession={activeSession}
            rightSashX={rightSashX}
            onRightSashDrag={(dx) => setRightSashX((x) => clamp(x + dx, 150, 350))}
          />
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
