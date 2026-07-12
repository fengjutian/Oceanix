import { useState, useReducer, useCallback } from "react";
import type { AgentTask, AgentStep } from "@oceanix/agent-workspace";
import { agentExecuteStreaming } from "./api";
import type { AgentStreamEvent } from "./api";

// ─── Pure stream event reducer ──────────────────────
// Applies a single AgentStreamEvent to an AgentTask, returning the updated task.
// Extracted from AgentDialog's inline switch so it can be tested and reused.

export function applyStreamEvent(task: AgentTask, event: AgentStreamEvent): AgentTask {
  switch (event.type) {
    case "plan": {
      const steps: AgentStep[] = event.steps.map((desc, i) => ({
        id: `${task.id}-step-${i}`,
        description: desc,
        status: "pending" as const,
      }));
      return { ...task, steps };
    }
    case "step": {
      const steps = [...task.steps];
      if (event.index >= 0 && event.index < steps.length) {
        steps[event.index] = {
          ...steps[event.index],
          description: event.description || steps[event.index].description,
          status:
            event.status === "completed"
              ? ("completed" as const)
              : event.status === "failed"
                ? ("failed" as const)
                : ("running" as const),
        };
      }
      return { ...task, steps };
    }
    case "tool_call": {
      const steps = [...task.steps];
      const activeIdx = steps.findIndex((s) => s.status === "running");
      if (activeIdx >= 0) {
        const s = steps[activeIdx];
        const toolCalls = [...(s.toolCalls || []), { name: event.tool, input: event.input, output: "" }];
        steps[activeIdx] = { ...s, toolCalls };
      }
      return { ...task, steps };
    }
    case "tool_result": {
      const steps = [...task.steps];
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
      return { ...task, steps };
    }
    case "result": {
      return {
        ...task,
        status: "completed" as const,
        steps: task.steps.map((s, i) => ({
          ...s,
          status:
            event.steps_completed != null && i < event.steps_completed
              ? ("completed" as const)
              : s.status,
          output: i === 0 && event.summary ? event.summary : s.output,
        })),
      };
    }
    case "error": {
      return { ...task, status: "failed" as const };
    }
    default:
      return task;
  }
}

// ─── Internal reducer for useAgentService ────────────

interface AgentState {
  tasks: AgentTask[];
  activeTaskId: string | null;
  running: boolean;
}

type AgentAction =
  | { type: "ADD_TASK"; task: AgentTask }
  | { type: "STREAM_EVENT"; taskId: string; event: AgentStreamEvent }
  | { type: "SET_ACTIVE"; taskId: string | null }
  | { type: "TASK_ERROR"; taskId: string; error: string }
  | { type: "SET_RUNNING"; running: boolean };

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "ADD_TASK":
      return {
        ...state,
        tasks: [...state.tasks, action.task],
        activeTaskId: action.task.id,
      };
    case "STREAM_EVENT":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId ? applyStreamEvent(t, action.event) : t,
        ),
      };
    case "SET_ACTIVE":
      return { ...state, activeTaskId: action.taskId };
    case "TASK_ERROR":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.taskId
            ? {
                ...t,
                status: "failed" as const,
                steps: [
                  {
                    id: `${action.taskId}-step-0`,
                    description: "Agent execution failed",
                    status: "failed" as const,
                    output: action.error,
                  },
                ],
              }
            : t,
        ),
      };
    case "SET_RUNNING":
      return { ...state, running: action.running };
  }
}

// ─── Hook ────────────────────────────────────────────

export function useAgentService() {
  const [input, setInput] = useState("");
  const [state, dispatch] = useReducer(agentReducer, {
    tasks: [],
    activeTaskId: null,
    running: false,
  });

  const setActiveTaskId = useCallback(
    (id: string | null) => dispatch({ type: "SET_ACTIVE", taskId: id }),
    [],
  );

  const execute = useCallback(
    async (task: string) => {
      const trimmed = task.trim();
      if (!trimmed || state.running) return;

      const taskId = `task-${Date.now()}`;
      const newTask: AgentTask = {
        id: taskId,
        title: trimmed,
        status: "running",
        steps: [],
      };

      dispatch({ type: "ADD_TASK", task: newTask });
      dispatch({ type: "SET_RUNNING", running: true });

      try {
        await agentExecuteStreaming(
          { task: trimmed, maxSteps: 10 },
          (event: AgentStreamEvent) => {
            dispatch({ type: "STREAM_EVENT", taskId, event });
          },
        );
      } catch (err) {
        dispatch({ type: "TASK_ERROR", taskId, error: String(err) });
      } finally {
        dispatch({ type: "SET_RUNNING", running: false });
      }
    },
    [state.running],
  );

  return {
    tasks: state.tasks,
    activeTaskId: state.activeTaskId,
    running: state.running,
    setActiveTaskId,
    input,
    setInput,
    execute,
  };
}
