import type { AgentTask } from "@oceanix/agent-workspace";

/**
 * Agent session status — mirrors VSCode's AgentSessionStatus enum
 * (agentSessionsModel.ts:67).
 */
export type AgentSessionStatus =
  | "idle"        // No tasks yet
  | "running"     // At least one task in progress
  | "completed"   // All tasks completed
  | "failed"      // Last task failed
  | "needsInput"; // Agent requires user input (future)

/**
 * File changes summary for a session — mirrors VSCode's
 * IChatSessionFileChange / getAgentChangesSummary pattern
 * (agentSessionsModel.ts:91-122).
 */
export interface AgentChanges {
  files: number;
  insertions: number;
  deletions: number;
}

/**
 * Persisted agent session.
 *
 * Pattern: VSCode's IAgentSessionData + IAgentSessionState
 * (agentSessionsModel.ts:67-86, 188-192).
 */
export interface AgentSession {
  id: string;
  title: string;
  createdAt: string;  // ISO 8601
  /** Status derived from tasks — computed on save, not stored per-event. */
  status: AgentSessionStatus;
  timing: {
    createdAt: string;
    lastActivityAt?: string;
  };
  /** Pinned sessions appear first in the list. */
  pinned: boolean;
  /** Archived sessions are hidden behind a toggle. */
  archived: boolean;
  /** File changes tracked from agent execution (Feature 4). */
  changes?: AgentChanges;
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

/** Compute session status from its tasks. */
export function deriveStatus(tasks: AgentTask[]): AgentSessionStatus {
  if (tasks.length === 0) return "idle";
  const statuses = tasks.map((t) => t.status);
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "awaiting_confirm")) return "needsInput";
  if (statuses.some((s) => s === "failed")) return "failed";
  return "completed";
}

/** Migrate old-format session data to current format. */
function migrateSession(raw: Record<string, unknown>): AgentSession | null {
  if (!raw || typeof raw.id !== "string" || !Array.isArray(raw.tasks)) return null;

  const tasks = (raw.tasks as unknown[]) as AgentTask[];

  return {
    id: raw.id as string,
    title: (raw.title as string) || "Untitled",
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    status: (raw.status as AgentSessionStatus) || deriveStatus(tasks),
    timing: {
      createdAt: (raw.createdAt as string) || new Date().toISOString(),
      lastActivityAt: (raw.timing as Record<string, string>)?.lastActivityAt
        || (raw.lastActivityAt as string)
        || raw.createdAt as string,
    },
    pinned: Boolean(raw.pinned),
    archived: Boolean(raw.archived),
    changes: raw.changes as AgentChanges | undefined,
    tasks,
  };
}

/**
 * Load all persisted sessions with migration support.
 */
export function loadSessions(): AgentSession[] {
  const raw = readRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated = parsed
        .map((s: unknown) => migrateSession(s as Record<string, unknown>))
        .filter((s): s is AgentSession => s !== null);
      return migrated;
    }
  } catch { /* corrupted data */ }
  return [];
}

/**
 * Save sessions to localStorage. Trims to MAX_SESSIONS.
 */
export function saveSessions(sessions: AgentSession[]): void {
  const trimmed = sessions.slice(0, MAX_SESSIONS);
  writeRaw(JSON.stringify(trimmed));
}

/**
 * Create a new empty session.
 */
export function createSession(title?: string): AgentSession {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now()}`,
    title: title || `Session ${new Date().toLocaleString()}`,
    createdAt: now,
    status: "idle",
    timing: { createdAt: now },
    pinned: false,
    archived: false,
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

/**
 * Sort sessions: pinned first, then by lastActivityAt descending.
 * Pattern: VSCode's AgentSessionsSorter (agentSessionsViewer.ts:1625).
 */
export function sortSessions(sessions: AgentSession[]): AgentSession[] {
  return [...sessions].sort((a, b) => {
    // Pinned sessions first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    // By last activity time, newest first
    const aTime = a.timing.lastActivityAt || a.createdAt;
    const bTime = b.timing.lastActivityAt || b.createdAt;
    return bTime.localeCompare(aTime);
  });
}

/**
 * Group sessions by date for display.
 * Pattern: VSCode's groupSessionsByDate (agentSessionsViewer.ts:1265).
 */
export interface SessionGroup {
  label: string;
  sessions: AgentSession[];
}

export function groupSessionsByDate(sessions: AgentSession[]): SessionGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, AgentSession[]> = {
    "Today": [],
    "Yesterday": [],
    "Last 7 days": [],
    "Older": [],
  };

  // Separate pinned (flat) and archived
  const archived: AgentSession[] = [];
  const pinned: AgentSession[] = [];

  for (const s of sessions) {
    if (s.archived) { archived.push(s); continue; }
    if (s.pinned) { pinned.push(s); continue; }
    const d = new Date(s.timing.lastActivityAt || s.createdAt);
    if (d >= today) groups["Today"].push(s);
    else if (d >= yesterday) groups["Yesterday"].push(s);
    else if (d >= weekAgo) groups["Last 7 days"].push(s);
    else groups["Older"].push(s);
  }

  const result: SessionGroup[] = [];
  const add = (label: string, list: AgentSession[]) => {
    if (list.length > 0) result.push({ label, sessions: list });
  };

  add("Pinned", pinned);
  for (const key of ["Today", "Yesterday", "Last 7 days", "Older"]) {
    add(key, groups[key]);
  }
  add("Archived", archived);

  return result;
}
