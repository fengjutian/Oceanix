/**
 * Frontend Tool Service — mirrors the Python ToolService.
 *
 * Fetches tool metadata from the backend and provides a
 * unified view of built-in + user-defined + MCP tools.
 * Used by the ChatPanel to show tool invocations and
 * the AgentSettings to manage user-defined tools.
 */

import { getMcpTools, registerUserTool, removeUserTool } from "./api";
import type { UserToolDef, McpToolDef } from "./api";

// ── Tool model (frontend view of backend ToolDefinition) ──

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  category: string;         // "file" | "search" | "git" | "terminal" | "user"
  source: "builtin" | "user:global" | "user:project" | "mcp";
  requiresConfirmation: boolean;
  parameters: ToolParamInfo[];
}

export interface ToolParamInfo {
  name: string;
  type: string;
  description: string;
}

// ── Tool Service ──────────────────────────────────────

class ToolService {
  private tools = new Map<string, ToolInfo>();
  private userTools = new Map<string, UserToolDef>();
  private loaded = false;

  /** Fetch tool list from backend and populate the cache. */
  async refresh(): Promise<void> {
    const data = await getMcpTools();
    this.tools.clear();
    this.userTools.clear();

    // Built-in tools from MCP definitions
    for (const t of data.tools) {
      this.tools.set(t.name, {
        id: t.name,
        name: t.name,
        description: t.description,
        category: "user", // MCP tools don't report category yet
        source: "builtin",
        requiresConfirmation: t.name === "write_file",
        parameters: t.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
        })),
      });
    }

    // Tool registry tools from the new ToolService
    if (Array.isArray((data as any).tool_registry)) {
      for (const t of (data as any).tool_registry) {
        this.tools.set(t.name, {
          id: t.name,
          name: t.name,
          description: t.description,
          category: t.category || "user",
          source: "builtin",
          requiresConfirmation: t.requires_confirmation || false,
          parameters: (t.parameters || []).map((p: any) => ({
            name: p.name,
            type: p.type,
            description: p.description,
          })),
        });
      }
    }

    // User-defined tools
    for (const t of data.user_tools) {
      this.userTools.set(t.name, t);
      this.tools.set(t.name, {
        id: t.name,
        name: t.name,
        description: t.description,
        category: "user",
        source: t.source === "global" ? "user:global" : "user:project",
        requiresConfirmation: false,
        parameters: t.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
        })),
      });
    }

    this.loaded = true;
  }

  /** List all known tools. */
  list(): ToolInfo[] {
    return Array.from(this.tools.values());
  }

  /** List tools by category. */
  listByCategory(category: string): ToolInfo[] {
    return this.list().filter((t) => t.category === category);
  }

  /** List user-defined tools only. */
  listUserTools(): UserToolDef[] {
    return Array.from(this.userTools.values());
  }

  /** Get a single tool by id. */
  get(id: string): ToolInfo | undefined {
    return this.tools.get(id);
  }

  /** Check if tools have been loaded. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Register a new user-defined tool. */
  async addUserTool(tool: {
    name: string;
    description: string;
    type: "shell" | "python";
    code: string;
    parameters: Array<{ name: string; type: string; description: string }>;
    scope?: "project" | "global";
  }): Promise<UserToolDef> {
    const result = await registerUserTool(tool);
    // Refresh cache
    await this.refresh();
    return result;
  }

  /** Remove a user-defined tool. */
  async removeUserTool(name: string): Promise<void> {
    await removeUserTool(name);
    await this.refresh();
  }
}

/** Singleton tool service instance */
export const toolService = new ToolService();
