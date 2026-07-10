import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

interface TerminalProps {
  /** Called when user types in the terminal */
  onData?: (data: string) => void;
  /** External data to write to the terminal */
  writeData?: string;
  /** Terminal ID for multiplexing */
  id?: string;
}

export default function Terminal({ onData, writeData, id }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    term.onData((data) => {
      onData?.(data);
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    // Initial welcome message
    term.writeln("Oceanix Terminal — Phase 2");
    term.writeln("");
    term.write("$ ");

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, [id]);

  // Handle external data writes
  useEffect(() => {
    if (writeData && termRef.current) {
      termRef.current.write(writeData);
    }
  }, [writeData]);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
