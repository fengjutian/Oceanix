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
  commands: Command[];
  placeholder?: string;
  onClose: () => void;
  onExecute?: (command: Command) => void;
}
