/**
 * Global CommandRegistry — singleton command registration and execution.
 *
 * Pattern: VSCode's ICommandService / CommandsRegistry split, simplified for React.
 * - Commands are registered by id with metadata (label, category, keybinding) and a handler.
 * - Any component can register or execute commands.
 * - CommandPalette consumes getCommands() to populate its list.
 * - KeybindingRegistry delegates to executeCommand() when a binding fires.
 *
 * Usage:
 *   import { commands } from "@oceanix/commands";
 *   commands.register({ id: "sidebar.toggle", label: "Toggle Sidebar", category: "View", handler: () => {...} });
 *   commands.execute("sidebar.toggle");
 */

export interface CommandEntry {
  /** Unique command ID */
  id: string;
  /** Display label for the palette */
  label: string;
  /** Optional category for grouping */
  category?: string;
  /** Default key binding hint (display only) */
  keybinding?: string;
  /** The function to execute */
  handler: (...args: unknown[]) => void;
}

type Listener = () => void;

class CommandRegistry {
  private commands = new Map<string, CommandEntry>();
  private listeners = new Set<Listener>();

  /** Register a command. Overwrites if id already exists. */
  register(entry: CommandEntry): void {
    this.commands.set(entry.id, entry);
    this.notify();
  }

  /** Register many commands at once. */
  registerMany(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.commands.set(entry.id, entry);
    }
    this.notify();
  }

  /** Unregister a command by id. */
  unregister(id: string): boolean {
    const removed = this.commands.delete(id);
    if (removed) this.notify();
    return removed;
  }

  /** Execute a registered command by id. */
  execute(id: string, ...args: unknown[]): boolean {
    const entry = this.commands.get(id);
    if (entry) {
      entry.handler(...args);
      return true;
    }
    console.warn(`Command not found: ${id}`);
    return false;
  }

  /** Get a command entry by id. */
  get(id: string): CommandEntry | undefined {
    return this.commands.get(id);
  }

  /** Get all registered commands (for CommandPalette). */
  getAll(): CommandEntry[] {
    return Array.from(this.commands.values());
  }

  /** Subscribe to registry changes. Returns unsubscribe function. */
  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Global singleton instance */
export const commands = new CommandRegistry();
