import React, { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import Editor, { OnMount, DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import WelcomePage from "./WelcomePage";
import { aiComplete, lspHover, lspDefinition, lspStart, lspDidOpen, lspDidChange, lspRename, lspCompletion, lspReferences, lspFormatting, gitBlame } from "../services/api";
import type { GitBlameEntry } from "../services/api";
import type { EditorSettings } from "../services/api";

const LSP_LANGUAGES = new Set(["rust", "python", "typescript", "typescriptreact", "javascript"]);

function isLspLanguage(lang: string): boolean {
  return LSP_LANGUAGES.has(lang);
}

// ─── Markdown renderer ─────────────────────────────

function renderMarkdown(md: string): string {
  // Escape HTML in non-code content
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m: string, lang: string, code: string) => {
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${cls}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold / italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr/>");

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Paragraphs: double newlines → paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = "<p>" + html + "</p>";

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-6]|<\/?ul|<\/?ol|<\/?li|<\/?pre|<\/?blockquote|<\/?hr)/g, "$1");
  html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/ol>|<\/pre>|<\/blockquote>|<\/?hr[^>]*>)\s*<\/p>/g, "$1");

  // Line breaks within paragraphs
  html = html.replace(/\n/g, "<br/>");

  return html;
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
  openGitDiff: (original?: string) => void;
  toggleBlame: () => void;
  toggleBreakpoint: () => void;
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
  onCursorChange?: (line: number, column: number) => void;
  editorSettings?: EditorSettings | null;
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
  onCursorChange,
  editorSettings,
}, ref) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [splitMode, setSplitMode] = useState<"markdown" | null>(null);
  const [diffOriginal, setDiffOriginal] = useState("");
  const [diffModified, setDiffModified] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [showBlame, setShowBlame] = useState(false);
  const blameDecorationsRef = useRef<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const bpDecorationsRef = useRef<string[]>([]);

  const lspDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const handleEditorMount: OnMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      monacoRef.current = monaco;
      if (editorRef) editorRef.current = editorInstance;

      // Track cursor position for status bar
      editorInstance.onDidChangeCursorPosition((e) => {
        onCursorChange?.(e.position.lineNumber, e.position.column);
      });

      // Apply editor settings
      if (editorSettings) {
        editorInstance.updateOptions({
          fontSize: editorSettings.fontSize,
          fontFamily: editorSettings.fontFamily,
          tabSize: editorSettings.tabSize,
          insertSpaces: editorSettings.insertSpaces,
          wordWrap: editorSettings.wordWrap,
          minimap: { enabled: editorSettings.minimap },
          glyphMargin: true,
        });
      }

      // Breakpoint toggle on gutter click
      editorInstance.onMouseDown((e) => {
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
            e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
          const line = e.target.position?.lineNumber;
          if (line) {
            setBreakpoints((prev) => {
              const next = new Set(prev);
              if (next.has(line)) next.delete(line);
              else next.add(line);
              return next;
            });
          }
        }
      });

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

      // Register LSP completion provider
      const compDisposable = monaco.languages.registerCompletionItemProvider("*", {
        triggerCharacters: ".".split(""),
        provideCompletionItems: async (model, position) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return { suggestions: [] };
          try {
            const items = await lspCompletion(tab.language, tab.path, position.lineNumber - 1, position.column - 1);
            const monacoKind = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
            return {
              suggestions: items.map((i) => ({
                label: i.label,
                kind: i.kind != null ? monacoKind[i.kind] ?? 0 : 0,
                detail: i.detail,
                insertText: i.insertText ?? i.label,
                range: undefined as any,
              })),
            };
          } catch { return { suggestions: [] }; }
        },
      });

      // Register LSP references provider
      const refDisposable = monaco.languages.registerReferenceProvider("*", {
        provideReferences: async (model, position, _context) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return [];
          try {
            const locs = await lspReferences(tab.language, tab.path, position.lineNumber - 1, position.column - 1);
            return locs.map((l) => ({
              uri: monaco.Uri.parse(l.uri),
              range: new monaco.Range(
                l.rangeStartLine + 1, l.rangeStartChar + 1,
                l.rangeEndLine + 1, l.rangeEndChar + 1,
              ),
            }));
          } catch { return []; }
        },
      });

      // Register LSP document formatting provider
      const fmtDisposable = monaco.languages.registerDocumentFormattingEditProvider("*", {
        provideDocumentFormattingEdits: async (model) => {
          const tab = tabs.find((t) => t.id === activeTabId);
          if (!tab || !isLspLanguage(tab.language)) return [];
          try {
            const edits = await lspFormatting(tab.language, tab.path, 2, true);
            return edits.map((e) => ({
              range: new monaco.Range(
                e.rangeStartLine + 1, e.rangeStartChar + 1,
                e.rangeEndLine + 1, e.rangeEndChar + 1,
              ),
              text: e.newText,
            }));
          } catch { return []; }
        },
      });

      lspDisposablesRef.current.push(compDisposable, refDisposable, fmtDisposable);
    },
    [editorRef, tabs, activeTabId]
  );

  const toggleMarkdownPreview = useCallback(() => {
    setSplitMode((prev) => (prev === "markdown" ? null : "markdown"));
    setShowDiff(false);
  }, []);

  const openGitDiff = useCallback((original?: string) => {
    if (!activeTab) return;
    setDiffOriginal(original ?? "");
    setDiffModified(activeTab.content);
    setShowDiff(true);
    setSplitMode(null);
  }, [activeTab]);

  // Update breakpoint decorations when set changes
  useEffect(() => {
    const editor = editorRef?.current;
    if (!editor) return;
    const decos = Array.from(breakpoints).map((line) => ({
      range: new (window as any).monaco?.Range?.(line, 1, line, 1) ?? { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: true,
        glyphMarginClassName: "bp-glyph",
        linesDecorationsClassName: "bp-line",
      },
    }));
    bpDecorationsRef.current = editor.deltaDecorations(bpDecorationsRef.current, decos as any);
  }, [breakpoints]);

  const toggleBlame = useCallback(async () => {
    if (!activeTab || !editorRef?.current) return;
    const editor = editorRef.current;

    if (showBlame) {
      // Clear decorations
      editor.deltaDecorations(blameDecorationsRef.current, []);
      blameDecorationsRef.current = [];
      setShowBlame(false);
    } else {
      try {
        const entries = await gitBlame(activeTab.path);
        const model = editor.getModel();
        if (!model) return;

        const decos = entries.map((e: GitBlameEntry, i: number) => ({
          range: new (monacoRef.current?.Range ?? (await import("monaco-editor")).Range)(
            e.line, 1, e.line, 1
          ),
          options: {
            isWholeLine: false,
            after: {
              content: `  ${e.author}, ${new Date(e.time * 1000).toLocaleDateString()} • ${e.summary.slice(0, 60)}`,
              inlineClassName: "blame-annotation",
            },
          },
        }));

        blameDecorationsRef.current = editor.deltaDecorations([], decos);
        setShowBlame(true);
      } catch { /* git blame not available */ }
    }
  }, [activeTab, showBlame, editorRef]);

  const toggleBreakpoint = useCallback(() => {
    const editor = editorRef?.current;
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    setBreakpoints((prev) => {
      const next = new Set(prev);
      if (next.has(pos.lineNumber)) next.delete(pos.lineNumber);
      else next.add(pos.lineNumber);
      return next;
    });
  }, [editorRef]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    toggleMarkdownPreview,
    openGitDiff,
    toggleBlame,
    toggleBreakpoint,
  }), [toggleMarkdownPreview, openGitDiff, toggleBlame, toggleBreakpoint]);

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
    import("./OutputPanel").then((m) => m.emitOutput(`LSP: ${lang} started for ${activeTab.path}`, "info"));
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
            activeTab.language === "image" ? (
              <div style={{
                height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                background: "var(--bg-primary)", overflow: "auto",
              }}>
                <img
                  src={activeTab.content}
                  alt={activeTab.label}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              </div>
            ) : (
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
            )
          ) : (
            <WelcomePage />
          )}
        </div>

        {/* Split pane: Markdown preview */}
        {splitMode === "markdown" && activeTab && (
          <>
            <div style={{ width: 4, cursor: "col-resize", background: "var(--border-color)" }} />
            <div className="markdown-preview" style={{ flex: 0.5, minWidth: 0, height: "100%", overflow: "auto",
              padding: "12px 16px", background: "var(--bg-primary)", color: "var(--text-primary)",
              fontFamily: "system-ui, sans-serif", fontSize: 14, lineHeight: 1.7,
            }}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(activeTab.content)
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
