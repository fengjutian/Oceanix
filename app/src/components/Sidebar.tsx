import { FileTree, FileNode } from "@oceanix/file-tree";
import { EditorTab } from "./EditorTabs";
import GitPanel, { GitFileStatus } from "./GitPanel";
import { useState, useCallback } from "react";

interface SidebarProps {
  view: string;
  onOpenFile?: (tab: EditorTab) => void;
}

const DEMO_FILES: FileNode = {
  name: "oceanix",
  path: "/oceanix",
  type: "directory",
  children: [
    { name: "app", path: "/oceanix/app", type: "directory", children: [
      { name: "src", path: "/oceanix/app/src", type: "directory", children: [
        { name: "App.tsx", path: "/oceanix/app/src/App.tsx", type: "file", gitStatus: "modified" },
        { name: "main.tsx", path: "/oceanix/app/src/main.tsx", type: "file" },
        { name: "components", path: "/oceanix/app/src/components", type: "directory", children: [
          { name: "EditorTabs.tsx", path: "/oceanix/app/src/components/EditorTabs.tsx", type: "file", gitStatus: "added" },
          { name: "Terminal.tsx", path: "/oceanix/app/src/components/Terminal.tsx", type: "file", gitStatus: "added" },
          { name: "GitPanel.tsx", path: "/oceanix/app/src/components/GitPanel.tsx", type: "file", gitStatus: "added" },
        ]},
      ]},
      { name: "package.json", path: "/oceanix/app/package.json", type: "file", gitStatus: "modified" },
      { name: "vite.config.ts", path: "/oceanix/app/vite.config.ts", type: "file" },
    ]},
    { name: "src-tauri", path: "/oceanix/src-tauri", type: "directory", children: [
      { name: "src", path: "/oceanix/src-tauri/src", type: "directory", children: [
        { name: "lib.rs", path: "/oceanix/src-tauri/src/lib.rs", type: "file", gitStatus: "modified" },
        { name: "commands.rs", path: "/oceanix/src-tauri/src/commands.rs", type: "file", gitStatus: "modified" },
        { name: "main.rs", path: "/oceanix/src-tauri/src/main.rs", type: "file" },
      ]},
      { name: "Cargo.toml", path: "/oceanix/src-tauri/Cargo.toml", type: "file", gitStatus: "modified" },
    ]},
    { name: "crates", path: "/oceanix/crates", type: "directory", children: [
      { name: "oceanix-lsp", path: "/oceanix/crates/oceanix-lsp", type: "directory" },
      { name: "oceanix-pty", path: "/oceanix/crates/oceanix-pty", type: "directory" },
      { name: "oceanix-git", path: "/oceanix/crates/oceanix-git", type: "directory" },
      { name: "oceanix-search", path: "/oceanix/crates/oceanix-search", type: "directory" },
      { name: "oceanix-ai", path: "/oceanix/crates/oceanix-ai", type: "directory" },
    ]},
    { name: "packages", path: "/oceanix/packages", type: "directory" },
    { name: "ai-server", path: "/oceanix/ai-server", type: "directory" },
    { name: "Cargo.toml", path: "/oceanix/Cargo.toml", type: "file" },
    { name: "README.md", path: "/oceanix/README.md", type: "file", gitStatus: "untracked" },
    { name: "REQUIREMENTS.md", path: "/oceanix/REQUIREMENTS.md", type: "file" },
  ],
};

// Demo git status
const DEMO_GIT_FILES: GitFileStatus[] = [
  { path: "app/src/App.tsx", status: "modified" },
  { path: "app/src/components/EditorTabs.tsx", status: "added" },
  { path: "app/src/components/Terminal.tsx", status: "added" },
  { path: "app/src/components/GitPanel.tsx", status: "added" },
  { path: "src-tauri/src/lib.rs", status: "modified" },
  { path: "src-tauri/src/commands.rs", status: "modified" },
  { path: "src-tauri/Cargo.toml", status: "modified" },
  { path: "crates/oceanix-pty/src/lib.rs", status: "untracked" },
  { path: "crates/oceanix-git/src/lib.rs", status: "untracked" },
  { path: "crates/oceanix-search/src/lib.rs", status: "untracked" },
];

export default function Sidebar({ view, onOpenFile }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ file: string; line: number; text: string }>>([]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    try {
      const { searchInFiles } = await import("../services/api");
      const results = await searchInFiles({
        query: searchQuery,
        path: ".",
        regex: false,
        caseSensitive: false,
      });
      setSearchResults(results.map((r: { file: string; line: number; text: string }) => r));
    } catch {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleOpenFile = (path: string) => {
    if (onOpenFile) {
      const label = path.split("/").pop() || path;
      const ext = label.split(".").pop() || "";
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript", rs: "rust",
        json: "json", md: "markdown", css: "css", html: "html",
        toml: "toml", py: "python",
      };
      onOpenFile({
        id: path, path, label,
        language: langMap[ext] || "plaintext",
        content: "",
        dirty: false,
      });
    }
  };

  return (
    <div className="sidebar">
      {view === "explorer" && (
        <FileTree root={DEMO_FILES} onOpenFile={handleOpenFile} />
      )}
      {view === "search" && (
        <div style={{ padding: 8 }}>
          <input
            style={{
              width: "100%", padding: "6px 8px",
              background: "var(--bg-tertiary)", border: "1px solid var(--border-color)",
              color: "var(--text-primary)", fontSize: 13, borderRadius: 4, outline: "none",
            }}
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); handleSearch(); }}
          />
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {searchResults.map((r, i) => (
                <div key={i} style={{
                  padding: "4px 8px", fontSize: 12, cursor: "pointer",
                  color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)",
                }}>
                  <div style={{ fontWeight: 600 }}>{r.file.split("/").pop()}:{r.line}</div>
                  <div style={{ color: "var(--text-secondary)", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>{r.text}</div>
                </div>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <div style={{ padding: "12px 4px", color: "var(--text-secondary)", fontSize: 12 }}>
              No results found
            </div>
          )}
        </div>
      )}
      {view === "git" && (
        <GitPanel files={DEMO_GIT_FILES} branch="main" />
      )}
      {view === "ai" && (
        <div style={{ padding: 12, color: "var(--text-secondary)" }}>
          AI Chat — select the AI view
        </div>
      )}
    </div>
  );
}
