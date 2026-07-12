import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, File, FileCode2, FileJson, FileText, FileImage, FileSpreadsheet, FileTerminal, FileLock, FileType2, Folder, FolderOpen, Loader2, ChevronsUpDown } from "lucide-react";
import type { FileNode, FileTreeProps } from "./types";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// VS Code–inspired inline styles
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#252526",
  text: "#cccccc",
  textDim: "#8a8a8a",
  hover: "#2a2d2e",
  active: "#37373d",
  activeSelected: "#094771",
  focusBorder: "#007acc",
  guide: "#383838",
  gitModified: "#e2b714",
  gitAdded: "#73c991",
  gitDeleted: "#f14c4c",
  gitUntracked: "#6ca3a5",
  gitIgnored: "#5a5a5a",
  fontFamily:
    '"Segoe UI", "SF Mono", "Cascadia Code", "Consolas", "Fira Code", monospace',
};

const TREE = {
  rowHeight: 22,
  indentWidth: 16,
  fontSize: 13,
};

// ---------------------------------------------------------------------------
// File-type → icon mapping (extensions without dot, lowercase)
// ---------------------------------------------------------------------------

function fileIcon(extension: string | undefined, fileName: string): LucideIcon {
  const specialFiles: Record<string, LucideIcon> = {
    "dockerfile": FileTerminal,
    "makefile": FileTerminal,
    "license": FileText,
    "readme.md": FileText,
    ".gitignore": FileLock,
    ".env": FileLock,
    ".env.local": FileLock,
    "package-lock.json": FileLock,
    "pnpm-lock.yaml": FileLock,
    "yarn.lock": FileLock,
    "cargo.lock": FileLock,
  };
  const key = fileName.toLowerCase();
  if (specialFiles[key]) return specialFiles[key];

  if (!extension) return File;

  const codeExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "go", "py", "java",
    "c", "cpp", "h", "hpp", "cs", "rb", "swift", "kt", "kts", "scala",
    "dart", "ex", "exs", "elm", "fs", "fsx", "hs", "lhs", "lua", "nim",
    "php", "pl", "pm", "r", "sol", "v", "zig",
  ]);
  if (codeExts.has(extension)) return FileCode2;

  const dataExts = new Set(["json", "yaml", "yml", "toml", "xml", "graphql", "gql"]);
  if (dataExts.has(extension)) return FileJson;

  const styleExts = new Set(["css", "scss", "less", "sass", "styl"]);
  if (styleExts.has(extension)) return FileType2;

  const markupExts = new Set(["html", "htm", "vue", "svelte", "astro", "jinja", "jinja2", "hbs", "ejs", "pug", "jade"]);
  if (markupExts.has(extension)) return FileType2;

  const docExts = new Set(["md", "mdx", "txt", "log", "rst", "tex", "wiki"]);
  if (docExts.has(extension)) return FileText;

  const imgExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff", "avif"]);
  if (imgExts.has(extension)) return FileImage;

  const sheetExts = new Set(["csv", "tsv", "xls", "xlsx", "ods"]);
  if (sheetExts.has(extension)) return FileSpreadsheet;

  const shellExts = new Set(["sh", "bash", "zsh", "fish", "ps1", "psm1", "psd1"]);
  if (shellExts.has(extension)) return FileTerminal;

  if (extension === "sql") return FileCode2;

  return File;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    height: "100%",
    overflow: "auto",
    background: COLORS.bg,
    color: COLORS.text,
    fontFamily: COLORS.fontFamily,
    fontSize: TREE.fontSize,
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
    cursor: "default",
    outline: "none",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 600 as const,
    color: COLORS.textDim,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    borderBottom: `1px solid ${COLORS.guide}`,
  },

  headerBtn: {
    background: "none",
    border: "none",
    color: COLORS.textDim,
    cursor: "pointer",
    fontSize: 14,
    padding: "0 4px",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 3,
  } satisfies React.CSSProperties,

  row: {
    base: {
      display: "flex",
      alignItems: "center",
      height: TREE.rowHeight,
      lineHeight: `${TREE.rowHeight}px`,
      paddingRight: 8,
      whiteSpace: "nowrap" as const,
      cursor: "pointer",
    } satisfies React.CSSProperties,
  },

  indentGuide: {
    display: "inline-block",
    width: 1,
    height: TREE.rowHeight,
    background: COLORS.guide,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  indentSpacer: {
    display: "inline-block",
    width: TREE.indentWidth,
    height: TREE.rowHeight,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  twistie: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: TREE.indentWidth,
    height: TREE.rowHeight,
    flexShrink: 0,
    fontSize: 10,
    color: COLORS.textDim,
  } satisfies React.CSSProperties,

  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: TREE.rowHeight,
    flexShrink: 0,
  } satisfies React.CSSProperties,

  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gitColor(status: FileNode["gitStatus"]): string {
  switch (status) {
    case "modified": return COLORS.gitModified;
    case "added": return COLORS.gitAdded;
    case "deleted": return COLORS.gitDeleted;
    case "untracked": return COLORS.gitUntracked;
    case "ignored": return COLORS.gitIgnored;
    default: return COLORS.text;
  }
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

// ---------------------------------------------------------------------------
// Indent guides
// ---------------------------------------------------------------------------

const IndentGuides: React.FC<{ depth: number }> = React.memo(({ depth }) => {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} style={styles.indentGuide} />
      ))}
    </>
  );
});
IndentGuides.displayName = "IndentGuides";

// ---------------------------------------------------------------------------
// Flatten visible tree for keyboard navigation
// ---------------------------------------------------------------------------

interface FlatItem {
  node: FileNode;
  depth: number;
}

function flattenVisible(
  node: FileNode,
  expandedDirs: Set<string>,
  depth: number,
  result: FlatItem[],
): void {
  result.push({ node, depth });
  if (node.type === "directory" && node.children && expandedDirs.has(node.path)) {
    for (const child of sortTree(node.children)) {
      flattenVisible(child, expandedDirs, depth + 1, result);
    }
  }
}

// ---------------------------------------------------------------------------
// Tree context
// ---------------------------------------------------------------------------

interface TreeContextValue {
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  activePath: string | null;
  setActivePath: (path: string | null) => void;
  onExpandDir: ((path: string) => Promise<FileNode[] | void>) | undefined;
}

const TreeContext = React.createContext<TreeContextValue | null>(null);

function useTreeState(): TreeContextValue {
  const ctx = React.useContext(TreeContext);
  if (!ctx) throw new Error("useTreeState must be used within a FileTree");
  return ctx;
}

// ---------------------------------------------------------------------------
// TreeNode
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
  onToggle: (path: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(
  ({ node, depth, expanded, onOpenFile, onContextMenu, onToggle }) => {
    const { activePath, setActivePath, onExpandDir } = useTreeState();
    const isDir = node.type === "directory";
    const isActive = activePath === node.path;

    const handleClick = useCallback(() => {
      setActivePath(node.path);
      if (isDir) {
        onToggle(node.path);
      } else {
        onOpenFile?.(node.path);
      }
    }, [isDir, node.path, onToggle, onOpenFile, setActivePath]);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        setActivePath(node.path);
        onContextMenu?.(node, e);
      },
      [node, onContextMenu, setActivePath],
    );

    // On first expand of an unloaded directory, trigger lazy load
    useEffect(() => {
      if (isDir && expanded && !node.childrenLoaded && !node.isLoading && onExpandDir) {
        onExpandDir(node.path);
      }
    }, [isDir, expanded, node.childrenLoaded, node.isLoading, node.path, onExpandDir]);

    const rowStyle: React.CSSProperties = {
      ...styles.row.base,
      paddingLeft: 0,
      color: gitColor(node.gitStatus),
      background: isActive ? COLORS.active : undefined,
    };

    const IconComp = isDir
      ? (expanded ? FolderOpen : Folder)
      : fileIcon(node.extension, node.name);
    const iconEl = isDir && node.isLoading
      ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" } as React.CSSProperties} />
      : <IconComp size={16} />;

    // Add spin keyframe style (attached once on the container, but defined here for simplicity)
    // We'll inject it in the FileTree root component instead.

    return (
      <>
        <div
          style={rowStyle}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          role="treeitem"
          aria-expanded={isDir ? expanded : undefined}
          aria-selected={isActive}
          data-path={node.path}
        >
          {depth > 0 && <IndentGuides depth={depth} />}

          <span style={styles.twistie}>
            {isDir ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </span>

          <span style={styles.icon}>{iconEl}</span>

          <span style={styles.label}>{node.name}</span>
        </div>

        {isDir && expanded && node.children && (
          <ChildrenRenderer
            nodes={node.children}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        )}
      </>
    );
  },
);
TreeNode.displayName = "TreeNode";

// ---------------------------------------------------------------------------
// ChildrenRenderer
// ---------------------------------------------------------------------------

interface ChildrenRendererProps {
  nodes: FileNode[];
  depth: number;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
}

const ChildrenRenderer: React.FC<ChildrenRendererProps> = React.memo(
  ({ nodes, depth, onOpenFile, onContextMenu }) => {
    const { expandedDirs, toggleDir } = useTreeState();

    return (
      <>
        {sortTree(nodes).map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth}
            expanded={expandedDirs.has(child.path)}
            onToggle={toggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ))}
      </>
    );
  },
);
ChildrenRenderer.displayName = "ChildrenRenderer";

// ---------------------------------------------------------------------------
// Public FileTree component
// ---------------------------------------------------------------------------

export const FileTree: React.FC<FileTreeProps> = ({
  root,
  onOpenFile,
  onContextMenu,
  onExpandDir,
  activePath: externalActive,
  onSetActive,
  onRefresh,
  height = "100%",
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set([root.path]),
  );
  const [internalActive, setInternalActive] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePath = externalActive !== undefined ? externalActive : internalActive;

  const setActivePath = useCallback((path: string | null) => {
    setInternalActive(path);
    onSetActive?.(path);
  }, [onSetActive]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set([root.path]));
    setActivePath(root.path);
  }, [root.path, setActivePath]);

  // Build flat list of visible items for keyboard navigation
  const flatItems = useMemo<FlatItem[]>(() => {
    const result: FlatItem[] = [];
    flattenVisible(root, expandedDirs, 0, result);
    return result;
  }, [root, expandedDirs]);

  // Keyboard navigation (VS Code–style)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIdx = flatItems.findIndex((f) => f.node.path === activePath);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const nextIdx = Math.min(currentIdx + 1, flatItems.length - 1);
          if (nextIdx >= 0) {
            setActivePath(flatItems[nextIdx].node.path);
            // Scroll into view
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[nextIdx].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prevIdx = Math.max(currentIdx - 1, 0);
          if (prevIdx >= 0) {
            setActivePath(flatItems[prevIdx].node.path);
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[prevIdx].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              if (!expandedDirs.has(item.node.path)) {
                toggleDir(item.node.path);
              }
            }
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory" && expandedDirs.has(item.node.path)) {
              toggleDir(item.node.path);
            }
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              toggleDir(item.node.path);
            } else {
              onOpenFile?.(item.node.path);
            }
          }
          break;
        }
        case " ":
        case "Space": {
          e.preventDefault();
          if (currentIdx >= 0) {
            const item = flatItems[currentIdx];
            if (item.node.type === "directory") {
              toggleDir(item.node.path);
            }
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          if (flatItems.length > 0) {
            setActivePath(flatItems[0].node.path);
            const el = containerRef.current?.querySelector(`[data-path="${flatItems[0].node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "End": {
          e.preventDefault();
          if (flatItems.length > 0) {
            const last = flatItems[flatItems.length - 1];
            setActivePath(last.node.path);
            const el = containerRef.current?.querySelector(`[data-path="${last.node.path}"]`);
            el?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
      }
    },
    [flatItems, activePath, expandedDirs, toggleDir, onOpenFile, setActivePath],
  );

  const ctx: TreeContextValue = { expandedDirs, toggleDir, activePath, setActivePath, onExpandDir };

  return (
    <>
      {/* Inject spinner keyframes for loading icon — only once */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <TreeContext.Provider value={ctx}>
        {/* Header toolbar */}
        <div style={styles.header}>
          <span>Explorer</span>
          <div style={{ display: "flex", gap: 2 }}>
            <button
              style={styles.headerBtn}
              onClick={collapseAll}
              title="Collapse All"
            >
              <ChevronsUpDown size={14} />
            </button>
            <button
              style={styles.headerBtn}
              onClick={onRefresh}
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Tree */}
        <div
          ref={containerRef}
          style={{ ...styles.container, height: `calc(${typeof height === "number" ? height + "px" : height} - 29px)` }}
          role="tree"
          aria-label="File tree"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <TreeNode
            node={root}
            depth={0}
            expanded={expandedDirs.has(root.path)}
            onToggle={toggleDir}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        </div>
      </TreeContext.Provider>
    </>
  );
};

FileTree.displayName = "FileTree";
