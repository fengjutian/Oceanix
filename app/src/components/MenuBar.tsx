import { useState, useRef, useEffect, useCallback } from "react";

// ── Menu data ──────────────────────────────────────────

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

// ── Component ──────────────────────────────────────────

interface MenuBarProps {
  menus: Menu[];
}

export default function MenuBar({ menus }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Close menu on Escape
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openMenu]);

  const handleMenuClick = useCallback((label: string) => {
    setOpenMenu((prev) => (prev === label ? null : label));
  }, []);

  return (
    <div ref={menuRef} className="menu-bar">
      {menus.map((menu) => (
        <div key={menu.label} className="menu-bar-item-wrapper">
          <div
            className={`menu-bar-label ${openMenu === menu.label ? "active" : ""}`}
            onClick={() => handleMenuClick(menu.label)}
            onMouseEnter={() => {
              if (openMenu) setOpenMenu(menu.label);
            }}
          >
            {menu.label}
          </div>
          {openMenu === menu.label && (
            <div className="menu-bar-dropdown">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="menu-bar-separator" />
                ) : (
                  <div
                    key={item.label}
                    className="menu-bar-item"
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="menu-bar-shortcut">{item.shortcut}</span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Hook: build VS Code-style menus ─────────────────────

export interface MenuActions {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onCloseEditor: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFind: () => void;
  onReplace: () => void;
  onFindInFiles: () => void;
  onSelectAll: () => void;
  onExpandSelection: () => void;
  onCopyLineUp: () => void;
  onCopyLineDown: () => void;
  onMoveLineUp: () => void;
  onMoveLineDown: () => void;
  onAddCursorAbove: () => void;
  onAddCursorBelow: () => void;
  onSelectAllOccurrences: () => void;
  onQuickOpen: () => void;
  onGoToLine: () => void;
  onGoToSymbol: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToDefinition: () => void;
  onGoToReferences: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFullScreen: () => void;
  onNewTerminal: () => void;
  onKillTerminal: () => void;
  onCommandPalette: () => void;
  onToggleSidebar: () => void;
  onTogglePanel: () => void;
  onToggleTheme: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onSettings: () => void;
}

export function buildMenus(actions: MenuActions, t: (key: string) => string): Menu[] {
  return [
    {
      label: t("menu.file"),
      items: [
        { label: t("menu.file.newFile"), shortcut: "Ctrl+N", action: actions.onNewFile },
        { label: t("menu.file.openFile"), shortcut: "Ctrl+O", action: actions.onOpenFile },
        { label: t("menu.file.openFolder"), shortcut: "Ctrl+K Ctrl+O", action: actions.onOpenFolder },
        { separator: true },
        { label: t("menu.file.save"), shortcut: "Ctrl+S", action: actions.onSave },
        { separator: true },
        { label: t("menu.file.closeEditor"), shortcut: "Ctrl+W", action: actions.onCloseEditor },
      ],
    },
    {
      label: t("menu.edit"),
      items: [
        { label: t("menu.edit.undo"), shortcut: "Ctrl+Z", action: actions.onUndo },
        { label: t("menu.edit.redo"), shortcut: "Ctrl+Shift+Z", action: actions.onRedo },
        { separator: true },
        { label: t("menu.edit.cut"), shortcut: "Ctrl+X", action: actions.onCut },
        { label: t("menu.edit.copy"), shortcut: "Ctrl+C", action: actions.onCopy },
        { label: t("menu.edit.paste"), shortcut: "Ctrl+V", action: actions.onPaste },
        { separator: true },
        { label: t("menu.edit.find"), shortcut: "Ctrl+F", action: actions.onFind },
        { label: t("menu.edit.replace"), shortcut: "Ctrl+H", action: actions.onReplace },
        { separator: true },
        { label: t("menu.edit.findInFiles"), shortcut: "Ctrl+Shift+F", action: actions.onFindInFiles },
      ],
    },
    {
      label: t("menu.selection"),
      items: [
        { label: t("menu.selection.selectAll"), shortcut: "Ctrl+A", action: actions.onSelectAll },
        { label: t("menu.selection.expandSelection"), shortcut: "Alt+Shift+Right", action: actions.onExpandSelection },
        { separator: true },
        { label: t("menu.selection.copyLineUp"), shortcut: "Alt+Shift+Up", action: actions.onCopyLineUp },
        { label: t("menu.selection.copyLineDown"), shortcut: "Alt+Shift+Down", action: actions.onCopyLineDown },
        { label: t("menu.selection.moveLineUp"), shortcut: "Alt+Up", action: actions.onMoveLineUp },
        { label: t("menu.selection.moveLineDown"), shortcut: "Alt+Down", action: actions.onMoveLineDown },
        { separator: true },
        { label: t("menu.selection.addCursorAbove"), shortcut: "Ctrl+Alt+Up", action: actions.onAddCursorAbove },
        { label: t("menu.selection.addCursorBelow"), shortcut: "Ctrl+Alt+Down", action: actions.onAddCursorBelow },
        { separator: true },
        { label: t("menu.selection.selectAllOccurrences"), shortcut: "Ctrl+Shift+L", action: actions.onSelectAllOccurrences },
      ],
    },
    {
      label: t("menu.view"),
      items: [
        { label: t("menu.view.commandPalette"), shortcut: "Ctrl+Shift+P", action: actions.onCommandPalette },
        { separator: true },
        { label: t("menu.view.zoomIn"), shortcut: "Ctrl+=", action: actions.onZoomIn },
        { label: t("menu.view.zoomOut"), shortcut: "Ctrl+-", action: actions.onZoomOut },
        { separator: true },
        { label: t("menu.view.toggleSidebar"), shortcut: "Ctrl+B", action: actions.onToggleSidebar },
        { label: t("menu.view.togglePanel"), shortcut: "Ctrl+J", action: actions.onTogglePanel },
        { label: t("menu.view.splitRight"), shortcut: "Ctrl+\\", action: actions.onSplitRight },
        { label: t("menu.view.splitDown"), shortcut: "Ctrl+K Ctrl+\\", action: actions.onSplitDown },
        { separator: true },
        { label: t("menu.view.toggleTheme"), shortcut: "Ctrl+K Ctrl+T", action: actions.onToggleTheme },
        { label: t("menu.view.fullScreen"), shortcut: "F11", action: actions.onToggleFullScreen },
        { separator: true },
        { label: t("menu.view.settings"), shortcut: "Ctrl+,", action: actions.onSettings },
      ],
    },
    {
      label: t("menu.go"),
      items: [
        { label: t("menu.go.quickOpen"), shortcut: "Ctrl+P", action: actions.onQuickOpen },
        { label: t("menu.go.gotoLine"), shortcut: "Ctrl+G", action: actions.onGoToLine },
        { label: t("menu.go.gotoSymbol"), shortcut: "Ctrl+Shift+O", action: actions.onGoToSymbol },
        { separator: true },
        { label: t("menu.go.back"), shortcut: "Ctrl+Alt+-", action: actions.onGoBack },
        { label: t("menu.go.forward"), shortcut: "Ctrl+Alt+=", action: actions.onGoForward },
        { separator: true },
        { label: t("menu.go.definition"), shortcut: "F12", action: actions.onGoToDefinition },
        { label: t("menu.go.references"), shortcut: "Shift+F12", action: actions.onGoToReferences },
      ],
    },
    {
      label: t("menu.run"),
      items: [
        { label: t("menu.run.task"), shortcut: "", action: actions.onCommandPalette },
        { label: t("menu.run.debug"), shortcut: "F5", action: actions.onCommandPalette },
      ],
    },
    {
      label: t("menu.terminal"),
      items: [
        { label: t("menu.terminal.new"), shortcut: "Ctrl+`", action: actions.onNewTerminal },
        { label: t("menu.terminal.kill"), action: actions.onKillTerminal },
      ],
    },
    {
      label: t("menu.help"),
      items: [
        { label: t("menu.help.about"), action: actions.onCommandPalette },
      ],
    },
  ];
}
