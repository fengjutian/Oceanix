import React from "react";

export interface AgentTask {
  id: string;
  title: string;
  status: "pending" | "running" | "awaiting_confirm" | "completed" | "failed";
  steps: AgentStep[];
}

export interface AgentStep {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  toolCalls?: Array<{ name: string; input: string; output: string }>;
}

interface AgentWorkspaceProps {
  tasks: AgentTask[];
  activeTaskId: string | null;
  onSelectTask: (id: string) => void;
  onApprove?: (taskId: string, stepId: string) => void;
  onReject?: (taskId: string, stepId: string) => void;
}

const STYLES: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    background: "var(--bg-secondary, #252526)",
  },
  taskList: {
    width: 200,
    borderRight: "1px solid var(--border-color, #3e3e42)",
    overflowY: "auto",
    padding: "4px 0",
  },
  taskItem: {
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--text-secondary, #858585)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  taskItemActive: {
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--text-primary, #ccc)",
    background: "var(--bg-tertiary, #2d2d30)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  taskDetail: {
    flex: 1,
    padding: 12,
    overflowY: "auto",
  },
  stepList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  step: {
    padding: "8px 12px",
    borderRadius: 6,
    background: "var(--bg-tertiary, #2d2d30)",
    fontSize: 13,
    borderLeft: "3px solid var(--border-color)",
  },
  stepRunning: {
    borderLeftColor: "var(--accent, #007acc)",
  },
  stepCompleted: {
    borderLeftColor: "#4ec9b0",
  },
  stepFailed: {
    borderLeftColor: "#f44747",
  },
  stepOutput: {
    fontSize: 12,
    color: "var(--text-secondary)",
    fontFamily: "monospace",
    marginTop: 4,
    whiteSpace: "pre-wrap",
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 12,
    color: "var(--text-primary)",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
};

const STATUS_ICONS: Record<string, string> = {
  pending: "○",
  running: "◉",
  awaiting_confirm: "⚠",
  completed: "✅",
  failed: "❌",
};

export function AgentWorkspace({ tasks, activeTaskId, onSelectTask }: AgentWorkspaceProps) {
  const activeTask = tasks.find((t) => t.id === activeTaskId);

  return (
    <div style={STYLES.container}>
      {/* Task list sidebar */}
      <div style={STYLES.taskList}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={task.id === activeTaskId ? STYLES.taskItemActive : STYLES.taskItem}
            onClick={() => onSelectTask(task.id)}
          >
            <span>{STATUS_ICONS[task.status]}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {task.title}
            </span>
          </div>
        ))}
        {tasks.length === 0 && (
          <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>
            No active agent tasks
          </div>
        )}
      </div>

      {/* Task detail */}
      {activeTask ? (
        <div style={STYLES.taskDetail}>
          <div style={STYLES.title}>{activeTask.title}</div>
          <div style={STYLES.stepList}>
            {activeTask.steps.map((step) => (
              <div
                key={step.id}
                style={{
                  ...STYLES.step,
                  ...(step.status === "running" ? STYLES.stepRunning : {}),
                  ...(step.status === "completed" ? STYLES.stepCompleted : {}),
                  ...(step.status === "failed" ? STYLES.stepFailed : {}),
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{STATUS_ICONS[step.status]}</span>
                  <span>{step.description}</span>
                </div>
                {step.output && <div style={STYLES.stepOutput}>{step.output}</div>}
                {step.toolCalls?.map((tc, i) => (
                  <div key={i} style={STYLES.stepOutput}>
                    🔧 {tc.name}: {tc.output}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={STYLES.empty}>Select a task to view details</div>
      )}
    </div>
  );
}
