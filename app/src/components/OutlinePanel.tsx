import { useState, useEffect } from "react";
import { lspDocumentSymbol, type LspSymbol } from "../services/api";

const SYMBOL_ICONS: Record<number, string> = {
  1: "📄",  // File
  2: "📦",  // Module
  3: "📦",  // Namespace
  4: "📦",  // Package
  5: "🏷️",  // Class
  6: "🔧",  // Method
  7: "⚡",  // Property
  8: "📌",  // Field
  9: "🔌",  // Constructor
  10: "📋", // Enum
  11: "🔗", // Interface
  12: "📝", // Function
  13: "📌", // Variable
  14: "🔒", // Constant
  15: "📝", // String
  16: "🔢", // Number
  17: "✅", // Boolean
  18: "📋", // Array
  19: "{}",  // Object
  20: "🔑", // Key
  21: "🔐", // Null
  22: "📋", // EnumMember
  23: "🏗️", // Struct
  24: "🎪", // Event
  25: "⚙️", // Operator
  26: "🔤", // TypeParameter
};

interface OutlinePanelProps {
  language?: string;
  filePath?: string;
  onGoToSymbol?: (line: number) => void;
}

function SymbolRow({ sym, depth, onGoToSymbol }: { sym: LspSymbol; depth: number; onGoToSymbol?: (line: number) => void }) {
  return (
    <>
      <div
        style={{
          padding: `1px 8px 1px ${8 + depth * 12}px`,
          fontSize: 12, cursor: "pointer",
          color: "var(--text-primary)",
          display: "flex", alignItems: "center", gap: 4,
          lineHeight: "20px",
        }}
        onClick={() => onGoToSymbol?.(sym.line)}
        title={`${sym.name} (line ${sym.line + 1})`}
      >
        <span style={{ fontSize: 10, width: 16, textAlign: "center", flexShrink: 0 }}>
          {SYMBOL_ICONS[sym.kind] || "📝"}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sym.name}
        </span>
      </div>
      {sym.children?.map((child, i) => (
        <SymbolRow key={i} sym={child} depth={depth + 1} onGoToSymbol={onGoToSymbol} />
      ))}
    </>
  );
}

export default function OutlinePanel({ language, filePath, onGoToSymbol }: OutlinePanelProps) {
  const [symbols, setSymbols] = useState<LspSymbol[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!language || !filePath) { setSymbols([]); return; }
    if (!["rust", "python", "typescript", "typescriptreact", "javascript"].includes(language)) {
      setSymbols([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    lspDocumentSymbol(language, filePath)
      .then((s) => { if (!cancelled) setSymbols(s); })
      .catch(() => { if (!cancelled) setSymbols([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [language, filePath]);

  if (loading) {
    return <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>Loading...</div>;
  }

  if (symbols.length === 0) {
    return <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 12 }}>No symbols found</div>;
  }

  return (
    <div style={{ overflow: "auto", padding: "4px 0" }}>
      {symbols.map((sym, i) => (
        <SymbolRow key={i} sym={sym} depth={0} onGoToSymbol={onGoToSymbol} />
      ))}
    </div>
  );
}
