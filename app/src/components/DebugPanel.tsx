import { useState } from "react";
import { emitOutput } from "./OutputPanel";

export default function DebugPanel({ onRun }: { onRun?: () => void }) {
  const [running, setRunning] = useState(false);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Debug toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
        background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-color)",
      }}>
        <button
          onClick={() => { setRunning(true); onRun?.(); }}
          disabled={running}
          style={btnStyle(running)}
          title="Run"
        >▶</button>
        <button
          onClick={() => { setRunning(false); }}
          disabled={!running}
          style={btnStyle(!running)}
          title="Stop"
        >■</button>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: 8 }}>
          {running ? "Running..." : "Ready"}
        </span>
      </div>

      {/* Debug area */}
      <div style={{ flex: 1, padding: 8, fontSize: 12, color: "var(--text-secondary)", overflow: "auto" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Variables</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Paused — no debug adapter attached</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Call Stack</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Not paused</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Breakpoints</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            Click gutter to set breakpoints • F9 to toggle
          </div>
        </div>
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "2px 8px", fontSize: 12,
    background: "var(--bg-tertiary)", color: disabled ? "var(--text-tertiary)" : "var(--text-primary)",
    border: "1px solid var(--border-color)", borderRadius: 4, cursor: disabled ? "default" : "pointer",
  };
}
