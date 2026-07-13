/**
 * Service abstraction layer for Tauri IPC.
 * React components call these functions — never invoke() directly.
 */

import { invoke } from "@tauri-apps/api/core";

// ─── File I/O ────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  return invoke<string>("file_read", { path });
}

/** Read a file as base64-encoded string (for binary files like images) */
export async function readFileBase64(path: string): Promise<string> {
  return invoke<string>("file_read_base64", { path });
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
  /** AI model identifier (e.g. "deepseek-v4-pro", "gpt-4o-mini") */
  aiModel: string;
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

export async function setProjectRoot(path: string): Promise<string> {
  return invoke("set_cwd", { path });
}

/**
 * Open a new IDE window with the given folder as the project root.
 * Spawns a new Oceanix process with its working directory set to `path`.
 */
export async function openNewWindow(path: string): Promise<void> {
  return invoke("open_new_window", { path });
}

/** Run a shell command and return output (stdout+stderr). */
export async function taskRun(command: string, cwd?: string): Promise<string> {
  return invoke("task_run", { command, cwd });
}

/**
 * Open a native folder picker dialog and return the selected path (or null if cancelled).
 * Uses @tauri-apps/plugin-dialog.
 */
export async function openFolderDialog(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "Open Folder" });
    return selected as string | null;
  } catch (e) {
    console.error("openFolderDialog failed:", e);
    return null;
  }
}

/**
 * Open a native file picker dialog and return the selected path (or null if cancelled).
 */
export async function openFileDialog(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: false, title: "Open File" });
    return selected as string | null;
  } catch (e) {
    console.error("openFileDialog failed:", e);
    return null;
  }
}

// ─── Git ─────────────────────────────────────────────

export async function gitStatus(): Promise<Array<{ path: string; status: string; staged: boolean }>> {
  return invoke("git_status");
}

export interface GitStatusGrouped {
  staged: Array<{ path: string; status: string; staged: boolean }>;
  changes: Array<{ path: string; status: string; staged: boolean }>;
  merge: Array<{ path: string; status: string; staged: boolean }>;
  untracked: Array<{ path: string; status: string; staged: boolean }>;
}

export async function gitStatusGrouped(): Promise<GitStatusGrouped> {
  return invoke("git_status_grouped");
}

export async function gitDiff(path?: string, staged?: boolean): Promise<string> {
  return invoke("git_diff", { path, staged });
}

/** Return the HEAD version of a file */
export async function gitShow(path: string): Promise<string> {
  return invoke("git_show", { path });
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

export async function gitStage(path: string): Promise<void> {
  return invoke("git_stage", { path });
}

export async function gitUnstage(path: string): Promise<void> {
  return invoke("git_unstage", { path });
}

export async function gitPush(branch: string, remote?: string): Promise<void> {
  return invoke("git_push", { branch, remote });
}

export async function gitPull(branch: string, remote?: string): Promise<void> {
  return invoke("git_pull", { branch, remote });
}

export async function gitCreateBranch(name: string): Promise<void> {
  return invoke("git_create_branch", { name });
}

export async function gitSwitchBranch(name: string): Promise<void> {
  return invoke("git_switch_branch", { name });
}

export async function gitDeleteBranch(name: string): Promise<void> {
  return invoke("git_delete_branch", { name });
}

// ─── Git Log ──────────────────────────────────────

export interface GitCommitEntry {
  oid: string;
  shortOid: string;
  message: string;
  author: string;
  email: string;
  time: number;
  timeOffset: number;
}

export async function gitLog(count: number): Promise<GitCommitEntry[]> {
  return invoke("git_log", { count });
}

export async function gitLogFile(path: string, count: number): Promise<GitCommitEntry[]> {
  return invoke("git_log_file", { path, count });
}

export async function gitCommitDetail(oid: string): Promise<{ info: GitCommitEntry; diff: string }> {
  return invoke("git_commit_detail", { oid });
}

// ─── Git Stash ────────────────────────────────────

export interface GitStashEntry {
  index: number;
  message: string;
  oid: string;
}

export async function gitStashSave(message?: string): Promise<void> {
  return invoke("git_stash_save", { message });
}

export async function gitStashList(): Promise<GitStashEntry[]> {
  return invoke("git_stash_list");
}

export async function gitStashPop(index: number): Promise<void> {
  return invoke("git_stash_pop", { index });
}

export async function gitStashApply(index: number): Promise<void> {
  return invoke("git_stash_apply", { index });
}

export async function gitStashDrop(index: number): Promise<void> {
  return invoke("git_stash_drop", { index });
}

// ─── Git Fetch ────────────────────────────────────

export async function gitFetch(remote?: string): Promise<void> {
  return invoke("git_fetch", { remote });
}

// ─── Git Discard ──────────────────────────────────

export async function gitDiscard(path: string): Promise<void> {
  return invoke("git_discard", { path });
}

// ─── Git Reset ────────────────────────────────────

export async function gitReset(oid: string, mode: string): Promise<void> {
  return invoke("git_reset", { oid, mode });
}

// ─── Git Revert ───────────────────────────────────

export async function gitRevert(oid: string): Promise<string> {
  return invoke("git_revert", { oid });
}

// ─── Git Cherry-pick ──────────────────────────────

export async function gitCherryPick(oid: string): Promise<string> {
  return invoke("git_cherry_pick", { oid });
}

// ─── Git Merge ────────────────────────────────────

export async function gitMergeBranch(branch: string): Promise<string> {
  return invoke("git_merge_branch", { branch });
}

// ─── Git Rebase ───────────────────────────────────

export async function gitRebase(onto: string): Promise<void> {
  return invoke("git_rebase", { onto });
}

// ─── Git Tags ─────────────────────────────────────

export interface GitTagEntry {
  name: string;
  oid: string;
}

export async function gitTagList(): Promise<GitTagEntry[]> {
  return invoke("git_tag_list");
}

export async function gitTagCreate(name: string, message?: string): Promise<string> {
  return invoke("git_tag_create", { name, message });
}

export async function gitTagDelete(name: string): Promise<void> {
  return invoke("git_tag_delete", { name });
}

// ─── Git Remote ───────────────────────────────────

export interface GitRemoteEntry {
  name: string;
  url: string;
}

export async function gitRemoteList(): Promise<GitRemoteEntry[]> {
  return invoke("git_remote_list");
}

export async function gitRemoteAdd(name: string, url: string): Promise<void> {
  return invoke("git_remote_add", { name, url });
}

export async function gitRemoteRemove(name: string): Promise<void> {
  return invoke("git_remote_remove", { name });
}

// ─── Git Blame ────────────────────────────────────

export interface GitBlameEntry {
  line: number;
  commitOid: string;
  commitShort: string;
  author: string;
  time: number;
  summary: string;
}

export async function gitBlame(path: string): Promise<GitBlameEntry[]> {
  return invoke("git_blame", { path });
}

// ─── Git Init / Clone ─────────────────────────────

export async function gitInit(path: string): Promise<string> {
  return invoke("git_init", { path });
}

export async function gitClone(url: string, path: string): Promise<string> {
  return invoke("git_clone", { url, path });
}

// ─── Git Config ───────────────────────────────────

export async function gitConfigGet(key: string): Promise<string> {
  return invoke("git_config_get", { key });
}

export async function gitConfigSet(key: string, value: string): Promise<void> {
  return invoke("git_config_set", { key, value });
}

// ─── Git Conflicts ────────────────────────────────

export async function gitHasConflicts(): Promise<boolean> {
  return invoke("git_has_conflicts");
}

export async function gitConflictFiles(): Promise<string[]> {
  return invoke("git_conflict_files");
}

export async function gitResolveConflict(path: string): Promise<void> {
  return invoke("git_resolve_conflict", { path });
}

// ─── LSP ─────────────────────────────────────────────

export async function lspStart(languageId: string, rootPath: string): Promise<string> {
  return invoke("lsp_start", { languageId, rootPath });
}

export async function lspDidOpen(languageId: string, path: string, text: string): Promise<void> {
  return invoke("lsp_did_open", { languageId, path, text });
}

export async function lspDidChange(languageId: string, path: string, version: number, text: string): Promise<void> {
  return invoke("lsp_did_change", { languageId, path, version, text });
}

export async function lspHover(languageId: string, path: string, line: number, character: number): Promise<{ contents: string } | null> {
  return invoke("lsp_hover", { languageId, path, line, character });
}

export async function lspDefinition(languageId: string, path: string, line: number, character: number): Promise<Array<{
  uri: string;
  rangeStartLine: number;
  rangeStartChar: number;
  rangeEndLine: number;
  rangeEndChar: number;
}>> {
  return invoke("lsp_definition", { languageId, path, line, character });
}

export async function lspDiagnostics(languageId: string): Promise<Array<{
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: number;
  message: string;
  source: string;
}>> {
  return invoke("lsp_diagnostics", { languageId });
}

export async function lspRename(
  languageId: string, path: string, line: number, character: number, newName: string
): Promise<Array<{
  uri: string;
  rangeStartLine: number;
  rangeStartChar: number;
  rangeEndLine: number;
  rangeEndChar: number;
  newText: string;
}>> {
  return invoke("lsp_rename", { languageId, path, line, character, newName });
}

export async function lspCompletion(
  languageId: string, path: string, line: number, character: number
): Promise<Array<{
  label: string;
  detail?: string;
  insertText?: string;
  kind?: number;
}>> {
  return invoke("lsp_completion", { languageId, path, line, character });
}

export async function lspReferences(
  languageId: string, path: string, line: number, character: number
): Promise<Array<{
  uri: string;
  rangeStartLine: number;
  rangeStartChar: number;
  rangeEndLine: number;
  rangeEndChar: number;
}>> {
  return invoke("lsp_references", { languageId, path, line, character });
}

export async function lspFormatting(
  languageId: string, path: string, tabSize: number, insertSpaces: boolean
): Promise<Array<{
  uri: string;
  rangeStartLine: number;
  rangeStartChar: number;
  rangeEndLine: number;
  rangeEndChar: number;
  newText: string;
}>> {
  return invoke("lsp_formatting", { languageId, path, tabSize, insertSpaces });
}

export interface LspSymbol {
  name: string;
  kind: number;
  line: number;
  column: number;
  children: LspSymbol[];
}

export async function lspDocumentSymbol(languageId: string, path: string): Promise<LspSymbol[]> {
  return invoke("lsp_document_symbol", { languageId, path });
}

// ─── Plugins ─────────────────────────────────────────

export async function pluginList(): Promise<Array<{
  name: string;
  version: string;
  displayName: string;
  active: boolean;
}>> {
  return invoke("plugin_list");
}

export async function pluginContributions(): Promise<PluginContributions> {
  return invoke("plugin_contributions");
}

export interface PluginContributions {
  commands: Array<{ id: string; label: string; category?: string }>;
  keybindings: Array<{ key: string; command: string; when?: string }>;
  views: Array<{ id: string; label: string; location: string; icon?: string }>;
  themes: Array<{ id: string; label: string; uiTheme: string; path: string }>;
  settings: Array<{ id: string; label: string; type: string; default?: unknown; description?: string }>;
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

// ─── Agent ──────────────────────────────────────────

export interface AgentResult {
  status: "completed" | "error";
  plan?: string[];
  steps_completed?: number;
  result?: string;
  error?: string;
  messages?: Array<{ role: string; content: string }>;
}

export async function agentExecute(params: {
  task: string;
  max_steps?: number;
}): Promise<AgentResult> {
  return invoke("ai_agent_execute", { params });
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

// ─── Conversation History ────────────────────────────

const AI_HTTP = "http://127.0.0.1:11435";

// ─── Agent Streaming (HTTP SSE) ──────────────────────

export type AgentStreamEvent =
  | { type: "status"; status: string }
  | { type: "plan"; steps: string[] }
  | { type: "step"; index: number; description: string; status: string }
  | { type: "tool_call"; tool: string; input: string }
  | { type: "tool_result"; tool: string; output: string }
  | { type: "file_changes"; files: number; insertions: number; deletions: number }
  | { type: "result"; summary: string; plan?: string[]; steps_completed?: number; messages?: Array<{ role: string; content: string }> }
  | { type: "error"; message: string }
  | { type: "done" };

export async function agentExecuteStreaming(
  params: { task: string; maxSteps?: number; contextFiles?: string[] },
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  // Ensure the Python AI sidecar (HTTP on port 11435) is running
  await invoke("ai_ensure_running");

  const response = await fetch(`${AI_HTTP}/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: params.task,
      max_steps: params.maxSteps || 10,
      context_files: params.contextFiles || [],
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Agent stream failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      try {
        const event = JSON.parse(data) as AgentStreamEvent;
        onEvent(event);
      } catch {
        // skip unparseable events
      }
    }
  }
}

// ─── MCP Tools ───────────────────────────────────────

export interface McpToolDef {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; description: string }>;
}

export interface UserToolDef {
  name: string;
  description: string;
  type: "shell" | "python";
  code: string;
  parameters: Array<{ name: string; type: string; description: string }>;
  source: "global" | "project";
  builtin: false;
}

export async function getMcpTools(): Promise<{
  tools: McpToolDef[];
  user_tools: UserToolDef[];
}> {
  await invoke("ai_ensure_running");
  const res = await fetch(`${AI_HTTP}/mcp/tools`);
  if (!res.ok) throw new Error(`Failed to fetch MCP tools: ${res.status}`);
  const data = await res.json();
  return {
    tools: data.tools ?? [],
    user_tools: data.user_tools ?? [],
  };
}

export async function registerUserTool(tool: {
  name: string;
  description: string;
  type: "shell" | "python";
  code: string;
  parameters: Array<{ name: string; type: string; description: string }>;
  scope?: "project" | "global";
}): Promise<UserToolDef> {
  await invoke("ai_ensure_running");
  const res = await fetch(`${AI_HTTP}/mcp/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tool),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Failed to register tool: ${(err as any).detail || res.status}`);
  }
  const data = await res.json();
  return data.tool;
}

export async function removeUserTool(name: string): Promise<void> {
  await invoke("ai_ensure_running");
  const res = await fetch(`${AI_HTTP}/mcp/tools/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Failed to remove tool: ${(err as any).detail || res.status}`);
  }
}

export interface ConvMeta {
  id: string;
  timestamp: string;
  message_count: number;
}

export interface SavedConversation {
  id: string;
  timestamp: string;
  message_count: number;
  messages: Array<{ role: string; content: string }>;
}

export async function listConversations(limit = 20): Promise<ConvMeta[]> {
  const res = await fetch(`${AI_HTTP}/conversations?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
  const data = await res.json();
  return data.conversations ?? [];
}

export async function loadConversation(id: string): Promise<SavedConversation> {
  const res = await fetch(`${AI_HTTP}/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
  return res.json();
}

export async function saveConversation(id: string, messages: Array<{ role: string; content: string }>): Promise<void> {
  const res = await fetch(`${AI_HTTP}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, messages }),
  });
  if (!res.ok) throw new Error(`Failed to save conversation: ${res.status}`);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${AI_HTTP}/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}

// ─── Terminal ────────────────────────────────────────

export async function terminalCreate(shell?: string): Promise<{ id: string; pid: number }> {
  return invoke("terminal_create", { shell });
}

export async function terminalWrite(id: string, data: string): Promise<void> {
  return invoke("terminal_write", { id, data });
}

export async function terminalRead(id: string): Promise<string> {
  return invoke("terminal_read", { id });
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
  wholeWord?: boolean;
  surroundingContext?: number;
}): Promise<{ matches: Array<{ file: string; line: number; column: number; text: string; match_start: number; match_end: number; context_before: Array<[number, string]>; context_after: Array<[number, string]> }>; limit_hit: boolean }> {
  return invoke("search_files", { params });
}

// ─── RAG (Retrieval Augmented Generation) ───────────

const RAG_URL = "http://127.0.0.1:11435";

// ─── Model Discovery ─────────────────────────────────

export interface ModelInfo {
  id: string;
  display_name: string;
  provider_id: string;
  max_tokens: number;
  supports_streaming: boolean;
  supports_tools: boolean;
  supports_images: boolean;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${RAG_URL}/models`);
  if (!res.ok) throw new Error(`Failed to list models: ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

// ─── RAG (Retrieval Augmented Generation) ───────────

export interface RAGResult {
  file: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string;
  score: number;
}

export async function ragSearch(query: string, topK: number = 10): Promise<{ results: RAGResult[]; count: number }> {
  const params = new URLSearchParams({ q: query, top_k: String(topK) });
  const res = await fetch(`${RAG_URL}/rag/search?${params}`);
  if (!res.ok) throw new Error(`RAG search failed: ${res.status}`);
  return res.json();
}

export async function ragRebuild(): Promise<{ chunks: number; files: number; languages: string[] }> {
  const res = await fetch(`${RAG_URL}/rag/rebuild`, { method: "POST" });
  if (!res.ok) throw new Error(`RAG rebuild failed: ${res.status}`);
  return res.json();
}

export async function ragStats(): Promise<{ chunks: number; files: number; languages: string[] }> {
  const res = await fetch(`${RAG_URL}/rag/stats`);
  if (!res.ok) throw new Error(`RAG stats failed: ${res.status}`);
  return res.json();
}
