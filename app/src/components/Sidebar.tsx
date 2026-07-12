import { FileTree, FileNode } from "@oceanix/file-tree";
import { EditorTab } from "./EditorTabs";
import GitPanel, { GitFileStatus, GitStashInfo, GitCommitInfo } from "./GitPanel";
import ChatPanel from "./ChatPanel";
import OutlinePanel from "./OutlinePanel";
import { useState, useCallback, useEffect } from "react";
import {
  readDir, readFile, readFileBase64, gitStatus, gitBranchName, gitCommit,
  gitStage, gitUnstage, gitBranches, gitSwitchBranch,
  gitPush, gitPull, gitFetch, gitCreateBranch, gitDiscard,
  gitStashSave, gitStashList, gitStashPop, gitStashApply, gitStashDrop,
  gitLog,
  searchInFiles,
  ragSearch, ragRebuild, ragStats,
  createFile, createDir, deleteFile, renameFile,
} from "../services/api";
import type { RAGResult } from "../services/api";
import { useLocale } from "../i18n/LocaleContext";

interface SidebarProps {
  view: string;
  onOpenFile?: (tab: EditorTab) => void;
  /** If provided, called when a file is clicked instead of onOpenFile.
   *  The parent can then show a choice dialog and call onOpenFile directly. */
  onFileSelect?: (path: string) => void;
  projectRoot: string;
  onFileTreeLoaded?: (files: Array<{ path: string; name: string }>) => void;
  /** Selected code context to pre-fill in AI chat */
  selectionContext?: { code: string; file: string; language: string } | null;
  /** Current editor context sent with each chat message */
  editorContext?: { openFiles: string[]; activeFile: string; activeLanguage?: string } | null;
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
        const ext = entry.name.includes(".") ? entry.name.split(".").pop()?.toLowerCase() || "" : "";
        children.push(Promise.resolve({ name: entry.name, path: entry.path, type: "file" as const, extension: ext }));
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

export default function Sidebar({ view, onOpenFile, onFileSelect, projectRoot, onFileTreeLoaded, selectionContext, editorContext }: SidebarProps) {
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
  const [gitStashes, setGitStashes] = useState<GitStashInfo[]>([]);
  const [gitLogEntries, setGitLogEntries] = useState<GitCommitInfo[]>([]);

  // RAG state
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<RAGResult[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState<string | null>(null);
  const [ragStatsData, setRagStatsData] = useState<{ chunks: number; files: number; languages: string[] } | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [ctxNewName, setCtxNewName] = useState("");
  const [ctxShowRename, setCtxShowRename] = useState(false);
  const [ctxShowNewFile, setCtxShowNewFile] = useState(false);
  const [ctxShowNewFolder, setCtxShowNewFolder] = useState(false);

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

  // Context menu styles
  const ctxItemStyle: React.CSSProperties = {
    padding: "4px 12px", cursor: "pointer",
    color: "var(--text-primary)",
  };
  const ctxSepStyle: React.CSSProperties = {
    height: 1, background: "var(--border-color)", margin: "4px 0",
  };
  const inlineInputStyle: React.CSSProperties = {
    flex: 1, padding: "2px 6px", fontSize: 12,
    background: "var(--bg-tertiary)", border: "1px solid var(--accent-color)",
    color: "var(--text-primary)", borderRadius: 2, outline: "none",
  };

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
        setGitFiles(files.map((f: { path: string; status: string; staged: boolean }) => ({
          path: f.path,
          status: f.status as GitFileStatus["status"],
          staged: f.staged,
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
      setGitFiles(files.map((f: { path: string; status: string; staged: boolean }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
        staged: f.staged,
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
      setGitFiles(files.map((f: { path: string; status: string; staged: boolean }) => ({
        path: f.path,
        status: f.status as GitFileStatus["status"],
        staged: f.staged,
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

  // ─── New Git handlers ────────────────────────────

  const handleGitPush = useCallback(async () => {
    try {
      setGitLoading(true);
      await gitPush(gitBranch);
      handleGitRefresh();
    } catch (err) {
      setGitError(`Push failed: ${err}`);
    } finally {
      setGitLoading(false);
    }
  }, [gitBranch, handleGitRefresh]);

  const handleGitPull = useCallback(async () => {
    try {
      setGitLoading(true);
      await gitPull(gitBranch);
      handleGitRefresh();
    } catch (err) {
      setGitError(`Pull failed: ${err}`);
    } finally {
      setGitLoading(false);
    }
  }, [gitBranch, handleGitRefresh]);

  const handleGitFetch = useCallback(async () => {
    try {
      setGitLoading(true);
      await gitFetch();
      handleGitRefresh();
    } catch (err) {
      setGitError(`Fetch failed: ${err}`);
    } finally {
      setGitLoading(false);
    }
  }, [handleGitRefresh]);

  const handleGitCreateBranch = useCallback(async (name: string) => {
    try {
      await gitCreateBranch(name);
      await gitSwitchBranch(name);
      handleGitRefresh();
    } catch (err) {
      setGitError(`Create branch failed: ${err}`);
    }
  }, [handleGitRefresh]);

  const handleGitDiscard = useCallback(async (path: string) => {
    try {
      await gitDiscard(path);
      handleGitRefresh();
    } catch (err) {
      setGitError(`Discard failed: ${err}`);
    }
  }, [handleGitRefresh]);

  const handleStageAll = useCallback(async () => {
    try {
      // Stage all unstaged files (changes + untracked)
      const unstaged = gitFiles.filter((f) => !f.staged);
      for (const f of unstaged) {
        await gitStage(f.path).catch(() => {});
      }
      handleGitRefresh();
    } catch (err) {
      setGitError(`Stage all failed: ${err}`);
    }
  }, [gitFiles, handleGitRefresh]);

  const handleUnstageAll = useCallback(async () => {
    try {
      const staged = gitFiles.filter((f) => f.staged);
      for (const f of staged) {
        await gitUnstage(f.path).catch(() => {});
      }
      handleGitRefresh();
    } catch (err) {
      setGitError(`Unstage all failed: ${err}`);
    }
  }, [gitFiles, handleGitRefresh]);

  const handleGitStashSave = useCallback(async (message?: string) => {
    try {
      await gitStashSave(message);
      handleGitRefresh();
      const stashes = await gitStashList().catch(() => [] as GitStashInfo[]);
      setGitStashes(stashes);
    } catch (err) {
      setGitError(`Stash save failed: ${err}`);
    }
  }, [handleGitRefresh]);

  const handleGitStashPop = useCallback(async (index: number) => {
    try {
      await gitStashPop(index);
      handleGitRefresh();
      const stashes = await gitStashList().catch(() => [] as GitStashInfo[]);
      setGitStashes(stashes);
    } catch (err) {
      setGitError(`Stash pop failed: ${err}`);
    }
  }, [handleGitRefresh]);

  const handleGitStashApply = useCallback(async (index: number) => {
    try {
      await gitStashApply(index);
      handleGitRefresh();
    } catch (err) {
      setGitError(`Stash apply failed: ${err}`);
    }
  }, [handleGitRefresh]);

  const handleGitStashDrop = useCallback(async (index: number) => {
    try {
      await gitStashDrop(index);
      const stashes = await gitStashList().catch(() => [] as GitStashInfo[]);
      setGitStashes(stashes);
    } catch (err) {
      setGitError(`Stash drop failed: ${err}`);
    }
  }, []);

  const handleGitLoadStashes = useCallback(async () => {
    try {
      const stashes = await gitStashList().catch(() => [] as GitStashInfo[]);
      setGitStashes(stashes);
    } catch { /* ignore */ }
  }, []);

  const handleGitLoadLog = useCallback(async () => {
    try {
      const entries = await gitLog(30).catch(() => [] as GitCommitInfo[]);
      setGitLogEntries(entries);
    } catch { /* ignore */ }
  }, []);

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
      const ext = label.split(".").pop()?.toLowerCase() || "";

      // Image files: open as preview tab using base64 data URI
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
          onOpenFile({
            id: path, path, label,
            language: "image",
            content: `data:${mimeMap[ext] || "application/octet-stream"};base64,${b64}`,
            dirty: false,
          });
        } catch {
          // Fallback: still open as image tab, the broken-image icon will show
          onOpenFile({
            id: path, path, label,
            language: "image",
            content: "",
            dirty: false,
          });
        }
        return;
      }

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
              <FileTree root={fileTree} onOpenFile={handleOpenFile} onContextMenu={(node, e) => {
                e.preventDefault();
                setCtxMenu({ x: e.clientX, y: e.clientY, node });
              }} />
            )}
            {!treeLoading && !treeError && !fileTree && (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                Open a folder to see files
              </div>
            )}
          </div>

          {/* Outline */}
          <div style={{
            borderTop: "1px solid var(--border-color)",
            marginTop: 4, padding: "4px 0",
            maxHeight: "35%", overflow: "auto",
          }}>
            <div style={{
              padding: "4px 8px", fontSize: 11, fontWeight: 600,
              color: "var(--text-secondary)", textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>Outline</div>
            <OutlinePanel
              language={editorContext?.activeLanguage}
              filePath={editorContext?.activeFile}
              onGoToSymbol={(line) => {
                // Focus the line in the editor
                const ed = document.querySelector(".monaco-editor") as any;
                ed?.__monaco_editor?.revealLineInCenter?.(line + 1);
                ed?.__monaco_editor?.setPosition?.({ lineNumber: line + 1, column: 1 });
                ed?.__monaco_editor?.focus?.();
              }}
            />
          </div>

          {/* Context menu */}
          {ctxMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 99 }}
                onClick={() => { setCtxMenu(null); setCtxShowRename(false); setCtxShowNewFile(false); setCtxShowNewFolder(false); }}
                onContextMenu={(e) => e.preventDefault()}
              />
              <div style={{
                position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 100,
                background: "var(--bg-secondary)", border: "1px solid var(--border-color)",
                borderRadius: 4, padding: "4px 0", minWidth: 160, fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}>
                {ctxMenu.node.type === "directory" && (
                  <>
                    <div style={ctxItemStyle} onClick={async () => {
                      setCtxShowNewFile(true); setCtxMenu(null);
                    }}>📄 New File</div>
                    <div style={ctxItemStyle} onClick={async () => {
                      setCtxShowNewFolder(true); setCtxMenu(null);
                    }}>📁 New Folder</div>
                    <div style={ctxSepStyle} />
                  </>
                )}
                <div style={ctxItemStyle} onClick={() => {
                  setCtxNewName(ctxMenu.node.name); setCtxShowRename(true); setCtxMenu(null);
                }}>✏️ Rename</div>
                <div style={{ ...ctxItemStyle, color: "#f44747" }} onClick={async () => {
                  const n = ctxMenu.node;
                  setCtxMenu(null);
                  if (window.confirm(`Delete "${n.name}"?`)) {
                    try { await deleteFile(n.path); refreshTree(); } catch {}
                  }
                }}>🗑️ Delete</div>
              </div>
            </>
          )}

          {/* Inline rename */}
          {ctxShowRename && (
            <div style={{ padding: "4px 8px", display: "flex", gap: 4 }}>
              <input
                autoFocus
                style={inlineInputStyle}
                value={ctxNewName}
                onChange={(e) => setCtxNewName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    const oldPath = ctxMenu?.node.path;
                    if (oldPath && ctxNewName && ctxNewName !== ctxMenu?.node.name) {
                      const dir = oldPath.replace(/[/\\][^/\\]*$/, "");
                      try { await renameFile(oldPath, `${dir}/${ctxNewName}`); refreshTree(); } catch {}
                    }
                    setCtxShowRename(false);
                  } else if (e.key === "Escape") setCtxShowRename(false);
                }}
              />
            </div>
          )}

          {/* Inline new file */}
          {ctxShowNewFile && (
            <div style={{ padding: "4px 8px", display: "flex", gap: 4 }}>
              <input
                autoFocus
                style={inlineInputStyle}
                placeholder="filename.ts"
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    const name = (e.target as HTMLInputElement).value.trim();
                    if (name && ctxMenu?.node.path) {
                      try { await createFile(`${ctxMenu.node.path}/${name}`); refreshTree(); } catch {}
                    }
                    setCtxShowNewFile(false);
                  } else if (e.key === "Escape") setCtxShowNewFile(false);
                }}
              />
            </div>
          )}

          {/* Inline new folder */}
          {ctxShowNewFolder && (
            <div style={{ padding: "4px 8px", display: "flex", gap: 4 }}>
              <input
                autoFocus
                style={inlineInputStyle}
                placeholder="new-folder"
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    const name = (e.target as HTMLInputElement).value.trim();
                    if (name && ctxMenu?.node.path) {
                      try { await createDir(`${ctxMenu.node.path}/${name}`); refreshTree(); } catch {}
                    }
                    setCtxShowNewFolder(false);
                  } else if (e.key === "Escape") setCtxShowNewFolder(false);
                }}
              />
            </div>
          )}
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
                }}
                  onClick={() => handleOpenFile(r.file)}
                  title={`Click to open ${r.file}:${r.line}`}
                >
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
            loading={gitLoading}
            error={gitError}
            onCommit={handleGitCommit}
            onRefresh={handleGitRefresh}
            onPush={handleGitPush}
            onPull={handleGitPull}
            onFetch={handleGitFetch}
            onCreateBranch={handleGitCreateBranch}
            onDiscardFile={handleGitDiscard}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
            onStashSave={handleGitStashSave}
            onStashPop={handleGitStashPop}
            onStashApply={handleGitStashApply}
            onStashDrop={handleGitStashDrop}
            onLoadStashes={handleGitLoadStashes}
            stashes={gitStashes}
            onLogLoad={handleGitLoadLog}
            logEntries={gitLogEntries}
            onSwitchBranch={async (name) => {
              await gitSwitchBranch(name).catch(() => {});
              handleGitRefresh();
            }}
            onStageFile={async (path) => {
              const file = gitFiles.find((f) => f.path === path);
              if (file?.staged) {
                await gitUnstage(path).catch(() => {});
              } else {
                await gitStage(path).catch(() => {});
              }
              handleGitRefresh();
            }}
          />
        )
      )}
      {view === "ai" && <ChatPanel selectionContext={selectionContext} editorContext={editorContext} />}
      {view === "rag" && (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 8px", fontSize: 11, fontWeight: 600,
            color: "var(--text-secondary)", textTransform: "uppercase",
            letterSpacing: "0.5px", borderBottom: "1px solid var(--border-color)",
          }}>
            <span>{t("sidebar.rag")}</span>
            <button
              onClick={async () => {
                setRagLoading(true);
                setRagError(null);
                try {
                  const stats = await ragRebuild();
                  setRagStatsData(stats);
                } catch (e) {
                  setRagError(String(e));
                } finally {
                  setRagLoading(false);
                }
              }}
              disabled={ragLoading}
              title={t("rag.rebuild")}
              style={{
                background: "none", border: "none", color: "var(--text-secondary)",
                cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1,
              }}
            >
              ↻
            </button>
          </div>

          {/* Stats bar */}
          {ragStatsData && (
            <div style={{
              padding: "4px 8px", fontSize: 11, color: "var(--text-tertiary)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex", gap: 12,
            }}>
              <span>{ragStatsData.files} files</span>
              <span>{ragStatsData.chunks} chunks</span>
            </div>
          )}

          {/* Search input */}
          <div style={{ padding: 8 }}>
            <input
              style={{
                width: "100%", padding: "6px 8px",
                background: "var(--bg-tertiary)", border: "1px solid var(--border-color)",
                color: "var(--text-primary)", fontSize: 13, borderRadius: 4, outline: "none",
              }}
              placeholder={t("rag.searchPlaceholder")}
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && ragQuery.trim()) {
                  setRagLoading(true);
                  setRagError(null);
                  try {
                    const res = await ragSearch(ragQuery);
                    setRagResults(res.results);
                    if (res.results.length === 0) setRagError(t("rag.noResults"));
                  } catch (err) {
                    setRagError(String(err));
                  } finally {
                    setRagLoading(false);
                  }
                }
              }}
            />
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {ragLoading && (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("sidebar.loading")}
              </div>
            )}
            {ragError && (
              <div style={{ padding: 12, color: "var(--text-error)", fontSize: 12 }}>
                {ragError}
              </div>
            )}
            {!ragLoading && !ragError && ragResults.length > 0 && (
              <div>
                {ragResults.map((r, i) => {
                  const fileName = r.file.replace(/\\/g, "/").split("/").pop() || r.file;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "6px 8px", fontSize: 12, cursor: "pointer",
                        color: "var(--text-primary)", borderBottom: "1px solid var(--border-color)",
                      }}
                      onClick={() => handleOpenFile(r.file)}
                      title={`${r.file}:${r.start_line}-${r.end_line} (score: ${r.score.toFixed(2)})`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text-secondary)" }}>
                          {fileName}:{r.start_line}-{r.end_line}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                          {r.score.toFixed(2)}
                        </span>
                      </div>
                      <div style={{
                        color: "var(--text-secondary)", whiteSpace: "pre",
                        overflow: "hidden", textOverflow: "ellipsis",
                        fontSize: 11, fontFamily: "var(--font-mono)",
                        maxHeight: 36, lineHeight: "18px",
                      }}>
                        {r.content.slice(0, 200)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!ragLoading && !ragError && ragResults.length === 0 && !ragQuery && (
              <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("rag.searchPlaceholder")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
