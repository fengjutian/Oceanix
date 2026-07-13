/**
 * Agent Registry — central registry of AI agents.
 *
 * Inspired by VSCode's chatAgents.ts (IChatAgentData + IChatAgentImplementation).
 * The registry maps agent IDs to their metadata and handler implementations.
 * The frontend queries the registry to render agent pickers and route messages.
 */

import type { ChatMessage } from "./chatModel";

// ── Agent definition ──────────────────────────────────

export interface AgentCapabilities {
  /** Agent can read/write files via tools */
  supportsFiles: boolean;
  /** Agent can execute terminal commands */
  supportsTerminal: boolean;
  /** Agent can interact with git */
  supportsGit: boolean;
  /** Agent can search the codebase (RAG) */
  supportsSearch: boolean;
  /** Agent supports image attachments */
  supportsImages: boolean;
  /** Agent can hand off to other agents */
  supportsHandOffs: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  /** If true, this command triggers the agent even without @mention */
  isDefault?: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  /** Icon (codicon name or URL) */
  icon?: string;
  /** Capability flags for UI filtering */
  capabilities: AgentCapabilities;
  /** Slash commands that this agent handles */
  slashCommands: SlashCommand[];
  /** When expression — e.g. "editorLangId == typescript" */
  when?: string;
  /** Whether this is the default agent (used when no @mention) */
  isDefault?: boolean;
  /** Whether this agent is contributed by core (not extension) */
  isCore?: boolean;
}

// ── Agent implementation ──────────────────────────────

export interface AgentImplementation {
  /** Invoke the agent — takes messages and returns a streaming response */
  invoke(
    messages: ChatMessage[],
    options: AgentInvokeOptions,
  ): AsyncGenerator<string, void, void>;
}

export interface AgentInvokeOptions {
  modelId?: string;
  contextFiles?: string[];
  signal?: AbortSignal;
}

// ── Agent instance (definition + implementation) ──────

export interface Agent extends AgentDefinition, AgentImplementation {}

// ── Registry ──────────────────────────────────────────

class AgentRegistryImpl {
  private agents = new Map<string, Agent>();
  private defaultAgentId: string | null = null;

  /** Register an agent. Throws if id is already taken. */
  register(agent: Agent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent '${agent.id}' is already registered`);
    }
    this.agents.set(agent.id, agent);
    if (agent.isDefault) {
      this.defaultAgentId = agent.id;
    }
  }

  /** Unregister an agent. Returns true if it existed. */
  unregister(id: string): boolean {
    const existed = this.agents.delete(id);
    if (existed && this.defaultAgentId === id) {
      // Find next default or clear
      this.defaultAgentId = null;
      for (const agent of this.agents.values()) {
        if (agent.isDefault) {
          this.defaultAgentId = agent.id;
          break;
        }
      }
    }
    return existed;
  }

  /** Get an agent by id */
  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /** List all registered agents */
  list(): Agent[] {
    return Array.from(this.agents.values());
  }

  /** Get the default agent */
  getDefault(): Agent | undefined {
    if (this.defaultAgentId) {
      return this.agents.get(this.defaultAgentId);
    }
    // Fallback to first registered
    const first = this.agents.values().next();
    return first.done ? undefined : first.value;
  }

  /** Route a message to the best matching agent */
  route(message: string): Agent {
    // Check for @agent-mention syntax
    const mentionMatch = message.match(/^@(\S+)\s/);
    if (mentionMatch) {
      const agentId = mentionMatch[1];
      const agent = this.agents.get(agentId);
      if (agent) return agent;
    }
    // Check slash commands
    for (const agent of this.agents.values()) {
      for (const cmd of agent.slashCommands) {
        if (message.startsWith(`/${cmd.name}`)) {
          return agent;
        }
      }
    }
    // Fall back to default
    return this.getDefault()!;
  }
}

/** Singleton agent registry instance */
export const agentRegistry = new AgentRegistryImpl();
