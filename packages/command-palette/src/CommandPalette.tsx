import React, { useState, useEffect, useRef, useCallback } from "react";
import { Command, CommandPaletteProps } from "./types";
import { filterCommands } from "./fuzzy";

const STYLES: Record<string, React.CSSProperties> = {
  overlay: {
    zIndex: 9999,
    paddingTop: "15vh",
  },
  container: {},
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "var(--bg-tertiary, #2d2d30)",
    border: "none",
    borderBottom: "1px solid var(--border-color, #3e3e42)",
    color: "var(--text-primary, #ccc)",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
  },
  list: {
    overflowY: "auto" as const,
    flex: 1,
    padding: "4px 0",
  },
  item: {
    padding: "6px 16px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: "var(--text-primary, #ccc)",
  },
  itemActive: {
    padding: "6px 16px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    background: "var(--accent, #007acc)",
    color: "#fff",
  },
  label: {
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  keybinding: {
    fontSize: 12,
    color: "var(--text-secondary, #858585)",
    marginLeft: 16,
    whiteSpace: "nowrap" as const,
  },
  category: {
    fontSize: 11,
    color: "var(--text-secondary, #858585)",
    padding: "8px 16px 2px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  empty: {
    padding: 24,
    textAlign: "center" as const,
    color: "var(--text-secondary, #858585)",
  },
};

export function CommandPalette({
  commands,
  placeholder = "Type a command...",
  onClose,
  onExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Use fuse.js for better fuzzy search when available, fallback to built-in
  const filtered = filterCommands(commands, query);

  // Group by category
  const grouped = new Map<string, Command[]>();
  for (const cmd of filtered) {
    const cat = cmd.category || "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(cmd);
  }

  const flatList: { type: "category" | "command"; data: string | Command }[] = [];
  for (const [cat, cmds] of grouped) {
    flatList.push({ type: "category", data: cat });
    for (const cmd of cmds) {
      flatList.push({ type: "command", data: cmd });
    }
  }

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const executeCommand = useCallback(
    (cmd: Command) => {
      cmd.action();
      onExecute?.(cmd);
      onClose();
    },
    [onClose, onExecute]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = flatList[selectedIndex];
      if (item && item.type === "command") {
        executeCommand(item.data as Command);
      }
    }
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="glass-overlay" style={STYLES.overlay} onClick={onClose}>
      <div className="glass-panel" style={{
        width: 560,
        maxHeight: 400,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          style={STYLES.input}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div style={STYLES.list} ref={listRef}>
          {flatList.length === 0 ? (
            <div style={STYLES.empty}>No matching commands</div>
          ) : (
            flatList.map((item, i) => {
              if (item.type === "category") {
                return (
                  <div key={`cat-${item.data}`} style={STYLES.category}>
                    {item.data as string}
                  </div>
                );
              }
              const cmd = item.data as Command;
              const isActive = i === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  style={isActive ? STYLES.itemActive : STYLES.item}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => executeCommand(cmd)}
                >
                  <span style={STYLES.label}>{cmd.label}</span>
                  {cmd.keybinding && (
                    <span style={{
                      ...STYLES.keybinding,
                      ...(isActive ? { color: "rgba(255,255,255,0.7)" } : {}),
                    }}>
                      {cmd.keybinding}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
