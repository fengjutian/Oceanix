import { useState, useReducer, useCallback, useEffect, useRef } from "react";
import type { AgentTask, AgentStep } from "@oceanix/agent-workspace";
import { agentExecuteStreaming } from "./api";
import type { AgentStreamEvent } from "./api";
import {
  type AgentSession,
  loadSessions,
  saveSessions,
  createSession as newSession,
} from "./agentPersistence";

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
  sessions: AgentSession[];
  activeSessionId: string;
  activeTaskId: string | null;
  running: boolean;
}

type AgentAction =
  | { type: "LOAD_SESSIONS"; sessions: AgentSession[] }
  | { type: "ADD_SESSION"; session: AgentSession }
  | { type: "SWITCH_SESSION"; sessionId: string }
  | { type: "DELETE_SESSION"; sessionId: string }
  | { type: "ADD_TASK"; task: AgentTask }
  | { type: "STREAM_EVENT"; taskId: string; event: AgentStreamEvent }
  | { type: "SET_ACTIVE"; taskId: string | null }
  | { type: "TASK_ERROR"; taskId: string; error: string }
  | { type: "SET_RUNNING"; running: boolean };

function updateActiveSession(state: AgentState, updater: (session: AgentSession) => AgentSession): AgentState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === state.activeSessionId ? updater(s) : s,
    ),
  };
}

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "LOAD_SESSIONS":
      return {
        ...state,
        sessions: action.sessions,
        activeSessionId: action.sessions.length > 0
          ? action.sessions[0].id
          : state.activeSessionId,
      };
    case "ADD_SESSION":
      return {
        ...state,
        sessions: [action.session, ...state.sessions],
        activeSessionId: action.session.id,
        activeTaskId: null,
      };
    case "SWITCH_SESSION":
      return {
        ...state,
        activeSessionId: action.sessionId,
        activeTaskId: state.sessions.find((s) => s.id === action.sessionId)?.tasks[0]?.id ?? null,
      };
    case "DELETE_SESSION": {
      const remaining = state.sessions.filter((s) => s.id !== action.sessionId);
      return {
        ...state,
        sessions: remaining,
        activeSessionId: state.activeSessionId === action.sessionId
          ? (remaining[0]?.id ?? state.activeSessionId)
          : state.activeSessionId,
        activeTaskId: state.activeSessionId === action.sessionId
          ? (remaining[0]?.tasks[0]?.id ?? null)
          : state.activeTaskId,
      };
    }
    case "ADD_TASK":
      return updateActiveSession(state, (s) => ({
        ...s,
        tasks: [...s.tasks, action.task],
      }));
    case "STREAM_EVENT":
      return updateActiveSession(state, (s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === action.taskId ? applyStreamEvent(t, action.event) : t,
        ),
      }));
    case "SET_ACTIVE":
      return { ...state, activeTaskId: action.taskId };
    case "TASK_ERROR":
      return updateActiveSession(state, (s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
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
      }));
    case "SET_RUNNING":
      return { ...state, running: action.running };
  }
}

function getActiveSession(state: AgentState): AgentSession | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

// ─── Hook ────────────────────────────────────────────

export function useAgentService() {
  const [input, setInput] = useState("");
  const [state, dispatch] = useReducer(agentReducer, {
    sessions: [],
    activeSessionId: "",
    activeTaskId: null,
    running: false,
  });

  // Load persisted sessions on mount
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const saved = loadSessions();
    if (saved.length > 0) {
      dispatch({ type: "LOAD_SESSIONS", sessions: saved });
    } else {
      // Create a fresh default session
      const session = newSession();
      dispatch({ type: "ADD_SESSION", session });
    }
  }, []);

  // Persist whenever sessions change (skip initial load)
  const sessionsRef = useRef(state.sessions);
  useEffect(() => {
    if (!loadedRef.current) return;
    sessionsRef.current = state.sessions;
    const id = setTimeout(() => saveSessions(sessionsRef.current), 300);
    return () => clearTimeout(id);
  }, [state.sessions]);

  const setActiveTaskId = useCallback(
    (id: string | null) => dispatch({ type: "SET_ACTIVE", taskId: id }),
    [],
  );

  const createSession = useCallback((title?: string) => {
    const session = newSession(title);
    dispatch({ type: "ADD_SESSION", session });
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    dispatch({ type: "SWITCH_SESSION", sessionId });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    dispatch({ type: "DELETE_SESSION", sessionId });
  }, []);

  const execute = useCallback(
    async (task: string) => {
      const trimmed = task.trim();
      if (!trimmed || state.running || !state.activeSessionId) return;

      const taskId = `task-${Date.now()}`;
      const newTask: AgentTask = {
        id: taskId,
        title: trimmed,
        status: "running",
        steps: [],
      };

      dispatch({ type: "ADD_TASK", task: newTask });
      dispatch({ type: "SET_ACTIVE", taskId });
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
    [state.running, state.activeSessionId],
  );

  const activeSession = getActiveSession(state);

  return {
    // Session level
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    activeSession,
    createSession,
    switchSession,
    deleteSession,

    // Task level (from active session)
    tasks: activeSession?.tasks || [],
    activeTaskId: state.activeTaskId,
    setActiveTaskId,

    // Execution
    input,
    setInput,
    execute,
    running: state.running,
  };
}
