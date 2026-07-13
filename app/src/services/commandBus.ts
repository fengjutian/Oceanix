/**
 * Global command bus — a lightweight alternative to dispatching synthetic
 * KeyboardEvents (which may not trigger WebView2 event listeners reliably).
 *
 * Also bridges to the global CommandRegistry from @oceanix/commands.
 *
 * Usage:
 *   // Register (in App.tsx):
 *   registerCommand("panel.toggle", () => setPanelVisible(v => !v));
 *
 *   // Execute (any component):
 *   executeCommand("panel.toggle");
 */

import { commands as globalCommands } from "@oceanix/commands";

type CommandFn = (...args: unknown[]) => void;

const bus = new Map<string, CommandFn>();

export function registerCommand(id: string, fn: CommandFn): void {
  bus.set(id, fn);
  // Also register in global CommandRegistry so CommandPalette can see it
  globalCommands.register({ id, label: id, handler: fn });
}

export function executeCommand(id: string, ...args: unknown[]): void {
  // Try local bus first, then global registry
  const fn = bus.get(id);
  if (fn) {
    fn(...args);
  } else {
    globalCommands.execute(id, ...args);
  }
}
