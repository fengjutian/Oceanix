/**
 * Service abstraction layer for Tauri IPC.
 * React components call these functions — never invoke() directly.
 */

import { invoke } from "@tauri-apps/api/core";

// ─── File I/O ────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  return invoke<string>("file_read", { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke("file_write", { path, content });
}

export async function readDir(path: string): Promise<Array<{ name: string; path: string; isDir: boolean }>> {
  return invoke("file_read_dir", { path });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke("file_exists", { path });
}

export async function createFile(path: string): Promise<void> {
  return invoke("file_create", { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke("file_create_dir", { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke("file_delete", { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke("file_rename", { oldPath, newPath });
}

// ─── Configuration ──────────────────────────────────

export interface EditorSettings {
  theme: "vs-dark" | "vs-light";
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: "off" | "on" | "wordWrapColumn";
  minimap: boolean;
  autoSave: "off" | "afterDelay" | "onFocusChange" | "onWindowChange";
  autoSaveDelay: number;
}

export async function loadSettings(): Promise<EditorSettings> {
  return invoke("settings_load");
}

export async function saveSettings(settings: Partial<EditorSettings>): Promise<void> {
  return invoke("settings_save", { settings });
}

// ─── Session ─────────────────────────────────────────

export interface SessionState {
  openFiles: string[];
  activeFile: string | null;
  cursorPositions: Record<string, { line: number; column: number }>;
  layoutSizes: number[];
  sidebarView: string;
  sidebarVisible: boolean;
  panelVisible: boolean;
}

export async function saveSession(state: SessionState): Promise<void> {
  return invoke("session_save", { state });
}

export async function loadSession(): Promise<SessionState | null> {
  return invoke("session_load");
}

// ─── Recent Projects ─────────────────────────────────

export async function getRecentProjects(): Promise<Array<{ path: string; name: string; lastOpened: string }>> {
  return invoke("recent_projects");
}

export async function getProjectRoot(): Promise<string> {
  return invoke("get_cwd");
}

// ─── Git ─────────────────────────────────────────────

export async function gitStatus(): Promise<Array<{ path: string; status: string }>> {
  return invoke("git_status");
}

export async function gitDiff(path?: string, staged?: boolean): Promise<string> {
  return invoke("git_diff", { path, staged });
}

export async function gitCommit(message: string): Promise<string> {
  return invoke("git_commit", { message });
}

export async function gitBranchName(): Promise<string> {
  return invoke("git_branch_name");
}

export async function gitBranches(): Promise<Array<{ name: string; isHead: boolean }>> {
  return invoke("git_branches");
}

// ─── AI ──────────────────────────────────────────────

export async function aiComplete(params: {
  code: string;
  position: { line: number; column: number };
  language: string;
  filePath: string;
}): Promise<{ insertText: string; range?: { startLine: number; startCol: number; endLine: number; endCol: number } } | null> {
  return invoke("ai_complete", { params });
}

export async function aiChat(params: {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  contextFiles?: string[];
}): Promise<string> {
  return invoke("ai_chat", { params });
}

export async function aiStreamChat(
  params: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  },
  onToken: (token: string) => void,
  onDone: () => void
): Promise<void> {
  // TODO: Replace with Tauri event streaming when implemented
  const full = await invoke<string>("ai_chat", { params });
  // Simulate streaming by chunking
  const words = full.split(/(?<=\s)/g);
  let i = 0;
  const interval = setInterval(() => {
    if (i < words.length) {
      onToken(words[i]);
      i++;
    } else {
      clearInterval(interval);
      onDone();
    }
  }, 20);
}

// ─── Terminal ────────────────────────────────────────

export async function terminalCreate(shell?: string): Promise<string> {
  return invoke("terminal_create", { shell });
}

export async function terminalWrite(id: string, data: string): Promise<void> {
  return invoke("terminal_write", { id, data });
}

export async function terminalResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("terminal_resize", { id, cols, rows });
}

export async function terminalKill(id: string): Promise<void> {
  return invoke("terminal_kill", { id });
}

// ─── Search ──────────────────────────────────────────

export async function searchInFiles(params: {
  query: string;
  path: string;
  include?: string;
  exclude?: string;
  regex?: boolean;
  caseSensitive?: boolean;
}): Promise<Array<{ file: string; line: number; column: number; text: string }>> {
  return invoke("search_files", { params });
}
