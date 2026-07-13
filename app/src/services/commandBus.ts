/**
 * Global command bus — thin re-export of @oceanix/commands.
 *
 * @deprecated Import { commands } from "@oceanix/commands" directly.
 *   Kept for backward compatibility with existing code.
 *
 * Usage (legacy):
 *   registerCommand("panel.toggle", () => setPanelVisible(v => !v));
 *   executeCommand("panel.toggle");
 *
 * Usage (preferred):
 *   import { commands } from "@oceanix/commands";
 *   commands.register({ id: "panel.toggle", label: "...", handler: () => ... });
 *   commands.execute("panel.toggle");
 */

import { commands as globalCommands } from "@oceanix/commands";

type CommandFn = (...args: unknown[]) => void;

/** @deprecated Use commands.register() from @oceanix/commands */
export function registerCommand(id: string, fn: CommandFn): void {
  globalCommands.register({ id, label: id, handler: fn });
}

/** @deprecated Use commands.execute() from @oceanix/commands */
export function executeCommand(id: string, ...args: unknown[]): void {
  globalCommands.execute(id, ...args);
}
