import React, { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import Editor, { OnMount, DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { aiComplete, lspHover, lspDefinition, lspStart, lspDidOpen, lspDidChange, lspRename } from "../services/api";

const LSP_LANGUAGES = new Set(["rust", "python", "typescript", "typescriptreact", "javascript"]);

function isLspLanguage(lang: string): boolean {
  return LSP_LANGUAGES.has(lang);
}

export interface EditorTab {
  id: string;
  path: string;
  label: string;
  language: string;
  content: string;
  dirty: boolean;
}

export interface EditorTabsHandle {
  toggleMarkdownPreview: () => void;
  openGitDiff: () => void;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onSave: (id: string) => void;
  editorRef?: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  projectRoot?: string;
}

const EditorTabs = forwardRef<EditorTabsHandle, EditorTabsProps>(function EditorTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave,
  editorRef,
  projectRoot,
}, ref) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [splitMode, setSplitMode] = useState<"markdown" | null>(null);
  const [diffOriginal, setDiffOriginal] = useState("");
  const [diffModified, setDiffModified] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  const lspDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const handleEditorMount: OnMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      monacoRef.current = monaco;
      if (editorRef) editorRef.current = editorInstance;

      // Register LSP hover provider (only for languages with LSP support)
      const hoverDisposable = monaco.languages.registerHoverProvider("*", {
        provideHover: async (model, position) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return null;
          try {
            const result = await lspHover(tab.language, tab.path, position.lineNumber - 1, position.column - 1);
            if (result) {
              return { contents: [{ value: result.contents }] };
            }
          } catch { /* LSP not available */ }
          return null;
        },
      });

      // Register LSP definition provider
      const defDisposable = monaco.languages.registerDefinitionProvider("*", {
        provideDefinition: async (model, position) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return null;
          try {
            const locs = await lspDefinition(tab.language, tab.path, position.lineNumber - 1, position.column - 1);
            if (locs.length > 0) {
              return locs.map((l) => ({
                uri: monaco.Uri.parse(l.uri),
                range: new monaco.Range(
                  l.rangeStartLine + 1, l.rangeStartChar + 1,
                  l.rangeEndLine + 1, l.rangeEndChar + 1,
                ),
              }));
            }
          } catch { /* LSP not available */ }
          return null;
        },
      });

      // Register LSP rename provider
      const renameDisposable = monaco.languages.registerRenameProvider("*", {
        provideRenameEdits: async (model, position, newName) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return null;
          try {
            const edits = await lspRename(tab.language, tab.path, position.lineNumber - 1, position.column - 1, newName);
            if (edits.length > 0) {
              return {
                edits: edits.map((e) => ({
                  resource: monaco.Uri.parse(e.uri),
                  versionId: undefined,
                  textEdit: {
                    range: new monaco.Range(
                      e.rangeStartLine + 1, e.rangeStartChar + 1,
                      e.rangeEndLine + 1, e.rangeEndChar + 1,
                    ),
                    text: e.newText,
                  },
                })),
              };
            }
          } catch { /* LSP not available */ }
          return null;
        },
        resolveRenameLocation: async (model, position) => {
          return { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column + 1), text: "" };
        },
      });

      // Store disposables for cleanup and re-registration
      lspDisposablesRef.current.forEach((d) => d.dispose());
      lspDisposablesRef.current = [hoverDisposable, defDisposable, renameDisposable];
    },
    [editorRef, tabs, activeTabId]
  );

  const toggleMarkdownPreview = useCallback(() => {
    setSplitMode((prev) => (prev === "markdown" ? null : "markdown"));
    setShowDiff(false);
  }, []);

  const openGitDiff = useCallback(() => {
    if (!activeTab) return;
    setDiffOriginal("");
    setDiffModified(activeTab.content);
    setShowDiff(true);
    setSplitMode(null);
  }, [activeTab]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    toggleMarkdownPreview,
    openGitDiff,
  }), [toggleMarkdownPreview, openGitDiff]);

  // ─── LSP lifecycle ──────────────────────────────────
  const lspVersionRef = useRef(1);

  // Start LSP + didOpen when language/file changes
  useEffect(() => {
    if (!activeTab || !projectRoot) return;
    if (!isLspLanguage(activeTab.language)) return;

    const lang = activeTab.language;
    lspVersionRef.current = 1;

    lspStart(lang, projectRoot).catch(() => {});
    lspDidOpen(lang, activeTab.path, activeTab.content).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.language, activeTab?.path, projectRoot]);

  // Send didChange when content changes (debounced)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!activeTab || !isLspLanguage(activeTab.language)) return;
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = setTimeout(() => {
      lspDidChange(activeTab.language, activeTab.path, lspVersionRef.current++, activeTab.content).catch(() => {});
    }, 300);
    return () => { if (contentTimerRef.current) clearTimeout(contentTimerRef.current); };
  }, [activeTab?.content, activeTab?.language, activeTab?.path]);
  useEffect(() => {
    if (!activeTab || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const disposable = monaco.languages.registerInlineCompletionsProvider?.(
      { language: activeTab.language },
      {
        provideInlineCompletions: async (model, position) => {
          try {
            const code = model.getValue();
            const result = await aiComplete({
              code,
              position: { line: position.lineNumber, column: position.column },
              language: activeTab.language,
              filePath: activeTab.path,
            });
            if (result) {
              return { items: [{ insertText: result.insertText }] };
            }
          } catch {
            // Silently fail — AI may not be available yet
          }
          return { items: [] };
        },
      }
    );
    return () => disposable?.dispose();
  }, [activeTab?.language, activeTab?.path]);

  return (
    <div className="editor-area">
      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="tab-label">
              {tab.dirty && <span className="tab-dirty">●</span>}
              {tab.label}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Editor with optional split pane */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Main editor */}
        <div style={{ flex: (showDiff || splitMode) ? 0.5 : 1, minWidth: 0, height: "100%" }}>
          {activeTab ? (
            <Editor
              height="100%"
              language={activeTab.language}
              value={activeTab.content}
              theme="vs-dark"
              onChange={(value) => onContentChange(activeTab.id, value || "")}
              onMount={handleEditorMount}
              loading={<div className="editor-loading">Loading editor...</div>}
              options={{
                fontSize: 14,
                fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                automaticLayout: true,
                minimap: { enabled: !showDiff && !splitMode },
                folding: true,
                lineNumbers: "on",
                renderWhitespace: "selection",
                tabSize: 2,
                insertSpaces: true,
                wordWrap: "off",
                bracketPairColorization: { enabled: true },
                autoClosingBrackets: "always",
                autoIndent: "full",
                formatOnPaste: true,
                suggest: { showWords: true },
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
              }}
            />
          ) : (
            <div className="editor-empty">
              <div className="empty-state">
                <h1>Oceanix</h1>
                <p>Ctrl+O to open a file or folder</p>
              </div>
            </div>
          )}
        </div>

        {/* Split pane: Markdown preview */}
        {splitMode === "markdown" && activeTab && (
          <>
            <div style={{ width: 4, cursor: "col-resize", background: "var(--border-color)" }} />
            <div style={{ flex: 0.5, minWidth: 0, height: "100%", overflow: "auto",
              padding: "12px 16px", background: "var(--bg-primary)", color: "var(--text-primary)",
              fontFamily: "system-ui, sans-serif", fontSize: 14, lineHeight: 1.7,
            }}
              dangerouslySetInnerHTML={{
                __html: activeTab.content
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/`([^`]+)`/g, '<code>$1</code>')
                  .replace(/\n\n/g, '<br/><br/>')
                  .replace(/\n/g, '<br/>')
              }}
            />
          </>
        )}

        {/* Split pane: Git diff */}
        {showDiff && activeTab && (
          <>
            <div style={{ width: 4, cursor: "col-resize", background: "var(--border-color)" }} />
            <div style={{ flex: 0.5, minWidth: 0, height: "100%" }}>
              <DiffEditor
                height="100%"
                language={activeTab.language}
                original={diffOriginal}
                modified={diffModified}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                  automaticLayout: true,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default EditorTabs;
