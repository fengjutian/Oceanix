import React, { useState, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
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
}

export default function EditorTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onContentChange,
  onSave,
}: EditorTabsProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = useCallback(
    (_editor: editor.IStandaloneCodeEditor, monaco: typeof import("monaco-editor")) => {
      // Register inline completion provider for AI completions
      if (activeTab && monaco) {
        const { languages } = monaco;
        languages.registerInlineCompletionsProvider?.(
          { language: activeTab.language },
          {
            provideInlineCompletions: async (_model, position) => {
              try {
                const code = _model.getValue();
                const result = await aiComplete({
                  code,
                  position: { line: position.lineNumber, column: position.column },
                  language: activeTab.language,
                  filePath: activeTab.path,
                });
                if (result) {
                  return {
                    items: [{ insertText: result.insertText }],
                  };
                }
              } catch {
                // Silently fail — AI may not be available yet
              }
              return { items: [] };
            },
          }
        );
      }
    },
    [activeTab]
  );

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
          options={{
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            minimap: { enabled: true },
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
