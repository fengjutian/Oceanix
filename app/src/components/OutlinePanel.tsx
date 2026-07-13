import { useState, useEffect } from "react";
import { File, Package, Tag, Wrench, Zap, Pin, Plug, ClipboardList, Link, FileText, Variable, Lock, Hash, CheckSquare, Braces, Key, Box, Calendar, Settings2, Type } from "lucide-react";
import { lspDocumentSymbol, type LspSymbol } from "../services/api";

const SYMBOL_ICONS: Record<number, React.ReactNode> = {
  1: <File size={11} />,       // File
  2: <Package size={11} />,    // Module
  3: <Package size={11} />,    // Namespace
  4: <Package size={11} />,    // Package
  5: <Tag size={11} />,        // Class
  6: <Wrench size={11} />,     // Method
  7: <Zap size={11} />,        // Property
  8: <Pin size={11} />,        // Field
  9: <Plug size={11} />,       // Constructor
  10: <ClipboardList size={11} />, // Enum
  11: <Link size={11} />,      // Interface
  12: <FileText size={11} />,  // Function
  13: <Variable size={11} />,  // Variable
  14: <Lock size={11} />,      // Constant
  15: <FileText size={11} />,  // String
  16: <Hash size={11} />,      // Number
  17: <CheckSquare size={11} />, // Boolean
  18: <Braces size={11} />,    // Array
  19: <Braces size={11} />,    // Object
  20: <Key size={11} />,       // Key
  21: <Lock size={11} />,      // Null
  22: <ClipboardList size={11} />, // EnumMember
  23: <Box size={11} />,       // Struct
  24: <Calendar size={11} />,  // Event
  25: <Settings2 size={11} />, // Operator
  26: <Type size={11} />,      // TypeParameter
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
        <span style={{ fontSize: 10, width: 16, textAlign: "center", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {SYMBOL_ICONS[sym.kind] || <FileText size={11} />}
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
