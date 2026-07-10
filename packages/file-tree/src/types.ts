export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
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
