/**
 * Global command bus — a lightweight alternative to dispatching synthetic
 * KeyboardEvents (which may not trigger WebView2 event listeners reliably).
 *
 * Usage:
 *   // Register (in App.tsx):
 *   registerCommand("panel.toggle", () => setPanelVisible(v => !v));
 *
 *   // Execute (any component):
 *   executeCommand("panel.toggle");
 */

type CommandFn = (...args: unknown[]) => void;

const bus = new Map<string, CommandFn>();

export function registerCommand(id: string, fn: CommandFn): void {
  bus.set(id, fn);
}

export function executeCommand(id: string, ...args: unknown[]): void {
  const fn = bus.get(id);
  if (fn) {
    fn(...args);
  }
}
