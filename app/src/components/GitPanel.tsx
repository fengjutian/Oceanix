import { useState } from "react";

export interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked";
}

interface GitPanelProps {
  files: GitFileStatus[];
  branch: string;
  onStageFile?: (path: string) => void;
  onCommit?: (message: string) => void;
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  modified: "#e2b714",
  added: "#4ec9b0",
  deleted: "#f44747",
  untracked: "#6a9955",
};

const STATUS_LABELS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "U",
};

export default function GitPanel({ files, branch, onStageFile, onCommit, onRefresh }: GitPanelProps) {
  const [message, setMessage] = useState("");

  const staged = files.filter((f) => f.status === "added");
  const changes = files.filter((f) => f.status === "modified" || f.status === "deleted");
  const untracked = files.filter((f) => f.status === "untracked");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)" }}>
          Source Control
        </span>
        <span style={{ fontSize: 12, color: "var(--accent)" }}>⎇ {branch}</span>
      </div>

      {/* Commit input */}
      <div style={{ marginBottom: 12 }}>
        <input
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            fontSize: 13,
            borderRadius: 4,
            outline: "none",
          }}
          placeholder="Commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey && message.trim()) {
              onCommit?.(message);
              setMessage("");
            }
          }}
        />
        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          <button
            style={{
              padding: "4px 12px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            onClick={() => { if (message.trim()) { onCommit?.(message); setMessage(""); } }}
          >
            Commit (Ctrl+Enter)
          </button>
          <button
            style={{
              padding: "4px 12px",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Staged changes */}
      {staged.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Staged ({staged.length})
          </div>
          {staged.map((f) => (
            <FileRow key={f.path} file={f} onStage={onStageFile} />
          ))}
        </div>
      )}

      {/* Changes */}
      {changes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Changes ({changes.length})
          </div>
          {changes.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </div>
      )}

      {/* Untracked */}
      {untracked.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            Untracked ({untracked.length})
          </div>
          {untracked.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </div>
      )}

      {files.length === 0 && (
        <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>
          No changes detected
        </div>
      )}
    </div>
  );
}

function FileRow({ file, onStage }: { file: GitFileStatus; onStage?: (path: string) => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "2px 0",
        fontSize: 13,
        color: "var(--text-primary)",
        gap: 6,
      }}
    >
      <span style={{ color: STATUS_COLORS[file.status], fontWeight: 600, width: 16 }}>
        {STATUS_LABELS[file.status]}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {file.path.split("/").pop()}
      </span>
      {onStage && (
        <button
          onClick={(e) => { e.stopPropagation(); onStage(file.path); }}
          title={file.status === "untracked" || file.status === "modified" ? "Stage" : "Unstage"}
          style={{
            marginLeft: "auto", padding: "0 6px", fontSize: 11,
            background: "var(--bg-tertiary)", color: "var(--text-secondary)",
            border: "1px solid var(--border-color)", borderRadius: 3, cursor: "pointer",
          }}
        >
          {file.status === "untracked" || file.status === "modified" ? "+" : "−"}
        </button>
      )}
      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        {file.path}
      </span>
    </div>
  );
}
