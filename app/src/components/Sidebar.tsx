import { FileTree, FileNode } from "@oceanix/file-tree";
import { EditorTab } from "./EditorTabs";
import GitPanel, { GitFileStatus } from "./GitPanel";
import ChatPanel from "./ChatPanel";
import { useState, useCallback, useEffect } from "react";
import { readDir, readFile, gitStatus, gitBranchName, gitCommit, gitStage, gitUnstage, gitBranches, gitSwitchBranch, searchInFiles } from "../services/api";
import { useLocale } from "../i18n/LocaleContext";

interface SidebarProps {
  view: string;
  onOpenFile?: (tab: EditorTab) => void;
  /** If provided, called when a file is clicked instead of onOpenFile.
   *  The parent can then show a choice dialog and call onOpenFile directly. */
  onFileSelect?: (path: string) => void;
  projectRoot: string;
  onFileTreeLoaded?: (files: Array<{ path: string; name: string }>) => void;
}

function flattenFiles(node: FileNode): Array<{ path: string; name: string }> {
  if (node.type === "file") return [{ path: node.path, name: node.name }];
  const result: Array<{ path: string; name: string }> = [];
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenFiles(child));
    }
  }
  return result;
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
    const children: Promise<FileNode>[] = [];

    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      if (entry.isDir) {
        children.push(buildFileTree(entry.path, entry.name, depth - 1));
      } else {
        children.push(Promise.resolve({ name: entry.name, path: entry.path, type: "file" as const }));
      }
    }

    // Resolve all children concurrently
    const resolved = await Promise.all(children);
    resolved.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children = resolved;
  } catch {
    node.children = [];
  }

  return node;
}

export default function Sidebar({ view, onOpenFile, onFileSelect, projectRoot, onFileTreeLoaded }: SidebarProps) {
  const { t } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ file: string; line: number; text: string }>>([]);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Git state
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitBranch, setGitBranch] = useState("main");
  const [gitBranchesList, setGitBranchesList] = useState<Array<{ name: string; isHead: boolean }>>([]);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  // Reset file tree when project root changes
  useEffect(() => {
    setFileTree(null);
  }, [projectRoot]);

  // SAFE MODE STEP 1: restore file tree loading
  useEffect(() => {
    if (view !== "explorer") return;
    if (fileTree) return;

    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);

    const timer = setTimeout(() => {
      if (cancelled) return;
      const rootName = projectRoot.split(/[/\\]/).pop() || projectRoot;
      buildFileTree(projectRoot, rootName, 2)
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
    }, 100);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [view, projectRoot, fileTree]);

  // Reload file tree
  const refreshTree = useCallback(() => {
    setFileTree(null);
  }, []);

  // Load git data once on mount (regardless of active view)
  useEffect(() => {
    const loadGit = () => {
      setGitLoading(true);
      setGitError(null);
      Promise.all([
        gitStatus().catch((e: string) => { setGitError(String(e)); return [] as GitFileStatus[]; }),
        gitBranchName().catch(() => "main"),
        gitBranches().catch(() => [] as Array<{ name: string; isHead: boolean }>),
      ]).then(([files, branch, brList]) => {
        setGitFiles(files.map((f: { path: string; status: string }) => ({
          path: f.path,
          status: f.status as GitFileStatus["status"],
        })));
        setGitBranch(branch);
        setGitBranchesList(brList);
        setGitLoading(false);
      });
    };
    loadGit();
  }, []); // mount once

  const handleGitCommit = useCallback(async (message: string) => {
    try {
      await gitCommit(message);
      const [files, branch, brList] = await Promise.all([
        gitStatus().catch(() => [] as GitFileStatus[]),
        gitBranchName().catch(() => "main"),
        gitBranches().catch(() => [] as Array<{ name: string; isHead: boolean }>),
      ]);
      setGitFiles(files.map((f: { path: string; status: string }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
      })));
      setGitBranch(branch);
      setGitBranchesList(brList);
    } catch (err) {
      console.error("Commit failed:", err);
    }
  }, []);

  const handleGitRefresh = useCallback(async () => {
    try {
      setGitLoading(true);
      const [files, branch, brList] = await Promise.all([
        gitStatus().catch(() => [] as GitFileStatus[]),
        gitBranchName().catch(() => "main"),
        gitBranches().catch(() => [] as Array<{ name: string; isHead: boolean }>),
      ]);
      setGitFiles(files.map((f: { path: string; status: string }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
      })));
      setGitBranch(branch);
      setGitBranchesList(brList);
    } finally {
      setGitLoading(false);
    }
  }, []);

  // Auto-refresh git on file changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("file-changed", () => {
        handleGitRefresh();
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [handleGitRefresh]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    try {
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

  const handleOpenFile = async (path: string) => {
    // If parent wants to intercept (show choice dialog), let it handle the rest
    if (onFileSelect) {
      onFileSelect(path);
      return;
    }

    if (onOpenFile) {
      const label = path.split("/").pop() || path;
      const ext = label.split(".").pop() || "";
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        rs: "rust", json: "json", md: "markdown", css: "css", html: "html",
        py: "python", java: "java", go: "go",
        sql: "sql", scss: "scss", less: "less",
        vue: "html", // Vue SFC rendered as HTML
        // toml, yaml, xml, sh, etc. → fallback to plaintext below
      };

      // Load file content
      let content = "";
      try {
        content = await readFile(path);
      } catch {
        content = `// Could not read: ${path}`;
      }

      onOpenFile({
        id: path, path, label,
        language: langMap[ext] || "plaintext",
        content,
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
          <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>{t("sidebar.loading")}</div>
        ) : gitError ? (
          <div style={{ padding: 12, color: "#f44747", fontSize: 13 }}>
            Git error: {gitError}
            <br />
            <button onClick={handleGitRefresh} style={{ marginTop: 4, cursor: "pointer" }}>Retry</button>
          </div>
        ) : (
          <GitPanel
            files={gitFiles}
            branch={gitBranch}
            branches={gitBranchesList}
            onCommit={handleGitCommit}
            onRefresh={handleGitRefresh}
            onSwitchBranch={async (name) => {
              await gitSwitchBranch(name).catch(() => {});
              handleGitRefresh();
            }}
            onStageFile={async (path) => {
              const file = gitFiles.find((f) => f.path === path);
              if (file?.status === "added") {
                await gitUnstage(path).catch(() => {});
              } else {
                await gitStage(path).catch(() => {});
              }
              handleGitRefresh();
            }}
          />
        )
      )}
      {view === "ai" && <ChatPanel />}
      {view === "rag" && (
        <div style={{ padding: 12, color: "var(--text-secondary)" }}>
          RAG — Retrieval-Augmented Generation
        </div>
      )}
    </div>
  );
}
