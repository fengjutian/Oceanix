import { useState } from "react";

export interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked";
  staged: boolean;
}

export interface GitStashInfo {
  index: number;
  message: string;
  oid: string;
}

export interface GitCommitInfo {
  oid: string;
  shortOid: string;
  message: string;
  author: string;
  time: number;
}

interface GitPanelProps {
  files: GitFileStatus[];
  branch: string;
  branches?: Array<{ name: string; isHead: boolean }>;
  onStageFile?: (path: string) => void;
  onDiscardFile?: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onCommit?: (message: string) => void;
  onRefresh?: () => void;
  onSwitchBranch?: (name: string) => void;
  onCreateBranch?: (name: string) => void;
  onPush?: () => void;
  onPull?: () => void;
  onFetch?: () => void;
  onStashSave?: (message?: string) => void;
  onStashPop?: (index: number) => void;
  onStashApply?: (index: number) => void;
  onStashDrop?: (index: number) => void;
  stashes?: GitStashInfo[];
  onLoadStashes?: () => void;
  onLogLoad?: () => void;
  logEntries?: GitCommitInfo[];
  loading?: boolean;
  error?: string | null;
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

export default function GitPanel({
  files, branch, branches, onStageFile, onDiscardFile, onStageAll, onUnstageAll, onCommit, onRefresh,
  onSwitchBranch, onCreateBranch, onPush, onPull, onFetch,
  onStashSave, onStashPop, onStashApply, onStashDrop,
  stashes, onLoadStashes, onLogLoad, logEntries, loading, error,
}: GitPanelProps) {
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [stashMsg, setStashMsg] = useState("");
  const [showStash, setShowStash] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const staged = files.filter((f) => f.staged);
  const changes = files.filter((f) => !f.staged && f.status !== "untracked");
  const untracked = files.filter((f) => f.status === "untracked");

  const doCommit = () => {
    if (message.trim()) { onCommit?.(message); setMessage(""); }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-secondary)", padding: 12, overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)" }}>
          Source Control
        </span>
        <span style={{ fontSize: 12, color: "var(--accent)" }}>
          {branches && branches.length > 0 ? (
            <select
              value={branch}
              onChange={(e) => onSwitchBranch?.(e.target.value)}
              style={{
                background: "var(--bg-tertiary)", color: "var(--accent)",
                border: "1px solid var(--border-color)", borderRadius: 4,
                padding: "2px 4px", fontSize: 12, cursor: "pointer", outline: "none",
                maxWidth: 140,
              }}
            >
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  ⎇ {b.name}{b.isHead ? " *" : ""}
                </option>
              ))}
            </select>
          ) : (
            <>⎇ {branch}</>
          )}
        </span>
      </div>

      {/* Loading / Error */}
      {loading && <div style={{ color: "var(--text-secondary)", fontSize: 12, textAlign: "center", padding: 8 }}>Loading...</div>}
      {error && <div style={{ color: "#f44747", fontSize: 12, padding: 4, marginBottom: 8 }}>{error}</div>}

      {/* Action buttons row 1: Push / Pull / Fetch */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {onPush && (
          <button onClick={onPush} title="Push" style={smallBtn}>
            ↑ Push
          </button>
        )}
        {onPull && (
          <button onClick={onPull} title="Pull" style={smallBtn}>
            ↓ Pull
          </button>
        )}
        {onFetch && (
          <button onClick={onFetch} title="Fetch (no merge)" style={smallBtn}>
            ⇣ Fetch
          </button>
        )}
        <button onClick={() => { setShowNewBranch(!showNewBranch); setNewBranch(""); }} style={smallBtn}>
          + Branch
        </button>
        <button onClick={() => { setShowStash(!showStash); if (!showStash) onLoadStashes?.(); }} style={smallBtn}>
          📦 Stash
        </button>
        <button onClick={() => { setShowLog(!showLog); if (!showLog) onLogLoad?.(); }} style={smallBtn}>
          📋 Log
        </button>
        <button onClick={onRefresh} title="Refresh" style={{ ...smallBtn, marginLeft: "auto" }}>
          ↻
        </button>
      </div>

      {/* Create branch input */}
      {showNewBranch && (
        <div style={{ marginBottom: 8, display: "flex", gap: 4 }}>
          <input
            style={inputStyle}
            placeholder="New branch name..."
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newBranch.trim()) {
                onCreateBranch?.(newBranch.trim());
                setNewBranch("");
                setShowNewBranch(false);
              }
            }}
          />
          <button
            onClick={() => {
              if (newBranch.trim()) {
                onCreateBranch?.(newBranch.trim());
                setNewBranch("");
                setShowNewBranch(false);
              }
            }}
            style={smallBtn}
          >
            Create
          </button>
        </div>
      )}

      {/* Commit input */}
      <div style={{ marginBottom: 8 }}>
        <input
          style={inputStyle}
          placeholder="Commit message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey && message.trim()) doCommit();
          }}
        />
        <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
          <button style={accentBtn} onClick={doCommit}>
            Commit (Ctrl+Enter)
          </button>
        </div>
      </div>

      {/* File list — scrolled */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {/* Stash section */}
        {showStash && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              Stashes
              <div style={{ display: "flex", gap: 3 }}>
                <input style={{ ...inputStyle, padding: "2px 4px", fontSize: 11, flex: 1 }} placeholder="Stash message..."
                  value={stashMsg} onChange={(e) => setStashMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { onStashSave?.(stashMsg || undefined); setStashMsg(""); } }} />
                <button style={{ ...smallBtn, fontSize: 10 }} onClick={() => { onStashSave?.(stashMsg || undefined); setStashMsg(""); }}>Save</button>
              </div>
            </div>
            {stashes && stashes.length > 0 ? stashes.map((s) => (
              <div key={s.index} style={rowStyle}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>stash@{"{"}{s.index}{"}"}: {s.message || s.oid.slice(0, 7)}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                  <button style={{ ...smallBtn, fontSize: 10, padding: "0 4px" }} onClick={() => onStashApply?.(s.index)} title="Apply">Apply</button>
                  <button style={{ ...smallBtn, fontSize: 10, padding: "0 4px" }} onClick={() => onStashPop?.(s.index)} title="Pop">Pop</button>
                  <button style={{ ...smallBtn, fontSize: 10, padding: "0 4px", color: "#f44747" }} onClick={() => onStashDrop?.(s.index)} title="Drop">✕</button>
                </div>
              </div>
            )) : <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "2px 0" }}>No stashes</div>}
          </div>
        )}

        {/* Log section */}
        {showLog && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              Commit History
            </div>
            {logEntries && logEntries.length > 0 ? logEntries.map((c) => (
              <div key={c.oid} style={{ ...rowStyle, flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
                <div style={{ display: "flex", gap: 6, width: "100%" }}>
                  <span style={{ color: "var(--accent)", fontSize: 11, fontFamily: "monospace" }}>{c.shortOid}</span>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{c.author} · {new Date(c.time * 1000).toLocaleDateString()}</span>
              </div>
            )) : <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "2px 0" }}>No commits</div>}
          </div>
        )}

        {/* Staged changes */}
        {staged.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              Staged ({staged.length})
              {onUnstageAll && (
                <button onClick={onUnstageAll} style={{ ...smallBtn, fontSize: 10, padding: "0 6px" }} title="Unstage all">Unstage all</button>
              )}
            </div>
            {staged.map((f) => (
              <FileRow key={f.path} file={f} onStage={onStageFile} onDiscard={onDiscardFile} />
            ))}
          </div>
        )}

        {/* Changes */}
        {changes.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              Changes ({changes.length})
              {onStageAll && (
                <button onClick={onStageAll} style={{ ...smallBtn, fontSize: 10, padding: "0 6px" }} title="Stage all changes">Stage all</button>
              )}
            </div>
            {changes.map((f) => (
              <FileRow key={f.path} file={f} onStage={onStageFile} onDiscard={onDiscardFile} />
            ))}
          </div>
        )}

        {/* Untracked */}
        {untracked.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              Untracked ({untracked.length})
              {onStageAll && (
                <button onClick={onStageAll} style={{ ...smallBtn, fontSize: 10, padding: "0 6px" }} title="Stage all untracked">Stage all</button>
              )}
            </div>
            {untracked.map((f) => (
              <FileRow key={f.path} file={f} onStage={onStageFile} onDiscard={onDiscardFile} />
            ))}
          </div>
        )}

        {files.length === 0 && !showStash && !showLog && (
          <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>
            No changes detected
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ file, onStage, onDiscard }: {
  file: GitFileStatus;
  onStage?: (path: string) => void;
  onDiscard?: (path: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={{ color: STATUS_COLORS[file.status], fontWeight: 600, width: 16, fontSize: 12 }}>
        {STATUS_LABELS[file.status]}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 12 }}>
        {file.path.split("/").pop()}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 4 }}>
        {file.path}
      </span>
      {onStage && (
        <button
          onClick={(e) => { e.stopPropagation(); onStage(file.path); }}
          title={!file.staged ? "Stage" : "Unstage"}
          style={{ ...smallBtn, padding: "0 6px", fontSize: 10, flexShrink: 0 }}
        >
          {!file.staged ? "+" : "−"}
        </button>
      )}
      {onDiscard && file.status !== "untracked" && (
        <button
          onClick={(e) => { e.stopPropagation(); onDiscard(file.path); }}
          title="Discard changes"
          style={{ ...smallBtn, padding: "0 4px", fontSize: 10, color: "#f44747", flexShrink: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: "2px 8px",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-color)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
  flexShrink: 0,
};

const accentBtn: React.CSSProperties = {
  padding: "4px 12px",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-color)",
  color: "var(--text-primary)",
  fontSize: 12,
  borderRadius: 4,
  outline: "none",
  boxSizing: "border-box",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "2px 0",
  gap: 4,
  color: "var(--text-primary)",
  fontSize: 12,
};
