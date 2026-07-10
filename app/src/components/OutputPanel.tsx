import { useState } from "react";

interface OutputLine {
  text: string;
  channel: "stdout" | "stderr" | "info";
}

const COLORS: Record<string, string> = {
  stdout: "var(--text-primary)",
  stderr: "#f44747",
  info: "var(--text-secondary)",
};

// Placeholder — will be filled from build/task output
const DEMO_OUTPUT: OutputLine[] = [
  { text: "[Oceanix] Ready — waiting for tasks...", channel: "info" },
];

export default function OutputPanel() {
  const [lines] = useState<OutputLine[]>(DEMO_OUTPUT);

  return (
    <div style={{
      height: "100%", overflow: "auto", fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      padding: "4px 8px",
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ color: COLORS[line.channel], lineHeight: 1.6 }}>
          {line.text}
        </div>
      ))}
    </div>
  );
}
