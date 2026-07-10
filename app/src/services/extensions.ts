/**
 * Extension Registry — merges built-in commands/keybindings with plugin contributions.
 *
 * Usage:
 *   const ext = await ExtensionRegistry.load();
 *   ext.commands   → merged Command[]
 *   ext.bindings   → merged KeyBinding[]
 */

import { pluginContributions, type PluginContributions } from "./api";
import type { Command } from "@oceanix/command-palette";
import type { KeyBinding } from "@oceanix/keybinding";

export class ExtensionRegistry {
  commands: Command[] = [];
  bindings: KeyBinding[] = [];

  private constructor() {}

  /** Load plugin contributions and merge with built-in definitions. */
  static async load(builtInCommands: Command[], builtInBindings: KeyBinding[]): Promise<ExtensionRegistry> {
    const reg = new ExtensionRegistry();

    // Start with built-in
    reg.commands = [...builtInCommands];
    reg.bindings = [...builtInBindings];

    try {
      const contribs = await pluginContributions();

      // Merge plugin commands
      for (const cmd of contribs.commands) {
        if (!reg.commands.find((c) => c.id === cmd.id)) {
          reg.commands.push({
            id: cmd.id,
            label: cmd.label,
            category: cmd.category || "Extension",
            action: () => {}, // Plugin provides description only
          });
        }
      }

      // Merge plugin keybindings
      for (const kb of contribs.keybindings) {
        if (!reg.bindings.find((b) => b.key === kb.key && b.command === kb.command)) {
          reg.bindings.push({ key: kb.key, command: kb.command, label: kb.command });
        }
      }
    } catch {
      // No plugins loaded — that's fine
    }

    return reg;
  }
}
