import { FileTree, FileNode } from "@oceanix/file-tree";
import { EditorTab } from "./EditorTabs";
import OutlinePanel from "./OutlinePanel";
import { useState, useCallback, useEffect, useRef } from "react";
import { FilePlus, FolderPlus, Pencil, Sparkles, Trash2 } from "lucide-react";
import {
  readDir, readFile, readFileBase64,
  createFile, createDir, deleteFile, renameFile,
} from "../services/api";

interface FileExplorerProps {
  projectRoot: string;
  onOpenFile?: (tab: EditorTab) => void;
  onFileSelect?: (path: string) => void;
  onFileTreeLoaded?: (files: Array<{ path: string; name: string }>) => void;
  onOpenInAgent?: (path: string) => void;
  editorContext?: { openFiles: string[]; activeFile: string; activeLanguage?: string } | null;
}

// Files/dirs to skip when building the tree
const SKIP = new Set([
  ".git", "node_modules", "target", "dist", ".next",
  "__pycache__", ".venv", "venv", ".idea", ".vscode",
  ".DS_Store", "Thumbs.db",
]);

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

/**
 * Build the root tree node (shallow — only the root directory entry).
 * Children are loaded lazily via onExpandDir.
 */
async function buildRootNode(dirPath: string, dirName: string): Promise<FileNode> {
  return {
    name: dirName,
    path: dirPath,
    type: "directory",
    children: [],
  };
}

/**
 * Load immediate children of a directory (called by onExpandDir).
 */
async function loadDirChildren(dirPath: string): Promise<FileNode[]> {
  const entries = await readDir(dirPath);
  const children: FileNode[] = [];

  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    if (entry.isDir) {
      children.push({
        name: entry.name,
        path: entry.path,
        type: "directory",
        children: [],           // will be loaded on expand
        childrenLoaded: false,  // not yet loaded
      });
    } else {
      const ext = entry.name.includes(".")
        ? entry.name.split(".").pop()?.toLowerCase() || ""
        : "";
      children.push({
        name: entry.name,
        path: entry.path,
        type: "file",
        extension: ext,
      });
    }
  }

  // Sort: directories first, then alphabetical (case-insensitive like VSCode)
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return children;
}

export default function FileExplorer({
  projectRoot,
  onOpenFile,
  onFileSelect,
  onFileTreeLoaded,
  onOpenInAgent,
  editorContext,
}: FileExplorerProps) {
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const ctxMenuRef = useRef<FileNode | null>(null);
  const [ctxNewName, setCtxNewName] = useState("");
  const [ctxShowRename, setCtxShowRename] = useState(false);
  const [ctxShowNewFile, setCtxShowNewFile] = useState(false);
  const [ctxShowNewFolder, setCtxShowNewFolder] = useState(false);

  // Context menu styles
  const ctxItemStyle: React.CSSProperties = {
    padding: "4px 12px", cursor: "pointer",
    color: "var(--text-primary)",
    display: "flex", alignItems: "center", gap: 8,
  };
  const ctxSepStyle: React.CSSProperties = {
    height: 1, background: "var(--border-color)", margin: "4px 0",
  };
  const inlineInputStyle: React.CSSProperties = {
    flex: 1, padding: "2px 6px", fontSize: 12,
    background: "var(--bg-tertiary)", border: "1px solid var(--accent-color)",
    color: "var(--text-primary)", borderRadius: 2, outline: "none",
  };

  // Reset file tree when project root changes
  useEffect(() => {
    setFileTree(null);
  }, [projectRoot]);

  // Load root node (shallow — children are lazy)
  useEffect(() => {
    if (fileTree) return;

    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);

    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const rootName = projectRoot.split(/[/\\]/).pop() || projectRoot;
        const rootNode = await buildRootNode(projectRoot, rootName);
        if (!cancelled) {
          // Eager-load first-level children so the root is expanded with content
          const children = await loadDirChildren(projectRoot);
          rootNode.children = children;
          rootNode.childrenLoaded = true;
          setFileTree(rootNode);
          setTreeLoading(false);
          // Notify parent of flat file list for quick-open
          onFileTreeLoaded?.(flattenFiles(rootNode));
        }
      } catch (err) {
        if (!cancelled) {
          setTreeError(String(err));
          setTreeLoading(false);
        }
      }
    }, 100);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectRoot, fileTree, onFileTreeLoaded]);

  // Lazy-load directory children on expand
  const handleExpandDir = useCallback(async (dirPath: string): Promise<void> => {
    setFileTree((prev) => {
      if (!prev) return prev;
      // Mark directory as loading
      const markLoading = (node: FileNode): FileNode => {
        if (node.path === dirPath && node.type === "directory") {
          return { ...node, isLoading: true };
        }
        if (node.children) {
          return { ...node, children: node.children.map(markLoading) };
        }
        return node;
      };
      return markLoading(prev);
    });

    try {
      const children = await loadDirChildren(dirPath);
      setFileTree((prev) => {
        if (!prev) return prev;
        const updateNode = (node: FileNode): FileNode => {
          if (node.path === dirPath && node.type === "directory") {
            return { ...node, children, childrenLoaded: true, isLoading: false };
          }
          if (node.children) {
            return { ...node, children: node.children.map(updateNode) };
          }
          return node;
        };
        const updated = updateNode(prev);
        // Notify parent of updated flat file list (deferred to avoid setState-during-render)
        queueMicrotask(() => onFileTreeLoaded?.(flattenFiles(updated)));
        return updated;
      });
    } catch {
      setFileTree((prev) => {
        if (!prev) return prev;
        const clearLoading = (node: FileNode): FileNode => {
          if (node.path === dirPath && node.type === "directory") {
            return { ...node, isLoading: false, childrenLoaded: true };
          }
          if (node.children) {
            return { ...node, children: node.children.map(clearLoading) };
          }
          return node;
        };
        return clearLoading(prev);
      });
    }
  }, [onFileTreeLoaded]);

  // Reload file tree
  const refreshTree = useCallback(() => {
    setFileTree(null);
  }, []);

  // File open handler
  const handleOpenFile = useCallback(async (path: string) => {
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
  }, [onFileSelect, onOpenFile]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tree content */}
      <div style={{ flex: 1, overflow: "hidden" }}>
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
          <FileTree
            root={fileTree}
            onOpenFile={handleOpenFile}
            onExpandDir={handleExpandDir}
            onRefresh={refreshTree}
            onContextMenu={(node, e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, node });
            }}
          />
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
                <div style={ctxItemStyle} onClick={() => {
                  ctxMenuRef.current = ctxMenu.node;
                  setCtxShowNewFile(true); setCtxMenu(null);
                }}><FilePlus size={14} /> New File</div>
                <div style={ctxItemStyle} onClick={() => {
                  ctxMenuRef.current = ctxMenu.node;
                  setCtxShowNewFolder(true); setCtxMenu(null);
                }}><FolderPlus size={14} /> New Folder</div>
                <div style={ctxSepStyle} />
              </>
            )}
            <div style={ctxItemStyle} onClick={() => {
              ctxMenuRef.current = ctxMenu.node;
              setCtxNewName(ctxMenu.node.name); setCtxShowRename(true); setCtxMenu(null);
            }}><Pencil size={14} /> Rename</div>
            {ctxMenu.node.type === "file" && (
              <div style={ctxItemStyle} onClick={() => {
                const n = ctxMenu.node;
                setCtxMenu(null);
                onOpenInAgent?.(n.path);
              }}><Sparkles size={14} /> Open in Agent</div>
            )}
            <div style={{ ...ctxItemStyle, color: "#f44747" }} onClick={async () => {
              const n = ctxMenu.node;
              setCtxMenu(null);
              if (window.confirm(`Delete "${n.name}"?`)) {
                try { await deleteFile(n.path); refreshTree(); } catch { /* ignore */ }
              }
            }}><Trash2 size={14} /> Delete</div>
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
                const oldPath = ctxMenuRef.current?.path;
                const oldName = ctxMenuRef.current?.name;
                if (oldPath && ctxNewName && ctxNewName !== oldName) {
                  const dir = oldPath.replace(/[/\\][^/\\]*$/, "");
                  try { await renameFile(oldPath, `${dir}/${ctxNewName}`); refreshTree(); } catch { /* ignore */ }
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
                if (name && ctxMenuRef.current?.path) {
                  try { await createFile(`${ctxMenuRef.current.path}/${name}`); refreshTree(); } catch { /* ignore */ }
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
                if (name && ctxMenuRef.current?.path) {
                  try { await createDir(`${ctxMenuRef.current.path}/${name}`); refreshTree(); } catch { /* ignore */ }
                }
                setCtxShowNewFolder(false);
              } else if (e.key === "Escape") setCtxShowNewFolder(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
