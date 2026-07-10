import React, { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { FileNode, FileTreeProps } from "./types";

// ---------------------------------------------------------------------------
// VS Code–inspired inline styles
// ---------------------------------------------------------------------------

const COLORS = {
  bg: "#252526",
  text: "#cccccc",
  textDim: "#8a8a8a",
  hover: "#2a2d2e",
  active: "#37373d",
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
    case "modified":
      return COLORS.gitModified;
    case "added":
      return COLORS.gitAdded;
    case "deleted":
      return COLORS.gitDeleted;
    case "untracked":
      return COLORS.gitUntracked;
    case "ignored":
      return COLORS.gitIgnored;
    default:
      return COLORS.text;
  }
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Indent guides
// ---------------------------------------------------------------------------

/** Render a stack of indent guides for one row at a given depth. */
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
// Tree node
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  onToggle: (path: string) => void;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(
  ({ node, depth, expanded, onToggle, onOpenFile, onContextMenu }) => {
    const isDir = node.type === "directory";

    const handleClick = useCallback(() => {
      if (isDir) {
        onToggle(node.path);
      } else {
        onOpenFile?.(node.path);
      }
    }, [isDir, node.path, onToggle, onOpenFile]);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        onContextMenu?.(node, e);
      },
      [node, onContextMenu],
    );

    const rowStyle: React.CSSProperties = {
      ...styles.row.base,
      paddingLeft: 0,
      color: gitColor(node.gitStatus),
    };

    // File icon: File ; directory: FolderOpen (expanded) / Folder (collapsed)
    const icon = isDir ? (expanded ? <FolderOpen size={16} /> : <Folder size={16} />) : <File size={16} />;

    return (
      <>
        <div
          style={rowStyle}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        >
          {/* Left padding: no guides for depth 0; for depth>0 render guides
              then a spacer for the final column (which holds the twistie). */}
          {depth > 0 && <IndentGuides depth={depth} />}

          {/* Twistie column (or empty spacer for files) */}
          <span style={styles.twistie}>
            {isDir ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </span>

          {/* Icon */}
          <span style={styles.icon}>{icon}</span>

          {/* Label */}
          <span style={styles.label}>{node.name}</span>
        </div>

        {/* Children */}
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
// Children renderer — own component so it can use expand-set from context
// without coupling TreeNode to the set directly.
// ---------------------------------------------------------------------------

interface ChildrenRendererProps {
  nodes: FileNode[];
  depth: number;
  onOpenFile: ((path: string) => void) | undefined;
  onContextMenu: FileTreeProps["onContextMenu"];
}

const ChildrenRenderer: React.FC<ChildrenRendererProps> = React.memo(
  ({ nodes, depth, onOpenFile, onContextMenu }) => {
    // We read expandedDirs from a tiny internal context so every TreeNode
    // does not need the whole set drilled as props.
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
// Tiny internal context to avoid threading expandedDirs through every prop
// ---------------------------------------------------------------------------

interface TreeContextValue {
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
}

const TreeContext = React.createContext<TreeContextValue | null>(null);

function useTreeState(): TreeContextValue {
  const ctx = React.useContext(TreeContext);
  if (!ctx) throw new Error("useTreeState must be used within a FileTree");
  return ctx;
}

// ---------------------------------------------------------------------------
// Public FileTree component
// ---------------------------------------------------------------------------

export const FileTree: React.FC<FileTreeProps> = ({
  root,
  onOpenFile,
  onContextMenu,
  height = "100%",
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set([root.path]),
  );

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

  const ctx: TreeContextValue = { expandedDirs, toggleDir };

  return (
    <TreeContext.Provider value={ctx}>
      <div
        style={{ ...styles.container, height }}
        role="tree"
        aria-label="File tree"
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
  );
};

FileTree.displayName = "FileTree";
