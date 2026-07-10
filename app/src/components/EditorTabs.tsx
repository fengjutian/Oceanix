import React, { useState, useCallback, useRef, useEffect } from "react";
import Editor, { OnMount, DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { aiComplete } from "../services/api";

export interface EditorTab {
  id: string;
  path: string;
  label: string;
  language: string;
  content: string;
  dirty: boolean;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onSave: (id: string) => void;
  editorRef?: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
}

export default function EditorTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave,
  editorRef,
}: EditorTabsProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [splitMode, setSplitMode] = useState<"markdown" | null>(null);
  const [diffOriginal, setDiffOriginal] = useState("");
  const [diffModified, setDiffModified] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  // Store the monaco instance so we can register providers later (e.g. on tab switch)
  const handleEditorMount: OnMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      monacoRef.current = monaco;
      if (editorRef) editorRef.current = editor;
    },
    [editorRef]
  );

  // Re-register inline completions whenever the active tab's language changes
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

      {/* Editor */}
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
            minimap: { enabled: true },
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
  );
}
