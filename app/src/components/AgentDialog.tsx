import { useState, useCallback, useEffect } from "react";
import { GlassDialog, GlassBtn } from "@oceanix/glass";
import { AgentWorkspace } from "@oceanix/agent-workspace";
import type { AgentTask, AgentStep } from "@oceanix/agent-workspace";
import { agentExecuteStreaming } from "../services/api";
import type { AgentStreamEvent } from "../services/api";

interface AgentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the task input (e.g. from "Open in Agent" context menu). */
  initialTask?: string;
}

export default function AgentDialog({ open, onClose, initialTask }: AgentDialogProps) {
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState<string | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentInput, setAgentInput] = useState("");

  // Apply initialTask when dialog opens
  useEffect(() => {
    if (open && initialTask) {
      setAgentInput(initialTask);
    }
  }, [open, initialTask]);

  const handleAgentExecute = useCallback(async () => {
    const task = agentInput.trim();
    if (!task || agentRunning) return;

    const taskId = `task-${Date.now()}`;
    const newTask: AgentTask = {
      id: taskId,
      title: task,
      status: "running",
      steps: [],
    };

    setAgentTasks((prev) => [...prev, newTask]);
    setActiveAgentTaskId(taskId);
    setAgentRunning(true);
    setAgentInput("");

    try {
      await agentExecuteStreaming(
        { task, maxSteps: 10 },
        (event: AgentStreamEvent) => {
          setAgentTasks((prev) =>
            prev.map((t) => {
              if (t.id !== taskId) return t;

              switch (event.type) {
                case "plan": {
                  const steps: AgentStep[] = event.steps.map((desc, i) => ({
                    id: `${taskId}-step-${i}`,
                    description: desc,
                    status: "pending" as const,
                  }));
                  return { ...t, steps };
                }
                case "step": {
                  const steps = [...t.steps];
                  if (event.index >= 0 && event.index < steps.length) {
                    steps[event.index] = {
                      ...steps[event.index],
                      description: event.description || steps[event.index].description,
                      status: event.status === "completed" ? "completed" as const
                        : event.status === "failed" ? "failed" as const
                        : "running" as const,
                    };
                  }
                  return { ...t, steps };
                }
                case "tool_call": {
                  const steps = [...t.steps];
                  const activeIdx = steps.findIndex((s) => s.status === "running");
                  if (activeIdx >= 0) {
                    const s = steps[activeIdx];
                    const toolCalls = [...(s.toolCalls || []), { name: event.tool, input: event.input, output: "" }];
                    steps[activeIdx] = { ...s, toolCalls };
                  }
                  return { ...t, steps };
                }
                case "tool_result": {
                  const steps = [...t.steps];
                  for (let i = steps.length - 1; i >= 0; i--) {
                    const toolCalls = steps[i].toolCalls;
                    if (toolCalls && toolCalls.length > 0) {
                      const last = toolCalls[toolCalls.length - 1];
                      if (last.name === event.tool && !last.output) {
                        const updated = [...toolCalls];
                        updated[updated.length - 1] = { ...last, output: event.output };
                        steps[i] = { ...steps[i], toolCalls: updated };
                        break;
                      }
                    }
                  }
                  return { ...t, steps };
                }
                case "result": {
                  return {
                    ...t,
                    status: "completed" as const,
                    steps: t.steps.map((s, i) => ({
                      ...s,
                      status: (event.steps_completed != null && i < event.steps_completed)
                        ? "completed" as const : s.status,
                      output: i === 0 && event.summary ? event.summary : s.output,
                    })),
                  };
                }
                case "error": {
                  return { ...t, status: "failed" as const };
                }
                default:
                  return t;
              }
            })
          );
        }
      );
    } catch (err) {
      setAgentTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: "failed" as const,
                steps: [{
                  id: `${taskId}-step-0`,
                  description: "Agent execution failed",
                  status: "failed" as const,
                  output: String(err),
                }],
              }
            : t
        )
      );
    } finally {
      setAgentRunning(false);
    }
  }, [agentInput, agentRunning]);

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
            value={agentInput}
            onChange={(e) => setAgentInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAgentExecute(); }}
            placeholder="Describe what the agent should do..."
            disabled={agentRunning}
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
            onClick={handleAgentExecute}
            disabled={agentRunning || !agentInput.trim()}
            style={{ minWidth: 70 }}
          >
            {agentRunning ? "⏳" : "Run"}
          </GlassBtn>
        </div>

        {/* Workspace */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <AgentWorkspace
            tasks={agentTasks}
            activeTaskId={activeAgentTaskId}
            onSelectTask={setActiveAgentTaskId}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
