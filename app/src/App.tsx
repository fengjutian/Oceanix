import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import ActivityBar from "./components/ActivityBar";
import EditorTabs, { EditorTab } from "./components/EditorTabs";
import Terminal from "./components/Terminal";
import GitPanel from "./components/GitPanel";
import ProblemsPanel from "./components/ProblemsPanel";
import OutputPanel from "./components/OutputPanel";
import { CommandPalette, Command, filterCommands } from "@oceanix/command-palette";
import { KeybindingRegistry, KeyBinding } from "@oceanix/keybinding";
import { applyTheme, DARK_THEME, LIGHT_THEME } from "@oceanix/theme";
import { loadSession, saveSession, SessionState, getProjectRoot, writeFile } from "./services/api";

const DEFAULT_BINDINGS: KeyBinding[] = [
  { key: "Ctrl+Shift+P", command: "palette.show", label: "Show Command Palette" },
  { key: "Ctrl+P", command: "file.quickOpen", label: "Quick Open File" },
  { key: "Ctrl+S", command: "file.save", label: "Save" },
  { key: "Ctrl+W", command: "tab.close", label: "Close Tab" },
  { key: "Ctrl+O", command: "file.openFolder", label: "Open Folder" },
  { key: "Ctrl+N", command: "file.new", label: "New File" },
  { key: "Ctrl+Shift+F", command: "search.global", label: "Global Search" },
  { key: "Ctrl+G", command: "editor.gotoLine", label: "Go to Line" },
  { key: "Ctrl+B", command: "sidebar.toggle", label: "Toggle Sidebar" },
  { key: "Ctrl+J", command: "panel.toggle", label: "Toggle Panel" },
  { key: "Ctrl+K Ctrl+T", command: "theme.toggle", label: "Toggle Theme" },
];

function App() {
  const [sidebarView, setSidebarView] = useState("explorer");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelTab, setPanelTab] = useState<"terminal" | "problems" | "output">("terminal");
  const [showPalette, setShowPalette] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [projectRoot, setProjectRoot] = useState(".");

  // ─── Tab management ─────────────────────────────────
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback((tab: EditorTab) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === tab.path);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId && next.length > 0) {
        setActiveTabId(next[Math.min(idx, next.length - 1)].id);
      } else if (next.length === 0) {
        setActiveTabId(null);
      }
      return next;
    });
  }, [activeTabId]);

  const updateContent = useCallback((id: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, content, dirty: true } : t))
    );
  }, []);

  const saveTab = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dirty: false } : t))
    );
  }, []);

  // ─── Auto-save ──────────────────────────────────────
  const autoSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSavedContent = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const dirtyTabs = tabs.filter((t) => t.dirty && t.path && !t.path.startsWith("untitled-"));
    for (const tab of dirtyTabs) {
      // Skip if already scheduled or content unchanged from last save
      if (autoSaveTimers.current.has(tab.id)) continue;
      if (lastSavedContent.current.get(tab.path) === tab.content) continue;

      const timer = setTimeout(async () => {
        try {
          await writeFile(tab.path, tab.content);
          lastSavedContent.current.set(tab.path, tab.content);
          saveTab(tab.id);
        } catch {
          // File may not exist yet — skip
        }
        autoSaveTimers.current.delete(tab.id);
      }, 1500); // 1.5s debounce

      autoSaveTimers.current.set(tab.id, timer);
    }

    // Cleanup timers for closed tabs
    for (const [id, timer] of autoSaveTimers.current) {
      if (!dirtyTabs.find((t) => t.id === id)) {
        clearTimeout(timer);
        autoSaveTimers.current.delete(id);
      }
    }
  }, [tabs]);

  // ─── Quick Open ─────────────────────────────────────
  const quickOpenCommands = useMemo<Command[]>(() => [
    {
      id: "theme.toggle",
      label: "Toggle Dark/Light Theme",
      category: "Preferences",
      keybinding: "Ctrl+K Ctrl+T",
      action: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    },
    {
      id: "file.save",
      label: "Save",
      category: "File",
      keybinding: "Ctrl+S",
      action: () => {
        if (!activeTabId) return;
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab && tab.path && !tab.path.startsWith("untitled-")) {
          writeFile(tab.path, tab.content).catch(() => {});
        }
        saveTab(activeTabId);
      },
    },
    {
      id: "file.new",
      label: "New File",
      category: "File",
      keybinding: "Ctrl+N",
      action: () => {
        const id = `untitled-${Date.now()}`;
        openTab({ id, path: id, label: "Untitled", language: "plaintext", content: "", dirty: false });
      },
    },
    {
      id: "tab.close",
      label: "Close Tab",
      category: "Tab",
      keybinding: "Ctrl+W",
      action: () => activeTabId && closeTab(activeTabId),
    },
    {
      id: "sidebar.toggle",
      label: "Toggle Sidebar",
      category: "View",
      keybinding: "Ctrl+B",
      action: () => setSidebarVisible((v) => !v),
    },
    {
      id: "panel.toggle",
      label: "Toggle Panel",
      category: "View",
      keybinding: "Ctrl+J",
      action: () => setPanelVisible((v) => !v),
    },
    {
      id: "editor.gotoLine",
      label: "Go to Line",
      category: "Navigation",
      keybinding: "Ctrl+G",
      action: () => {},
    },
    {
      id: "search.global",
      label: "Global Search",
      category: "Search",
      keybinding: "Ctrl+Shift+F",
      action: () => setSidebarView("search"),
    },
  ], [activeTabId, saveTab, closeTab, openTab]);

  // Always holds the latest commands so the keybinding registry
  // never needs to be rebuilt when command actions change.
  const commandsRef = useRef(quickOpenCommands);
  commandsRef.current = quickOpenCommands;

  // ─── Keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    const registry = new KeybindingRegistry();
    registry.registerMany(DEFAULT_BINDINGS);
    registry.registerCommand("palette.show", () => setShowPalette(true));

    // Route every default binding through a stable handler that
    // reads the latest commands via ref — never stale.
    const handler = (cmdId: string) => {
      const cmd = commandsRef.current.find((c) => c.id === cmdId);
      cmd?.action();
    };
    for (const binding of DEFAULT_BINDINGS) {
      if (binding.command !== "palette.show") {
        registry.registerCommand(binding.command, () => handler(binding.command));
      }
    }

    registry.attach();
    return () => registry.detach();
  }, []); // Empty deps — registry created once, never reattached

  // ─── Theme ──────────────────────────────────────────
  useEffect(() => {
    applyTheme(theme === "dark" ? DARK_THEME : LIGHT_THEME);
  }, [theme]);

  // ─── Session restore ─────────────────────────────────
  useEffect(() => {
    loadSession().then((session) => {
      if (session?.openFiles?.length) {
        const restoredTabs: EditorTab[] = session.openFiles.map((path, i) => ({
          id: `restored-${i}`,
          path,
          label: path.split("/").pop() || path,
          language: "plaintext",
          content: "",
          dirty: false,
        }));
        setTabs(restoredTabs);
        if (session.activeFile) {
          const idx = session.openFiles.indexOf(session.activeFile);
          if (idx >= 0) setActiveTabId(restoredTabs[idx].id);
        }
        if (session.sidebarView) setSidebarView(session.sidebarView);
      }
    });
    // Load project root from backend
    getProjectRoot().then(setProjectRoot).catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      const session: SessionState = {
        openFiles: tabs.map((t) => t.path),
        activeFile: tabs.find((t) => t.id === activeTabId)?.path || null,
        cursorPositions: {},
        layoutSizes: [20, 80],
        sidebarView,
        sidebarVisible,
        panelVisible,
      };
      saveSession(session);
    };
  }, [tabs, activeTabId, sidebarView, sidebarVisible, panelVisible]);

  // ─── Active file info ───────────────────────────────
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="app-container">
      <div className="app-main">
        <ActivityBar activeView={sidebarView} onViewChange={(v) => { setSidebarView(v); setSidebarVisible(true); }} />
        <PanelGroup direction="horizontal">
          {sidebarVisible && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={40}>
                <Sidebar
                  view={sidebarView}
                  onOpenFile={openTab}
                  projectRoot={projectRoot}
                />
              </Panel>
              <PanelResizeHandle className="resize-handle" />
            </>
          )}
          <Panel minSize={30}>
            <PanelGroup direction="vertical">
              <Panel minSize={20}>
                <EditorTabs
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onSelectTab={setActiveTabId}
                  onCloseTab={closeTab}
                  onContentChange={updateContent}
                  onSave={saveTab}
                />
              </Panel>
              {panelVisible && (
                <>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel defaultSize={25} minSize={10} maxSize={50}>
                    <div className="panel-container">
                      <div className="panel-tabs">
                        {(["terminal", "problems", "output"] as const).map((tab) => (
                          <span
                            key={tab}
                            className={`panel-tab ${panelTab === tab ? "active" : ""}`}
                            onClick={() => setPanelTab(tab)}
                            style={{ cursor: "pointer" }}
                          >
                            {tab.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <div className="panel-content">
                        {panelTab === "terminal" && <Terminal id="main" />}
                        {panelTab === "problems" && <ProblemsPanel />}
                        {panelTab === "output" && <OutputPanel />}
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar
        currentLine={1}
        currentColumn={1}
        encoding="UTF-8"
        indentMode="Spaces: 2"
        language={activeTab?.language || "Plain Text"}
        branch="main"
      />

      {showPalette && (
        <CommandPalette
          commands={quickOpenCommands}
          placeholder="Type a command..."
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  );
}

export default App;
