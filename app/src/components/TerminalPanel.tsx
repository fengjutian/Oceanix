import { useState, useCallback } from "react";
import Terminal from "./Terminal";

interface TermInstance {
  id: string;
  label: string;
}

export default function TerminalPanel() {
  const [terms, setTerms] = useState<TermInstance[]>([
    { id: "term-1", label: "1: shell" },
  ]);
  const [activeTermId, setActiveTermId] = useState("term-1");
  const counterRef = { current: 1 };

  const newTerminal = useCallback(() => {
    counterRef.current += 1;
    const id = `term-${counterRef.current}`;
    setTerms((prev) => [...prev, { id, label: `${counterRef.current}: shell` }]);
    setActiveTermId(id);
  }, []);

  const killTerminal = useCallback((id: string) => {
    setTerms((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTermId && next.length > 0) {
        const idx = prev.findIndex((t) => t.id === id);
        setActiveTermId(next[Math.min(idx, next.length - 1)].id);
      }
      if (next.length === 0) {
        // Re-create at least one terminal
        counterRef.current += 1;
        const newId = `term-${counterRef.current}`;
        setActiveTermId(newId);
        return [{ id: newId, label: `${counterRef.current}: shell` }];
      }
      return next;
    });
  }, [activeTermId]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Terminal sub-tabs */}
      <div style={{
        display: "flex", alignItems: "center",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
      }}>
        <div style={{ display: "flex", flex: 1, overflow: "auto" }}>
          {terms.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveTermId(t.id)}
              style={{
                padding: "2px 10px", fontSize: 12, cursor: "pointer",
                color: t.id === activeTermId ? "var(--text-primary)" : "var(--text-secondary)",
                background: t.id === activeTermId ? "var(--bg-primary)" : "transparent",
                borderRight: "1px solid var(--border-color)",
                display: "flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              <span>{t.label}</span>
              {terms.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                  style={{ fontSize: 14, fontWeight: "bold", opacity: 0.6 }}
                  title="Kill terminal"
                >×</span>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={newTerminal}
          title="New Terminal"
          style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 16, padding: "2px 8px", lineHeight: 1,
          }}
        >+</button>
      </div>

      {/* Active terminal */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {terms.map((t) => (
          <div
            key={t.id}
            style={{
              height: "100%", width: "100%",
              display: t.id === activeTermId ? "block" : "none",
            }}
          >
            <Terminal id={t.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
