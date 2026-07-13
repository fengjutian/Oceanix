/**
 * Global CommandRegistry — singleton command registration and execution.
 *
 * Pattern: VSCode's ICommandService / CommandsRegistry split, simplified for React.
 *
 * Usage:
 *   import { commands } from "../services/commandRegistry";
 *   commands.register({ id: "sidebar.toggle", label: "Toggle Sidebar", category: "View", handler: () => {...} });
 *   commands.execute("sidebar.toggle");
 */

export interface CommandEntry {
  id: string;
  label: string;
  category?: string;
  keybinding?: string;
  handler: (...args: unknown[]) => void;
}

type Listener = () => void;

class CommandRegistry {
  private commands = new Map<string, CommandEntry>();
  private listeners = new Set<Listener>();

  register(entry: CommandEntry): void {
    this.commands.set(entry.id, entry);
    this.notify();
  }

  registerMany(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.commands.set(entry.id, entry);
    }
    this.notify();
  }

  unregister(id: string): boolean {
    const removed = this.commands.delete(id);
    if (removed) this.notify();
    return removed;
  }

  execute(id: string, ...args: unknown[]): boolean {
    const entry = this.commands.get(id);
    if (entry) {
      entry.handler(...args);
      return true;
    }
    console.warn(`Command not found: ${id}`);
    return false;
  }

  get(id: string): CommandEntry | undefined {
    return this.commands.get(id);
  }

  getAll(): CommandEntry[] {
    return Array.from(this.commands.values());
  }

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

export const commands = new CommandRegistry();
