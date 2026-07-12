import type { AgentTask } from "@oceanix/agent-workspace";

/**
 * Persisted agent session — one dialog open/close lifecycle containing
 * multiple agent executions (tasks).
 *
 * Pattern inspired by VSCode's Memento-persisted agent session state
 * (IAgentSessionState in agentSessionsModel.ts).
 */
export interface AgentSession {
  id: string;
  title: string;
  createdAt: string; // ISO 8601
  tasks: AgentTask[];
}

const STORAGE_KEY = "oceanix-agent-sessions";
const MAX_SESSIONS = 50;

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(data: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // Storage quota exceeded — silently degrade
  }
}

/**
 * Load all persisted sessions, newest first.
 */
export function loadSessions(): AgentSession[] {
  const raw = readRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s): s is AgentSession =>
          s && typeof s.id === "string" && Array.isArray(s.tasks),
      );
    }
  } catch { /* corrupted data */ }
  return [];
}

/**
 * Save sessions to localStorage. Trims to MAX_SESSIONS, newest first.
 */
export function saveSessions(sessions: AgentSession[]): void {
  const trimmed = sessions.slice(0, MAX_SESSIONS);
  writeRaw(JSON.stringify(trimmed));
}

/**
 * Create a new empty session.
 */
export function createSession(title?: string): AgentSession {
  return {
    id: `session-${Date.now()}`,
    title: title || `Session ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    tasks: [],
  };
}

/**
 * Get the default title for a session based on its first task.
 */
export function sessionTitle(session: AgentSession): string {
  if (session.tasks.length > 0 && session.tasks[0].title) {
    return session.tasks[0].title;
  }
  return session.title;
}
