/**
 * Chat data model — shared types for the AI module.
 *
 * Inspired by VSCode's chatModel.ts: canonical message types,
 * session state, and request/response structures.
 */

// ── Message types ─────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Tool name when role === "tool" */
  name?: string;
  /** Links tool result to a tool call */
  toolCallId?: string;
}

// ── Model info (from backend /models endpoint) ────────

export interface ModelInfo {
  id: string;
  display_name: string;
  provider_id: string;
  max_tokens: number;
  supports_streaming: boolean;
  supports_tools: boolean;
  supports_images: boolean;
}

// ── Chat session ──────────────────────────────────────

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
}

export type SessionStatus = "idle" | "running" | "completed" | "failed";

// ── Chat request / response ───────────────────────────

export interface ChatRequest {
  messages: ChatMessage[];
  modelId?: string;
  contextFiles?: string[];
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  modelId: string;
  finishReason: "stop" | "length" | "tool_calls" | "error";
}

// ── Agent types ───────────────────────────────────────

export interface AgentStep {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  toolCalls?: AgentToolCall[];
  output?: string;
}

export interface AgentToolCall {
  name: string;
  input: string;
  output: string;
}

export interface AgentTask {
  id: string;
  title: string;
  status: "running" | "completed" | "failed";
  steps: AgentStep[];
}

// ── Streaming event (matching backend SSE) ────────────

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
