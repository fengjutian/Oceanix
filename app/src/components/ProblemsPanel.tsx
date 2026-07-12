import { useState, useEffect } from "react";
import { lspDiagnostics, readFile, readFileBase64 } from "../services/api";
import type { EditorTab } from "./EditorTabs";

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

export default function ProblemsPanel({ onOpenFile }: { onOpenFile?: (tab: EditorTab) => void }) {
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
        No problems detected
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
            color: "var(--text-primary)", cursor: "pointer",
          }}
          onClick={async () => {
            if (!onOpenFile) return;
            const label = p.file.replace(/\\/g, "/").split("/").pop() || p.file;
            const ext = label.split(".").pop()?.toLowerCase() || "";

            // Image files
            const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp", "tiff", "avif"]);
            if (IMG_EXTS.has(ext)) {
              const mimeMap: Record<string, string> = {
                png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
                gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
                webp: "image/webp", bmp: "image/bmp", tiff: "image/tiff",
                avif: "image/avif",
              };
              try {
                const b64 = await readFileBase64(p.file);
                onOpenFile({ id: p.file, path: p.file, label, language: "image", content: `data:${mimeMap[ext]};base64,${b64}`, dirty: false });
                return;
              } catch { /* fall through */ }
            }

            const langMap: Record<string, string> = {
              ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
              rs: "rust", py: "python", java: "java", go: "go",
              css: "css", html: "html", json: "json", md: "markdown",
              sql: "sql", scss: "scss", less: "less", vue: "html",
            };
            let content = "";
            try { content = await readFile(p.file); } catch { content = `// Could not read: ${p.file}`; }
            onOpenFile({
              id: p.file, path: p.file, label,
              language: langMap[ext] || "plaintext",
              content, dirty: false,
            });
          }}
          title={`Click to open ${p.file}:${p.line}`}
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
