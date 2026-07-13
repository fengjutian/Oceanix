import { GitBranch } from "lucide-react";

interface StatusBarProps {
  currentLine: number;
  currentColumn: number;
  encoding: string;
  indentMode: string;
  language: string;
  branch?: string;
}

export default function StatusBar({
  currentLine,
  currentColumn,
  encoding,
  indentMode,
  language,
  branch,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      {branch && <span className="status-item"><GitBranch size={12} style={{ marginRight: 3 }} />{branch}</span>}
      <span style={{ flex: 1 }} />
      <span className="status-item">Ln {currentLine}, Col {currentColumn}</span>
      <span className="status-item">{encoding}</span>
      <span className="status-item">{indentMode}</span>
      <span className="status-item">{language}</span>
    </div>
  );
}
