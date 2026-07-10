import { FileTree, FileNode } from "@oceanix/file-tree";
import { EditorTab } from "./EditorTabs";
import GitPanel, { GitFileStatus } from "./GitPanel";
import { useState, useCallback, useEffect } from "react";
import { readDir, gitStatus, gitBranchName, gitCommit } from "../services/api";

interface SidebarProps {
  view: string;
  onOpenFile?: (tab: EditorTab) => void;
  projectRoot: string;
}

// Files/dirs to skip when building the tree
const SKIP = new Set([
  ".git", "node_modules", "target", "dist", ".next",
  "__pycache__", ".venv", "venv", ".idea", ".vscode",
  ".DS_Store", "Thumbs.db",
]);

async function buildFileTree(dirPath: string, dirName: string, depth: number): Promise<FileNode> {
  const node: FileNode = {
    name: dirName,
    path: dirPath,
    type: "directory",
    children: [],
  };

  if (depth <= 0) return node;

  try {
    const entries = await readDir(dirPath);
    const children: FileNode[] = [];

    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      if (entry.isDir) {
        children.push(await buildFileTree(entry.path, entry.name, depth - 1));
      } else {
        children.push({ name: entry.name, path: entry.path, type: "file" });
      }
    }

    // Sort: directories first, then alphabetically
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children = children;
  } catch {
    // Permission denied, empty dir, etc. — return node without children
    node.children = [];
  }

  return node;
}

export default function Sidebar({ view, onOpenFile, projectRoot }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ file: string; line: number; text: string }>>([]);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Git state
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitBranch, setGitBranch] = useState("main");
  const [gitLoading, setGitLoading] = useState(false);

  // Load file tree when explorer view becomes active
  useEffect(() => {
    if (view !== "explorer") return;
    if (fileTree) return; // already loaded

    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);

    const rootName = projectRoot.split(/[/\\]/).pop() || projectRoot;
    buildFileTree(projectRoot, rootName, 4)
      .then((tree) => {
        if (!cancelled) {
          setFileTree(tree);
          setTreeLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTreeError(String(err));
          setTreeLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [view, projectRoot]);

  // Reload file tree
  const refreshTree = useCallback(() => {
    setFileTree(null);
  }, []);

  // Load git data when git view becomes active
  useEffect(() => {
    if (view !== "git") return;

    let cancelled = false;
    setGitLoading(true);

    Promise.all([
      gitStatus().catch(() => [] as GitFileStatus[]),
      gitBranchName().catch(() => "main"),
    ]).then(([files, branch]) => {
      if (!cancelled) {
        setGitFiles(files.map((f: { path: string; status: string }) => ({
          path: f.path,
          status: f.status as GitFileStatus["status"],
        })));
        setGitBranch(branch);
        setGitLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [view]);

  const handleGitCommit = useCallback(async (message: string) => {
    try {
      await gitCommit(message);
      const [files, branch] = await Promise.all([
        gitStatus().catch(() => [] as GitFileStatus[]),
        gitBranchName().catch(() => "main"),
      ]);
      setGitFiles(files.map((f: { path: string; status: string }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
      })));
      setGitBranch(branch);
    } catch (err) {
      console.error("Commit failed:", err);
    }
  }, []);

  const handleGitRefresh = useCallback(async () => {
    try {
      setGitLoading(true);
      const [files, branch] = await Promise.all([
        gitStatus().catch(() => [] as GitFileStatus[]),
        gitBranchName().catch(() => "main"),
      ]);
      setGitFiles(files.map((f: { path: string; status: string }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
      })));
      setGitBranch(branch);
    } finally {
      setGitLoading(false);
    }
  }, []);

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
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", fontSize: 11, fontWeight: 600,
            color: "var(--text-secondary)", textTransform: "uppercase",
            letterSpacing: "0.5px", borderBottom: "1px solid var(--border-color)",
          }}>
            <span>Explorer</span>
            <button
              onClick={refreshTree}
              title="Refresh"
              style={{
                background: "none", border: "none", color: "var(--text-secondary)",
                cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1,
              }}
            >
              ↻
            </button>
          </div>

          {/* Tree content */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {treeLoading && (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                Loading...
              </div>
            )}
            {treeError && (
              <div style={{ padding: 12, color: "var(--text-error)", fontSize: 13 }}>
                Failed to load: {treeError}
                <br />
                <button onClick={refreshTree} style={{ marginTop: 4, cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            )}
            {!treeLoading && !treeError && fileTree && (
              <FileTree root={fileTree} onOpenFile={handleOpenFile} />
            )}
            {!treeLoading && !treeError && !fileTree && (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                Open a folder to see files
              </div>
            )}
          </div>
        </div>
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
        gitLoading ? (
          <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>Loading git status...</div>
        ) : (
          <GitPanel
            files={gitFiles}
            branch={gitBranch}
            onCommit={handleGitCommit}
            onRefresh={handleGitRefresh}
          />
        )
      )}
      {view === "ai" && (
        <div style={{ padding: 12, color: "var(--text-secondary)" }}>
          AI Chat — select the AI view
        </div>
      )}
    </div>
  );
}
