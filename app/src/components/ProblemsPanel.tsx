import { useState } from "react";

interface Problem {
  severity: "error" | "warning" | "info";
  message: string;
  file: string;
  line: number;
  column: number;
}

const SEVERITY_ICONS: Record<string, string> = {
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "#f44747",
  warning: "#e2b714",
  info: "#75beff",
};

// Initial placeholder — will be populated by LSP once implemented
const DEMO_PROBLEMS: Problem[] = [];

export default function ProblemsPanel() {
  const [problems] = useState<Problem[]>(DEMO_PROBLEMS);

  if (problems.length === 0) {
    return (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-secondary)", fontSize: 13,
      }}>
        No problems detected — LSP not yet connected
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflow: "auto", fontSize: 12 }}>
      {problems.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "2px 8px", borderBottom: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <span style={{ color: SEVERITY_COLORS[p.severity], width: 16, textAlign: "center" }}>
            {SEVERITY_ICONS[p.severity]}
          </span>
          <span style={{ flex: 1 }}>{p.message}</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {p.file}:{p.line}:{p.column}
          </span>
        </div>
      ))}
    </div>
  );
}
