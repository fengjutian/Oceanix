import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import ActivityBar from "./components/ActivityBar";
import EditorTabs, { EditorTab, type EditorTabsHandle } from "./components/EditorTabs";
import Terminal from "./components/Terminal";
import TerminalPanel from "./components/TerminalPanel";
import GitPanel from "./components/GitPanel";
import ProblemsPanel from "./components/ProblemsPanel";
import DebugPanel from "./components/DebugPanel";
import OutputPanel from "./components/OutputPanel";
import SettingsPanel from "./components/SettingsPanel";
import SearchPanel from "./components/SearchPanel";
import ChatPanel from "./components/ChatPanel";
import FileExplorer from "./components/FileExplorer";
import AgentDialog from "./components/AgentDialog";
import type { editor } from "monaco-editor";
import { CommandPalette, type Command } from "@oceanix/command-palette";
import MenuBar, { buildMenus, MenuActions } from "./components/MenuBar";
import { useLocale } from "./i18n/LocaleContext";
import { KeybindingRegistry, KeyBinding } from "@oceanix/keybinding";
import { applyTheme, DARK_THEME, LIGHT_THEME } from "@oceanix/theme";
import { loadSession, saveSession, SessionState, getProjectRoot, writeFile, setProjectRoot, openFolderDialog, openFileDialog, readFile, readFileBase64, openNewWindow, initConfiguration, gitBranchName, gitShow, taskRun } from "./services/api";
import { getConfigurationService } from "./services/configuration";
import { commands } from "./services/commandRegistry";
import { viewContainers } from "./services/viewContainerRegistry";
import { useAgentOpener } from "./services/agentOpener";
import { GlassDialog, GlassBtn } from "@oceanix/glass";
import { FolderOpen, Search, GitBranch, Bot, Database, Sparkles } from "lucide-react";
import { NotificationToast } from "./services/notificationService";
import { lifecycle } from "./services/lifecycleService";

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
  { key: "Shift+F12", command: "editor.goToReferences", label: "Go to References" },
  { key: "F9", command: "editor.toggleBreakpoint", label: "Toggle Breakpoint" },
  { key: "", command: "agent.newSession", label: "Agent: New Session" },
];

function App() {
  const { t, locale, setLocale } = useLocale();
  const [sidebarView, setSidebarView] = useState("explorer");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelTab, setPanelTab] = useState<"terminal" | "problems" | "output" | "debug">("terminal");
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const agentOpener = useAgentOpener();
  const agentOpenerRef = useRef(agentOpener);
  agentOpenerRef.current = agentOpener;
  const [selectionContext, setSelectionContext] = useState<{ code: string; file: string; language: string } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [projectRoot, setProjectRootState] = useState(".");
  const [fileChoicePath, setFileChoicePath] = useState<string | null>(null);
  const [folderChoicePath, setFolderChoicePath] = useState<string | null>(null);
  const [flatFiles, setFlatFiles] = useState<Array<{ path: string; name: string }>>([]);
  // Cursor position for status bar
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);
  // Editor settings — use VSCode-style ConfigurationService (memoized accessor)
  const configService = getConfigurationService();
  const getEditorSetting = useCallback(<T,>(key: string) => configService.getValue<T>(key), [configService]);
  // Git branch for status bar
  const [gitBranch, setGitBranch] = useState("main");

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

  const openTab = useCallback((tab: EditorTab, target?: "split") => {
    if (target === "split") {
      setSplitTabs((prev) => {
        const existing = prev.find((t) => t.path === tab.path);
        if (existing) {
          setSplitActiveTabId(existing.id);
          return prev;
        }
        return [...prev, tab];
      });
      setSplitActiveTabId(tab.id);
      setSplitVisible(true);
      return;
    }
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === tab.path);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
  }, []); // splitDirection not used

  // ─── File open choice dialog ─────────────────────
  const handleFileSelect = useCallback((path: string) => {
    setFileChoicePath(path);
  }, []);

  const handleOpenLocal = useCallback(async () => {
    if (!fileChoicePath) return;
    const path = fileChoicePath;
    setFileChoicePath(null);
        const label = path.split(/[/\\]/).pop() || path;
    const ext = label.split(".").pop()?.toLowerCase() || "";

    // Image files: read as base64 data URI
    const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff", "avif"]);
    if (IMG_EXTS.has(ext)) {
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
        webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
        avif: "image/avif",
      };
      try {
        const b64 = await readFileBase64(path);
        openTab({ id: path, path, label, language: "image", content: `data:${mimeMap[ext]};base64,${b64}`, dirty: false });
        return;
      } catch { /* fall through */ }
    }

    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      rs: "rust", json: "json", md: "markdown", css: "css", html: "html",
      py: "python", java: "java", go: "go", sql: "sql", scss: "scss", less: "less",
      vue: "html",
    };
    let content = "";
    try { content = await readFile(path); } catch { content = `// Could not read: ${path}`; }
    openTab({ id: path, path, label, language: langMap[ext] || "plaintext", content, dirty: false });
  }, [fileChoicePath, openTab]);

  const handleOpenInNewPage = useCallback(async () => {
    if (!fileChoicePath) return;
    const path = fileChoicePath;
    setFileChoicePath(null);
    const label = path.split(/[/\\]/).pop() || path;
    const ext = label.split(".").pop()?.toLowerCase() || "";

    // Image files: read as base64 data URI
    const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff", "avif"]);
    if (IMG_EXTS.has(ext)) {
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
        webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
        avif: "image/avif",
      };
      try {
        const b64 = await readFileBase64(path);
        openTab({ id: path, path, label, language: "image", content: `data:${mimeMap[ext]};base64,${b64}`, dirty: false }, "split");
        return;
      } catch { /* fall through */ }
    }

    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      rs: "rust", json: "json", md: "markdown", css: "css", html: "html",
      py: "python", java: "java", go: "go", sql: "sql", scss: "scss", less: "less",
      vue: "html",
    };
    let content = "";
    try { content = await readFile(path); } catch { content = `// Could not read: ${path}`; }
    openTab({ id: path, path, label, language: langMap[ext] || "plaintext", content, dirty: false }, "split");
  }, [fileChoicePath, openTab]);

  // ─── Folder open choice handlers ─────────────────
  const handleOpenFolderLocal = useCallback(() => {
    if (!folderChoicePath) return;
    const folder = folderChoicePath;
    setFolderChoicePath(null);
    setProjectRootState(folder);
    setProjectRoot(folder).catch(() => {});
  }, [folderChoicePath]);

  const handleOpenFolderInNewPage = useCallback(() => {
    if (!folderChoicePath) return;
    const folder = folderChoicePath;
    setFolderChoicePath(null);
    openNewWindow(folder).catch(() => {});
  }, [folderChoicePath]);

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
    const autoSave = configService.getValue<string>("editor.autoSave");
    if (autoSave === "off") return;
    const dirtyTabs = tabs.filter((t) => t.dirty && t.path && !t.path.startsWith("untitled-"));
    for (const tab of dirtyTabs) {
      if (autoSaveTimers.current.has(tab.id)) continue;
      if (lastSavedContent.current.get(tab.path) === tab.content) continue;

      const timer = setTimeout(async () => {
        try {
          await writeFile(tab.path, tab.content);
          lastSavedContent.current.set(tab.path, tab.content);
          saveTab(tab.id);
        } catch {
        }
        autoSaveTimers.current.delete(tab.id);
      }, configService.getValue<number>("editor.autoSaveDelay") ?? 1500);

      autoSaveTimers.current.set(tab.id, timer);
    }

    for (const [id, timer] of autoSaveTimers.current) {
      if (!dirtyTabs.find((t) => t.id === id)) {
        clearTimeout(timer);
        autoSaveTimers.current.delete(id);
      }
    }
  }, [tabs]);

  // ─── Global Command Registry + Keyboard Shortcuts ──
  // Ref-based state accessor so command handlers always see latest values
  const stateRef = useRef({
    activeTabId, tabs, saveTab, closeTab, openTab, splitVisible, splitDirection,
    setSidebarVisible, setPanelVisible, setTheme, setShowSettings, setSidebarView,
    setSplitVisible, setSplitDirection, projectRoot,
  });
  stateRef.current = {
    activeTabId, tabs, saveTab, closeTab, openTab, splitVisible, splitDirection,
    setSidebarVisible, setPanelVisible, setTheme, setShowSettings, setSidebarView,
    setSplitVisible, setSplitDirection, projectRoot,
  };

  // Register all commands into the global CommandRegistry (VSCode ICommandService pattern).
  // Handlers read latest state via stateRef — no need to re-register on state changes.
  useEffect(() => {
    commands.registerMany([
      {
        id: "palette.show", label: "Show Command Palette", category: "View",
        keybinding: "Ctrl+Shift+P",
        handler: () => setShowPalette(true),
      },
      {
        id: "theme.toggle", label: "Toggle Dark/Light Theme", category: "Preferences",
        keybinding: "Ctrl+K Ctrl+T",
        handler: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      },
      {
        id: "file.save", label: "Save", category: "File", keybinding: "Ctrl+S",
        handler: () => {
          const s = stateRef.current;
          if (!s.activeTabId) return;
          const tab = s.tabs.find((t) => t.id === s.activeTabId);
          if (tab && tab.path && !tab.path.startsWith("untitled-")) {
            writeFile(tab.path, tab.content).catch(() => {});
          }
          s.saveTab(s.activeTabId);
        },
      },
      {
        id: "file.new", label: "New File", category: "File", keybinding: "Ctrl+N",
        handler: () => {
          const id = `untitled-${Date.now()}`;
          stateRef.current.openTab({ id, path: id, label: "Untitled", language: "plaintext", content: "", dirty: false });
        },
      },
      {
        id: "file.openFolder", label: "Open Folder", category: "File", keybinding: "Ctrl+O",
        handler: () => {
          openFolderDialog().then((folder) => {
            if (folder) setFolderChoicePath(folder);
          });
        },
      },
      {
        id: "file.openFile", label: "Open File", category: "File",
        handler: () => {
          openFileDialog().then((file) => {
            if (file) setFileChoicePath(file);
          });
        },
      },
      {
        id: "tab.close", label: "Close Tab", category: "Tab", keybinding: "Ctrl+W",
        handler: () => {
          const s = stateRef.current;
          if (s.activeTabId) s.closeTab(s.activeTabId);
        },
      },
      {
        id: "sidebar.toggle", label: "Toggle Sidebar", category: "View", keybinding: "Ctrl+B",
        handler: () => setSidebarVisible((v) => !v),
      },
      {
        id: "panel.toggle", label: "Toggle Panel", category: "View", keybinding: "Ctrl+J",
        handler: () => setPanelVisible((v) => !v),
      },
      {
        id: "settings.open", label: "Open Settings", category: "Preferences", keybinding: "Ctrl+,",
        handler: () => setShowSettings(true),
      },
      {
        id: "editor.gotoLine", label: "Go to Line", category: "Navigation", keybinding: "Ctrl+G",
        handler: () => editorRef.current?.getAction("editor.action.gotoLine")?.run(),
      },
      {
        id: "editor.format", label: "Format Document", category: "Editor", keybinding: "Shift+Alt+F",
        handler: () => editorRef.current?.getAction("editor.action.formatDocument")?.run(),
      },
      {
        id: "editor.goToReferences", label: "Go to References", category: "Navigation", keybinding: "Shift+F12",
        handler: () => editorRef.current?.getAction("editor.action.goToReferences")?.run(),
      },
      {
        id: "editor.toggleBreakpoint", label: "Toggle Breakpoint", category: "Debug", keybinding: "F9",
        handler: () => editorHandleRef.current?.toggleBreakpoint(),
      },
      {
        id: "markdown.preview", label: "Toggle Markdown Preview", category: "View", keybinding: "Ctrl+Shift+V",
        handler: () => editorHandleRef.current?.toggleMarkdownPreview(),
      },
      {
        id: "git.showDiff", label: "Show Git Diff", category: "Git", keybinding: "Ctrl+Shift+D",
        handler: async () => {
          const s = stateRef.current;
          if (!s.activeTabId) return;
          const tab = s.tabs.find((t) => t.id === s.activeTabId);
          if (!tab || tab.path.startsWith("untitled-")) return;
          try {
            const original = await gitShow(tab.path);
            editorHandleRef.current?.openGitDiff(original);
          } catch {
            editorHandleRef.current?.openGitDiff("");
          }
        },
      },
      {
        id: "git.toggleBlame", label: "Toggle Git Blame Annotations", category: "Git",
        handler: () => editorHandleRef.current?.toggleBlame(),
      },
      {
        id: "editor.splitRight", label: "Split Editor Right", category: "View", keybinding: "Ctrl+\\",
        handler: () => {
          const s = stateRef.current;
          if (s.splitVisible && s.splitDirection === "horizontal") {
            s.setSplitVisible(false);
          } else {
            s.setSplitVisible(true);
            s.setSplitDirection("horizontal");
          }
        },
      },
      {
        id: "editor.splitDown", label: "Split Editor Down", category: "View", keybinding: "Ctrl+K Ctrl+\\",
        handler: () => {
          const s = stateRef.current;
          if (s.splitVisible && s.splitDirection === "vertical") {
            s.setSplitVisible(false);
          } else {
            s.setSplitVisible(true);
            s.setSplitDirection("vertical");
          }
        },
      },
      {
        id: "search.global", label: "Global Search", category: "Search", keybinding: "Ctrl+Shift+F",
        handler: () => setSidebarView("search"),
      },
      {
        id: "task.run", label: "Run Task...", category: "Task",
        handler: () => {
          const cmd = window.prompt("Enter shell command:");
          if (cmd) {
            import("./components/OutputPanel").then((m) => {
              m.emitOutput(`> ${cmd}`, "info");
              setPanelVisible(true);
              taskRun(cmd, stateRef.current.projectRoot).then((out) => {
                m.emitOutput(out, "stdout");
              }).catch((e) => {
                m.emitOutput(String(e), "stderr");
              });
            });
          }
        },
      },
      {
        id: "agent.newSession", label: "Agent: New Session", category: "Agent",
        handler: () => agentOpenerRef.current.open(),
      },
    ]);
  }, []); // Register once — handlers use refs/state setters which are stable

  // ─── Command palette integration ──────────────────
  // Bridge: sync global CommandRegistry entries → @oceanix/command-palette Command[]
  const [paletteCommands, setPaletteCommands] = useState<Command[]>(() =>
    commands.getAll().map((e) => ({ id: e.id, label: e.label, category: e.category, keybinding: e.keybinding, handler: e.handler }))
  );
  useEffect(() => {
    const unsub = commands.onDidChange(() => {
      setPaletteCommands(
        commands.getAll().map((e) => ({ id: e.id, label: e.label, category: e.category, keybinding: e.keybinding, handler: e.handler }))
      );
    });
    return unsub;
  }, []);

  // ─── Keyboard shortcuts (VSCode KeybindingRegistry) ──
  // KeybindingRegistry stores key→command-id mappings locally;
  // when a key fires, it delegates to the global CommandRegistry.
  useEffect(() => {
    const registry = new KeybindingRegistry();
    registry.registerMany(DEFAULT_BINDINGS);

    // Bridge: every binding delegates to the global CommandRegistry
    for (const binding of DEFAULT_BINDINGS) {
      registry.registerCommand(binding.command, () => {
        commands.execute(binding.command);
      });
    }

    registry.attach();
    return () => registry.detach();
  }, []);
  useEffect(() => {
    applyTheme(theme === "dark" ? DARK_THEME : LIGHT_THEME);
  }, [theme]);

  // ─── ViewContainer Registration (VSCode ViewContainers pattern) ──
  useEffect(() => {
    viewContainers.registerMany([
      { id: "explorer", name: "Explorer", icon: FolderOpen, component: FileExplorer, location: "sidebar", order: 0 },
      { id: "search", name: "Search", icon: Search, component: SearchPanel, location: "sidebar", order: 1 },
      { id: "git", name: "Source Control", icon: GitBranch, component: GitPanel, location: "sidebar", order: 2 },
      { id: "ai", name: "AI Chat", icon: Bot, component: ChatPanel, location: "sidebar", order: 3 },
      { id: "agent", name: "Agent", icon: Sparkles, component: (() => null) as any, location: "sidebar", order: 4, action: () => agentOpener.open() },
      { id: "rag", name: "RAG Search", icon: Database, component: (() => null) as any, location: "sidebar", order: 5 },
    ]);
  }, []);

  // ─── Load settings & git branch ────────────────────
  useEffect(() => {
    initConfiguration().catch(() => {});
    gitBranchName().then(setGitBranch).catch(() => {});
  }, []);

  // ─── Session restore ──────────────────────────────
  useEffect(() => {
    loadSession().then((session) => {
      if (session?.openFiles?.length) {
        const restoredTabs: EditorTab[] = session.openFiles.map((path, i) => ({
          id: `restored-${i}`,
          path,
          label: path.split(/[/\\]/).pop() || path,
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
    getProjectRoot().then(setProjectRootState).catch(() => {});
    // Mark app as ready (VSCode LifecyclePhase pattern)
    lifecycle.phase = "ready";
  }, []);

  useEffect(() => {
    return () => {
      const session: SessionState = {
        openFiles: tabs.map((t) => t.path),
        activeFile: tabs.find((t) => t.id === activeTabId)?.path || null,
        cursorPositions: { [activeTab?.path ?? ""]: { line: cursorLine, column: cursorColumn } },
        layoutSizes: [20, 80],
        sidebarView,
        sidebarVisible,
        panelVisible,
      };
      saveSession(session);
    };
  }, [tabs, activeTabId, sidebarView, sidebarVisible, panelVisible, cursorLine, cursorColumn]);

  // ─── Active file info ───────────────────────────────
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const menuActions = useMemo<MenuActions>(() => ({
    onNewFile: () => {
      const id = `untitled-${Date.now()}`;
      openTab({ id, path: id, label: "Untitled", language: "plaintext", content: "", dirty: false });
    },
    onOpenFile: () => setShowPalette(true),
    onOpenFolder: () => {
      openFolderDialog().then((folder) => {
        if (folder) setFolderChoicePath(folder);
      });
    },
    onSave: () => {
      if (!activeTabId) return;
      const tab = tabs.find((t) => t.id === activeTabId);
      if (tab && tab.path && !tab.path.startsWith("untitled-")) {
        writeFile(tab.path, tab.content).catch(() => {});
        saveTab(activeTabId);
      }
    },
    onCloseEditor: () => activeTabId && closeTab(activeTabId),
    onUndo: () => editorRef.current?.trigger("keyboard", "undo", null),
    onRedo: () => editorRef.current?.trigger("keyboard", "redo", null),
    onCut: () => editorRef.current?.trigger("keyboard", "editor.action.clipboardCutAction", null),
    onCopy: () => editorRef.current?.trigger("keyboard", "editor.action.clipboardCopyAction", null),
    onPaste: () => editorRef.current?.trigger("keyboard", "editor.action.clipboardPasteAction", null),
    onFind: () => editorRef.current?.trigger("keyboard", "actions.find", null),
    onReplace: () => editorRef.current?.trigger("keyboard", "editor.action.startFindReplaceAction", null),
    onFindInFiles: () => setSidebarView("search"),
    onSelectAll: () => editorRef.current?.trigger("keyboard", "editor.action.selectAll", null),
    onExpandSelection: () => editorRef.current?.trigger("keyboard", "editor.action.smartSelect.expand", null),
    onCopyLineUp: () => editorRef.current?.trigger("keyboard", "editor.action.copyLinesUpAction", null),
    onCopyLineDown: () => editorRef.current?.trigger("keyboard", "editor.action.copyLinesDownAction", null),
    onMoveLineUp: () => editorRef.current?.trigger("keyboard", "editor.action.moveLinesUpAction", null),
    onMoveLineDown: () => editorRef.current?.trigger("keyboard", "editor.action.moveLinesDownAction", null),
    onAddCursorAbove: () => editorRef.current?.trigger("keyboard", "editor.action.insertCursorAbove", null),
    onAddCursorBelow: () => editorRef.current?.trigger("keyboard", "editor.action.insertCursorBelow", null),
    onSelectAllOccurrences: () => editorRef.current?.trigger("keyboard", "editor.action.selectHighlights", null),
    onAskOceanix: () => {
      const ed = editorRef.current;
      if (!ed) return;
      const selection = ed.getSelection();
      if (!selection || selection.isEmpty()) return;
      const model = ed.getModel();
      if (!model) return;
      const code = model.getValueInRange(selection);
      const file = activeTab?.path ?? "";
      const language = activeTab?.language ?? "";
      setSelectionContext({ code, file, language });
      setSidebarView("ai");
      setSidebarVisible(true);
      // Clear after ChatPanel consumes it
      setTimeout(() => setSelectionContext(null), 100);
    },
    onQuickOpen: () => setShowPalette(true),
    onGoToLine: () => editorRef.current?.trigger("keyboard", "editor.action.gotoLine", null),
    onGoToSymbol: () => editorRef.current?.trigger("keyboard", "editor.action.gotoNextSymbolFromResult", null),
    onGoBack: () => editorRef.current?.trigger("keyboard", "editor.action.goBack", null),
    onGoForward: () => editorRef.current?.trigger("keyboard", "editor.action.goForward", null),
    onGoToDefinition: () => editorRef.current?.trigger("keyboard", "editor.action.revealDefinition", null),
    onGoToReferences: () => editorRef.current?.trigger("keyboard", "editor.action.goToReferences", null),
    onZoomIn: () => editorRef.current?.trigger("keyboard", "editor.action.fontZoomIn", null),
    onZoomOut: () => editorRef.current?.trigger("keyboard", "editor.action.fontZoomOut", null),
    onToggleFullScreen: () => {
      // Tauri fullscreen — use document fullscreen as fallback
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    onNewTerminal: () => { setPanelVisible(true); setPanelTab("terminal"); },
    onKillTerminal: () => setPanelVisible(false),
    onCommandPalette: () => setShowPalette(true),
    onToggleSidebar: () => setSidebarVisible((v) => !v),
    onTogglePanel: () => setPanelVisible((v) => !v),
    onToggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    onSplitRight: () => {
      if (splitVisible && splitDirection === "horizontal") setSplitVisible(false);
      else { setSplitVisible(true); setSplitDirection("horizontal"); }
    },
    onSplitDown: () => {
      if (splitVisible && splitDirection === "vertical") setSplitVisible(false);
      else { setSplitVisible(true); setSplitDirection("vertical"); }
    },
    onSettings: () => setShowSettings(true),
  }), [activeTabId, tabs, openTab, closeTab, saveTab, splitVisible, splitDirection]);

  const menus = useMemo(() => {
    const base = buildMenus(menuActions, t as unknown as (key: string) => string);
    // Add language toggle to View menu
    const viewMenu = base.find((m) => m.label === t("menu.view"));
    if (viewMenu) {
      viewMenu.items.push(
        { separator: true },
        { label: locale === "zh" ? "Switch to English" : "切换到中文", action: () => setLocale(locale === "zh" ? "en" : "zh") }
      );
    }
    return base;
  }, [menuActions, t, locale, setLocale]);

  return (
    <div className="app-container">
      <MenuBar menus={menus} />
      <div className="app-main">
        <ActivityBar activeView={sidebarView} onViewChange={(v) => { setSidebarView(v); setSidebarVisible(true); }} onOpenSettings={() => setShowSettings(true)} onOpenAgent={() => agentOpener.open()} />
        <PanelGroup direction="horizontal">
          {sidebarVisible && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={40}>
                <Sidebar
                  view={sidebarView}
                  onOpenFile={openTab}
                  projectRoot={projectRoot}
                  onFileTreeLoaded={handleFileTreeLoaded}
                  selectionContext={selectionContext}
                  editorContext={{
                    openFiles: tabs.map((t) => t.path),
                    activeFile: activeTab?.path ?? "",
                    activeLanguage: activeTab?.language,
                  }}
                  onOpenInAgent={(path) => agentOpener.open(`Analyze: ${path}`)}
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
                      onCursorChange={(line, col) => { setCursorLine(line); setCursorColumn(col); }}
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
                    onCursorChange={(line, col) => { setCursorLine(line); setCursorColumn(col); }}
                  />
                </Panel>
              )}
              {panelVisible && (
                <>
                  <PanelResizeHandle className="resize-handle" />
                  <Panel defaultSize={25} minSize={10} maxSize={50}>
                    <div className="panel-container">
                      <div className="panel-tabs">
                        {(["terminal", "problems", "output", "debug"] as const).map((tab) => {
                          const labels: Record<string, string> = {
                            terminal: t("panel.terminal"),
                            problems: t("panel.problems"),
                            output: t("panel.output"),
                            debug: "Debug",
                          };
                          return (
                          <span
                            key={tab}
                            className={`panel-tab ${panelTab === tab ? "active" : ""}`}
                            onClick={() => setPanelTab(tab)}
                            style={{ cursor: "pointer" }}
                          >
                            {labels[tab]}
                          </span>
                        )})}
                      </div>
                      <div className="panel-content">
                        {panelTab === "terminal" && <TerminalPanel />}
                        {panelTab === "problems" && <ProblemsPanel onOpenFile={openTab} />}
                        {panelTab === "output" && <OutputPanel />}
                        {panelTab === "debug" && <DebugPanel onRun={() => {
                          // Run active file
                          if (!activeTab || activeTab.path.startsWith("untitled-")) return;
                          const ext = activeTab.language;
                          const cmdMap: Record<string, string> = {
                            python: `python "${activeTab.path}"`,
                            rust: `cargo run`,
                            typescript: `npx ts-node "${activeTab.path}"`,
                            javascript: `node "${activeTab.path}"`,
                            go: `go run "${activeTab.path}"`,
                            java: `javac "${activeTab.path}" && java "${activeTab.path.replace('.java','')}"`,
                          };
                          const cmd = cmdMap[ext];
                          if (cmd) {
                            import("./components/OutputPanel").then((m) => {
                              m.emitOutput(`> ${cmd}`, "info");
                              setPanelTab("output");
                              taskRun(cmd, projectRoot).then((out) => {
                                m.emitOutput(out, "stdout");
                              }).catch((e) => {
                                m.emitOutput(String(e), "stderr");
                              });
                            });
                          }
                        }} />}
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
        currentLine={cursorLine}
        currentColumn={cursorColumn}
        encoding="UTF-8"
        indentMode={configService.getValue<boolean>("editor.insertSpaces")
          ? `Spaces: ${configService.getValue<number>("editor.tabSize") ?? 2}`
          : `Tab Size: ${configService.getValue<number>("editor.tabSize") ?? 2}`}
        language={activeTab?.language || "Plain Text"}
        branch={gitBranch}
      />

      {showPalette && (
        <CommandPalette
          commands={paletteCommands}
          placeholder="Type a command..."
          onClose={() => setShowPalette(false)}
        />
      )}

      {showSettings && (
        <GlassDialog open={showSettings} onClose={() => setShowSettings(false)} dialogClassName={undefined}>
          <div style={{
            width: 480, maxHeight: "80vh", overflow: "auto",
          }}>
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        </GlassDialog>
      )}

      {agentOpener.isOpen && (
        <AgentDialog
          open={agentOpener.isOpen}
          onClose={agentOpener.close}
          initialTask={agentOpener.initialTask}
        />
      )}

      {/* File open choice dialog */}
      {fileChoicePath && (
        <GlassDialog open={!!fileChoicePath} onClose={() => setFileChoicePath(null)} dialogClassName={undefined}>
          <div style={{ width: 400, padding: "8px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
              Open File
            </div>
            <div style={{
              fontSize: 12, color: "var(--text-secondary)", marginBottom: 20,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {fileChoicePath}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <GlassBtn onClick={() => setFileChoicePath(null)}>
                Cancel
              </GlassBtn>
              <GlassBtn onClick={handleOpenInNewPage}>
                Open in New Page
              </GlassBtn>
              <GlassBtn accent onClick={handleOpenLocal}>
                Open Locally
              </GlassBtn>
            </div>
          </div>
        </GlassDialog>
      )}

      {/* Folder open choice dialog */}
      {folderChoicePath && (
        <GlassDialog open={!!folderChoicePath} onClose={() => setFolderChoicePath(null)} dialogClassName={undefined}>
          <div style={{ width: 400, padding: "8px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
              Open Folder
            </div>
            <div style={{
              fontSize: 12, color: "var(--text-secondary)", marginBottom: 20,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {folderChoicePath}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <GlassBtn onClick={() => setFolderChoicePath(null)}>
                Cancel
              </GlassBtn>
              <GlassBtn onClick={handleOpenFolderInNewPage}>
                Open in New Page
              </GlassBtn>
              <GlassBtn accent onClick={handleOpenFolderLocal}>
                Open Locally
              </GlassBtn>
            </div>
          </div>
        </GlassDialog>
      )}
      <NotificationToast />
    </div>
  );
}

export default App;
