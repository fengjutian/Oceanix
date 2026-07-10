import { useState, useEffect } from "react";
import { lspDiagnostics } from "../services/api";

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

const SEVERITY_MAP: Record<number, Problem["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
};

export default function ProblemsPanel() {
  const [problems, setProblems] = useState<Problem[]>([]);

  // Poll for LSP diagnostics every 2s
  useEffect(() => {
    const interval = setInterval(async () => {
      const all: Problem[] = [];
      for (const lang of ["rust", "python", "typescript", "typescriptreact", "javascript"]) {
        try {
          const diags = await lspDiagnostics(lang);
          for (const d of diags) {
            all.push({
              severity: SEVERITY_MAP[d.severity] || "info",
              message: d.message,
              file: d.file,
              line: d.line,
              column: d.column,
            });
          }
        } catch { /* LSP not started yet */ }
      }
      setProblems(all);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

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
