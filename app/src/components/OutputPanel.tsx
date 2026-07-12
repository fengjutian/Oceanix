import { useState, useEffect } from "react";

interface OutputLine {
  text: string;
  channel: "stdout" | "stderr" | "info";
}

const COLORS: Record<string, string> = {
  stdout: "var(--text-primary)",
  stderr: "#f44747",
  info: "var(--text-secondary)",
};

// ── Global output bus ──────────────────────────

type OutputListener = (line: OutputLine) => void;
const listeners: Set<OutputListener> = new Set();

export function emitOutput(text: string, channel: OutputLine["channel"] = "info") {
  const line = { text: `[${new Date().toLocaleTimeString()}] ${text}`, channel };
  listeners.forEach((fn) => fn(line));
}

export function clearOutput() {
  listeners.forEach((fn) => fn({ text: "", channel: "info" }));
}

// ── Component ──────────────────────────────────

export default function OutputPanel() {
  const [lines, setLines] = useState<OutputLine[]>([
    { text: "[Oceanix] Output panel ready", channel: "info" },
  ]);
  const [clearSig, setClearSig] = useState(0);

  useEffect(() => {
    const handler: OutputListener = (line) => {
      if (line.text === "") { setLines([]); setClearSig((n) => n + 1); return; }
      setLines((prev) => [...prev.slice(-500), line]);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return (
    <div style={{
      height: "100%", overflow: "auto", fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      padding: "4px 8px",
    }} key={clearSig}>
      {lines.map((line, i) => (
        <div key={i} style={{ color: COLORS[line.channel], lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {line.text}
        </div>
      ))}
    </div>
  );
}
