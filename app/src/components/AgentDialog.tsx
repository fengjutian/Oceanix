import { useEffect } from "react";
import { GlassDialog, GlassBtn } from "@oceanix/glass";
import { AgentWorkspace } from "@oceanix/agent-workspace";
import { useAgentService } from "../services/agentService";

interface AgentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the task input (e.g. from "Open in Agent" context menu). */
  initialTask?: string;
}

export default function AgentDialog({ open, onClose, initialTask }: AgentDialogProps) {
  const {
    tasks,
    activeTaskId,
    running,
    setActiveTaskId,
    input,
    setInput,
    execute,
  } = useAgentService();

  // Apply initialTask when dialog opens
  useEffect(() => {
    if (open && initialTask) {
      setInput(initialTask);
    }
  }, [open, initialTask, setInput]);

  const handleExecute = () => execute(input);

  return (
    <GlassDialog open={open} onClose={onClose}>
      <div style={{
        width: 640, height: 480, maxHeight: "80vh",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
            ✨ Oceanix Agent
          </span>
          <GlassBtn onClick={onClose}>
            ✕
          </GlassBtn>
        </div>

        {/* Input bar */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 16px",
          borderBottom: "1px solid var(--border-color)",
        }}>
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
              padding: "8px 12px",
              fontSize: 13,
              outline: "none",
            }}
          />
          <GlassBtn
            accent
            onClick={handleExecute}
            disabled={running || !input.trim()}
            style={{ minWidth: 70 }}
          >
            {running ? "⏳" : "Run"}
          </GlassBtn>
        </div>

        {/* Workspace */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <AgentWorkspace
            tasks={tasks}
            activeTaskId={activeTaskId}
            onSelectTask={setActiveTaskId}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
