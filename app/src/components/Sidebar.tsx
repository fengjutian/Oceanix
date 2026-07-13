import { EditorTab } from "./EditorTabs";
import FileExplorer from "./FileExplorer";
import GitPanel, { GitFileStatus, GitStashInfo, GitCommitInfo } from "./GitPanel";
import ChatPanel from "./ChatPanel";
import SearchPanel from "./SearchPanel";
import { useState, useCallback, useEffect } from "react";
import {
  readFile, readFileBase64, gitStatus, gitBranchName, gitCommit,
  gitStage, gitUnstage, gitBranches, gitSwitchBranch,
  gitPush, gitPull, gitFetch, gitCreateBranch, gitDiscard,
  gitStashSave, gitStashList, gitStashPop, gitStashApply, gitStashDrop,
  gitLog,
  ragSearch, ragRebuild,
} from "../services/api";
import type { RAGResult } from "../services/api";
import { useLocale } from "../i18n/LocaleContext";
import { RotateCw } from "lucide-react";
import { viewContainers } from "../services/viewContainerRegistry";

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
  /** Called when user chooses "Open in Agent" from context menu */
  onOpenInAgent?: (path: string) => void;
}

export default function Sidebar({ view, onOpenFile, onFileSelect, projectRoot, onFileTreeLoaded, selectionContext, editorContext, onOpenInAgent }: SidebarProps) {
  const { t } = useLocale();

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

  // File open handler (shared between explorer and search)
  const handleOpenFile = async (path: string) => {
    if (onFileSelect) {
      onFileSelect(path);
      return;
    }

    if (onOpenFile) {
      const label = path.split(/[/\\]/).pop() || path;
      const ext = label.split(".").pop()?.toLowerCase() || "";

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
        vue: "html",
      };

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

  // ─── Git ──────────────────────────────────────────

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

  const handleGitCommit = useCallback(async (message: string) => {
    try {
      await gitCommit(message);
      handleGitRefresh();
    } catch (err) {
      console.error("Commit failed:", err);
    }
  }, [handleGitRefresh]);

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

  const handleGitPush = useCallback(async () => {
    try { setGitLoading(true); await gitPush(gitBranch); handleGitRefresh(); }
    catch (err) { setGitError(`Push failed: ${err}`); }
    finally { setGitLoading(false); }
  }, [gitBranch, handleGitRefresh]);

  const handleGitPull = useCallback(async () => {
    try { setGitLoading(true); await gitPull(gitBranch); handleGitRefresh(); }
    catch (err) { setGitError(`Pull failed: ${err}`); }
    finally { setGitLoading(false); }
  }, [gitBranch, handleGitRefresh]);

  const handleGitFetch = useCallback(async () => {
    try { setGitLoading(true); await gitFetch(); handleGitRefresh(); }
    catch (err) { setGitError(`Fetch failed: ${err}`); }
    finally { setGitLoading(false); }
  }, [handleGitRefresh]);

  const handleGitCreateBranch = useCallback(async (name: string) => {
    try {
      await gitCreateBranch(name);
      await gitSwitchBranch(name);
      handleGitRefresh();
    } catch (err) { setGitError(`Create branch failed: ${err}`); }
  }, [handleGitRefresh]);

  const handleGitDiscard = useCallback(async (path: string) => {
    try { await gitDiscard(path); handleGitRefresh(); }
    catch (err) { setGitError(`Discard failed: ${err}`); }
  }, [handleGitRefresh]);

  const handleStageAll = useCallback(async () => {
    try {
      const unstaged = gitFiles.filter((f) => !f.staged);
      for (const f of unstaged) { await gitStage(f.path).catch(() => {}); }
      handleGitRefresh();
    } catch (err) { setGitError(`Stage all failed: ${err}`); }
  }, [gitFiles, handleGitRefresh]);

  const handleUnstageAll = useCallback(async () => {
    try {
      const staged = gitFiles.filter((f) => f.staged);
      for (const f of staged) { await gitUnstage(f.path).catch(() => {}); }
      handleGitRefresh();
    } catch (err) { setGitError(`Unstage all failed: ${err}`); }
  }, [gitFiles, handleGitRefresh]);

  const handleGitStashSave = useCallback(async (message?: string) => {
    try {
      await gitStashSave(message);
      handleGitRefresh();
      setGitStashes(await gitStashList().catch(() => [] as GitStashInfo[]));
    } catch (err) { setGitError(`Stash save failed: ${err}`); }
  }, [handleGitRefresh]);

  const handleGitStashPop = useCallback(async (index: number) => {
    try {
      await gitStashPop(index);
      handleGitRefresh();
      setGitStashes(await gitStashList().catch(() => [] as GitStashInfo[]));
    } catch (err) { setGitError(`Stash pop failed: ${err}`); }
  }, [handleGitRefresh]);

  const handleGitStashApply = useCallback(async (index: number) => {
    try { await gitStashApply(index); handleGitRefresh(); }
    catch (err) { setGitError(`Stash apply failed: ${err}`); }
  }, [handleGitRefresh]);

  const handleGitStashDrop = useCallback(async (index: number) => {
    try {
      await gitStashDrop(index);
      setGitStashes(await gitStashList().catch(() => [] as GitStashInfo[]));
    } catch (err) { setGitError(`Stash drop failed: ${err}`); }
  }, []);

  const handleGitLoadStashes = useCallback(async () => {
    try { setGitStashes(await gitStashList().catch(() => [] as GitStashInfo[])); } catch { /* ignore */ }
  }, []);

  const handleGitLoadLog = useCallback(async () => {
    try { setGitLogEntries(await gitLog(30).catch(() => [] as GitCommitInfo[])); } catch { /* ignore */ }
  }, []);


  return (
    <div className="sidebar">
      {view === "explorer" && (
        <FileExplorer
          projectRoot={projectRoot}
          onOpenFile={onOpenFile}
          onFileSelect={onFileSelect}
          onFileTreeLoaded={onFileTreeLoaded}
          onOpenInAgent={onOpenInAgent}
          editorContext={editorContext}
        />
      )}
      {view === "search" && (
        <SearchPanel
          projectRoot={projectRoot}
          onOpenFile={handleOpenFile}
        />
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
              <RotateCw size={14} />
            </button>
          </div>

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
      {/* ViewContainer registry fallback — renders any view registered with location="sidebar"
          that is not one of the built-in views above. */}
      {!["explorer", "search", "git", "ai", "rag"].includes(view) && (() => {
        const registered = viewContainers.getById(view);
        if (registered) {
          const ViewComponent = registered.component;
          return <ViewComponent
            projectRoot={projectRoot}
            onOpenFile={onOpenFile}
            onFileSelect={onFileSelect}
            onFileTreeLoaded={onFileTreeLoaded}
            selectionContext={selectionContext}
            editorContext={editorContext}
            onOpenInAgent={onOpenInAgent}
          />;
        }
        return null;
      })()}
    </div>
  );
}
