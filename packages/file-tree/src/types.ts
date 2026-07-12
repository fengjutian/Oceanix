export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  /** File extension (lowercase, without dot), e.g. "ts", "json" */
  extension?: string;
  /** Git status indicator */
  gitStatus?: "modified" | "added" | "deleted" | "untracked" | "ignored";
}

export interface FileTreeProps {
  root: FileNode;
  onOpenFile?: (path: string) => void;
  onContextMenu?: (node: FileNode, event: React.MouseEvent) => void;
  /** Height of the tree (default: 100%) */
  height?: string | number;
}
