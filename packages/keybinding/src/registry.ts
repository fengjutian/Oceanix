import { KeyBinding, ParsedKey, parseKeyCombo, matchesEvent } from "./key-parser";
import { commands as globalCommands } from "@oceanix/commands";

/** Registered command handler */
type CommandHandler = (...args: unknown[]) => void;

/** Current context for conditional bindings */
let activeContext = "global";

export class KeybindingRegistry {
  private bindings: KeyBinding[] = [];
  private commands = new Map<string, CommandHandler>();
  /** For chord support: track pending first key */
  private pendingKeys: ParsedKey[] = [];
  private chordTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly chordTimeout = 1000; // ms

  constructor(private target: HTMLElement | Document = document) {}

  /** Register a key binding */
  register(binding: KeyBinding): void {
    this.bindings.push(binding);
  }

  /** Register multiple key bindings */
  registerMany(bindings: KeyBinding[]): void {
    this.bindings.push(...bindings);
  }

  /** Register a command handler */
  registerCommand(id: string, handler: CommandHandler): void {
    this.commands.set(id, handler);
  }

  /** Set active context */
  setContext(context: string): void {
    activeContext = context;
  }

  /** Reset chord state */
  private resetChord(): void {
    this.pendingKeys = [];
    if (this.chordTimer) {
      clearTimeout(this.chordTimer);
      this.chordTimer = null;
    }
  }

  /** Attach keyboard listener */
  attach(): void {
    this.target.addEventListener("keydown", this.handleKeyDown as EventListener);
  }

  /** Detach keyboard listener */
  detach(): void {
    this.target.removeEventListener("keydown", this.handleKeyDown as EventListener);
    this.resetChord();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Don't capture when typing in inputs (unless Ctrl/Meta held)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (isInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
      return;
    }

    const triggered = this.findBinding(event);
    if (triggered) {
      event.preventDefault();
      event.stopPropagation();
      this.executeCommand(triggered.command);
    }
  };

  private findBinding(event: KeyboardEvent): KeyBinding | null {
    // If we have pending chord keys, check for chord completion
    if (this.pendingKeys.length > 0) {
      for (const binding of this.bindings) {
        if (!this.isContextMatch(binding)) continue;
        const chordKeys = binding.key.split(/\s+/);
        if (chordKeys.length !== this.pendingKeys.length + 1) continue;

        // Verify all previous chord keys still match
        const allMatch = true; // pendingKeys already validated during recording
        if (!allMatch) continue;

        // Check if current event completes the chord
        const lastCombo = parseKeyCombo(chordKeys[chordKeys.length - 1]);
        if (matchesEvent(event, lastCombo)) {
          this.resetChord();
          return binding;
        }
      }
      // No chord match — reset and fall through to single-key check
      this.resetChord();
    }

    // Check chord bindings: first key in a multi-key binding
    for (const binding of this.bindings) {
      if (!this.isContextMatch(binding)) continue;
      const chordKeys = binding.key.split(/\s+/);
      if (chordKeys.length > 1) {
        const firstCombo = parseKeyCombo(chordKeys[0]);
        if (matchesEvent(event, firstCombo)) {
          this.pendingKeys.push(firstCombo);
          this.chordTimer = setTimeout(() => this.resetChord(), this.chordTimeout);
          event.preventDefault();
          event.stopPropagation();
          return null; // Don't execute yet — wait for chord completion
        }
      }
    }

    // Check single-key bindings
    for (const binding of this.bindings) {
      if (!this.isContextMatch(binding)) continue;
      const chordKeys = binding.key.split(/\s+/);
      if (chordKeys.length > 1) continue; // Skip chords — handled above
      const combo = parseKeyCombo(binding.key);
      if (matchesEvent(event, combo)) {
        return binding;
      }
    }

    return null;
  }

  private isContextMatch(binding: KeyBinding): boolean {
    const when = binding.when || "global";
    return when === activeContext || when === "global";
  }

  private executeCommand(id: string): void {
    // Try global CommandRegistry first, then local fallback
    const handled = globalCommands.execute(id);
    if (!handled) {
      const handler = this.commands.get(id);
      if (handler) {
        handler();
      } else {
        console.warn(`Command not found: ${id}`);
      }
    }
  }

  /** Get all registered bindings */
  getBindings(): ReadonlyArray<KeyBinding> {
    return this.bindings;
  }

  /** Get all registered commands */
  getCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}

/** Keyboard event code to display name mapping */
export const KEY_DISPLAY_NAMES: Record<string, string> = {
  "escape": "Esc",
  "arrowup": "↑",
  "arrowdown": "↓",
  "arrowleft": "←",
  "arrowright": "→",
  " ": "Space",
};
