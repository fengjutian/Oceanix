import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import ActivityBar from "./components/ActivityBar";
import EditorTabs, { EditorTab, type EditorTabsHandle } from "./components/EditorTabs";
import Terminal from "./components/Terminal";
import GitPanel from "./components/GitPanel";
import ProblemsPanel from "./components/ProblemsPanel";
import OutputPanel from "./components/OutputPanel";
import SettingsPanel from "./components/SettingsPanel";
import type { editor } from "monaco-editor";
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
  { key: "Shift+Alt+F", command: "editor.format", label: "Format Document" },
  { key: "Ctrl+Shift+V", command: "markdown.preview", label: "Markdown Preview" },
];

function App() {
  const [sidebarView, setSidebarView] = useState("explorer");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelTab, setPanelTab] = useState<"terminal" | "problems" | "output">("terminal");
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [projectRoot, setProjectRoot] = useState(".");
  const [flatFiles, setFlatFiles] = useState<Array<{ path: string; name: string }>>([]);

  const handleFileTreeLoaded = useCallback((files: Array<{ path: string; name: string }>) => {
    setFlatFiles(files);
  }, []);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const editorHandleRef = useRef<EditorTabsHandle | null>(null);
  const splitEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const splitHandleRef = useRef<EditorTabsHandle | null>(null);

  // ─── Tab management ─────────────────────────────────
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitTabs, setSplitTabs] = useState<EditorTab[]>([]);
  const [splitActiveTabId, setSplitActiveTabId] = useState<string | null>(null);
  const [splitVisible, setSplitVisible] = useState(false);
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical">("horizontal");

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
  const quickOpenCommands = useMemo<Command[]>(() => {
    const fileCommands: Command[] = flatFiles.map((f) => ({
      id: `file:${f.path}`,
      label: f.name,
      category: f.path.substring(0, f.path.lastIndexOf("/") + 1) || "Files",
      action: () => {
        const label = f.name;
        const ext = label.split(".").pop() || "";
        const langMap: Record<string, string> = {
          ts: "typescript", tsx: "typescript", rs: "rust",
          json: "json", md: "markdown", css: "css", html: "html",
          toml: "toml", py: "python",
        };
        openTab({
          id: f.path, path: f.path, label,
          language: langMap[ext] || "plaintext",
          content: "", dirty: false,
        });
      },
    }));

    return [
    ...fileCommands,
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
      id: "editor.format",
      label: "Format Document",
      category: "Editor",
      keybinding: "Shift+Alt+F",
      action: () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
      },
    },
    {
      id: "settings.open",
      label: "Open Settings",
      category: "Preferences",
      keybinding: "Ctrl+,",
      action: () => setShowSettings(true),
    },
    {
      id: "markdown.preview",
      label: "Toggle Markdown Preview",
      category: "View",
      keybinding: "Ctrl+Shift+V",
      action: () => editorHandleRef.current?.toggleMarkdownPreview(),
    },
    {
      id: "git.showDiff",
      label: "Show Git Diff",
      category: "Git",
      keybinding: "Ctrl+Shift+D",
      action: () => editorHandleRef.current?.openGitDiff(),
    },
    {
      id: "editor.splitRight",
      label: "Split Editor Right",
      category: "View",
      keybinding: "Ctrl+\\",
      action: () => {
        if (splitVisible && splitDirection === "horizontal") {
          setSplitVisible(false);
        } else {
          setSplitVisible(true);
          setSplitDirection("horizontal");
        }
      },
    },
    {
      id: "editor.splitDown",
      label: "Split Editor Down",
      category: "View",
      keybinding: "Ctrl+K Ctrl+\\",
      action: () => {
        if (splitVisible && splitDirection === "vertical") {
          setSplitVisible(false);
        } else {
          setSplitVisible(true);
          setSplitDirection("vertical");
        }
      },
    },
    {
      id: "search.global",
      label: "Global Search",
      category: "Search",
      keybinding: "Ctrl+Shift+F",
      action: () => setSidebarView("search"),
    },
  ];
}, [activeTabId, saveTab, closeTab, openTab, flatFiles]);

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
                  onFileTreeLoaded={handleFileTreeLoaded}
                />
              </Panel>
              <PanelResizeHandle className="resize-handle" />
            </>
          )}
          <Panel minSize={30}>
            <PanelGroup direction="vertical">
              {/* Editor area — single or split */}
              {splitVisible ? (
                <PanelGroup direction={splitDirection === "horizontal" ? "horizontal" : "vertical"} style={{ flex: "none", height: panelVisible ? undefined : "100%" }}>
                  <Panel defaultSize={50} minSize={20}>
                    <EditorTabs
                      ref={editorHandleRef} tabs={tabs} activeTabId={activeTabId}
                      onSelectTab={setActiveTabId} onCloseTab={closeTab}
                      onContentChange={updateContent} onSave={saveTab}
                      editorRef={editorRef} projectRoot={projectRoot}
                    />
                  </Panel>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel defaultSize={50} minSize={20}>
                    <EditorTabs
                      ref={splitHandleRef} tabs={splitTabs} activeTabId={splitActiveTabId}
                      onSelectTab={setSplitActiveTabId}
                      onCloseTab={(id) => setSplitTabs((prev) => prev.filter((t) => t.id !== id))}
                      onContentChange={(id, content) => setSplitTabs((prev) =>
                        prev.map((t) => (t.id === id ? { ...t, content, dirty: true } : t))
                      )}
                      onSave={(id) => setSplitTabs((prev) =>
                        prev.map((t) => (t.id === id ? { ...t, dirty: false } : t))
                      )}
                      editorRef={splitEditorRef} projectRoot={projectRoot}
                    />
                  </Panel>
                </PanelGroup>
              ) : (
                <Panel minSize={20}>
                  <EditorTabs
                    ref={editorHandleRef} tabs={tabs} activeTabId={activeTabId}
                    onSelectTab={setActiveTabId} onCloseTab={closeTab}
                    onContentChange={updateContent} onSave={saveTab}
                    editorRef={editorRef} projectRoot={projectRoot}
                  />
                </Panel>
              )}
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

      {showSettings && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "var(--bg-primary)", border: "1px solid var(--border-color)",
            borderRadius: 8, width: 480, maxHeight: "80vh", overflow: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
