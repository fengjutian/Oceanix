export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  /** File extension (lowercase, without dot), e.g. "ts", "json" */
  extension?: string;
  /** Git status indicator */
  gitStatus?: "modified" | "added" | "deleted" | "untracked" | "ignored";
  /** Whether this directory's children are currently being loaded */
  isLoading?: boolean;
  /** Whether this directory's children have been loaded (lazy loading) */
  childrenLoaded?: boolean;
}

export interface FileTreeProps {
  root: FileNode;
  onOpenFile?: (path: string) => void;
  onContextMenu?: (node: FileNode, event: React.MouseEvent) => void;
  /** Height of the tree (default: 100%) */
  height?: string | number;
  /** Called when a directory is expanded for the first time so the parent can load children */
  onExpandDir?: (path: string) => Promise<FileNode[] | void>;
  /** Currently active (focused/selected) file path */
  activePath?: string | null;
  /** Called when the user navigates to a different item */
  onSetActive?: (path: string | null) => void;
  /** Called to refresh the tree root (e.g. after file create/delete/rename) */
  onRefresh?: () => void;
}
