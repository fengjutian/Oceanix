import { commands, type CommandEntry } from "@oceanix/commands";

export interface Command {
  /** Unique command ID */
  id: string;
  /** Display label in the palette */
  label: string;
  /** Optional category for grouping */
  category?: string;
  /** Default key binding hint */
  keybinding?: string;
  /** The function to execute */
  handler: (...args: unknown[]) => void;
}

export interface CommandPaletteProps {
  /** If provided, use these commands; if omitted, read from global CommandRegistry */
  commands?: Command[];
  placeholder?: string;
  onClose: () => void;
  onExecute?: (command: Command) => void;
}

/** Adapt a CommandEntry from the global registry to the local Command shape */
export function entryToCommand(entry: CommandEntry): Command {
  return {
    id: entry.id,
    label: entry.label,
    category: entry.category,
    keybinding: entry.keybinding,
    handler: entry.handler,
  };
}

/** Get commands for palette: explicit list or global registry */
export function getCommandsForPalette(explicit?: Command[]): Command[] {
  if (explicit && explicit.length > 0) return explicit;
  return commands.getAll().map(entryToCommand);
}
