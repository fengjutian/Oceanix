export interface KeyBinding {
  /** Key combo string, e.g. "Ctrl+Shift+P" or chord "Ctrl+K Ctrl+O" */
  key: string;
  /** Command ID to execute */
  command: string;
  /** Optional context: "editor" | "terminal" | "global" */
  when?: string;
  /** Optional human-readable label */
  label?: string;
}

export interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** The main key, normalized: "a", "p", "F12", "Enter", "Tab", etc. */
  key: string;
}

/** Parse a single key combination like "Ctrl+Shift+P" */
export function parseKeyCombo(combo: string): ParsedKey {
  const parts = combo.toLowerCase().split("+");
  const parsed: ParsedKey = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };

  for (const part of parts) {
    switch (part.trim()) {
      case "ctrl": case "control": parsed.ctrl = true; break;
      case "shift": parsed.shift = true; break;
      case "alt": case "option": parsed.alt = true; break;
      case "meta": case "cmd": case "command": parsed.meta = true; break;
      default: parsed.key = part.trim();
    }
  }
  return parsed;
}

/** Format a ParsedKey back to a human-readable string */
export function formatKey(parsed: ParsedKey): string {
  const parts: string[] = [];
  if (parsed.meta) parts.push("Cmd");
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  const displayKey = parsed.key.length === 1
    ? parsed.key.toUpperCase()
    : parsed.key.replace(/^./, c => c.toUpperCase());
  parts.push(displayKey);
  return parts.join("+");
}

/** Check if a keyboard event matches a parsed key combo */
export function matchesEvent(event: KeyboardEvent, parsed: ParsedKey): boolean {
  if (parsed.ctrl !== event.ctrlKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  if (parsed.meta !== event.metaKey) return false;

  const eventKey = event.key.toLowerCase();
  const parsedKey = parsed.key.toLowerCase();

  // Handle special key names
  const aliases: Record<string, string[]> = {
    "escape": ["escape", "esc"],
    "arrowup": ["arrowup", "up"],
    "arrowdown": ["arrowdown", "down"],
    "arrowleft": ["arrowleft", "left"],
    "arrowright": ["arrowright", "right"],
    " ": ["space", "spacebar"],
  };

  for (const [canonical, aliases_] of Object.entries(aliases)) {
    if (parsedKey === canonical || aliases_.includes(parsedKey)) {
      return eventKey === canonical || aliases_.includes(eventKey);
    }
  }

  return eventKey === parsedKey;
}
