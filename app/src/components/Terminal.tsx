import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { terminalCreate, terminalWrite, terminalRead, terminalKill, terminalResize } from "../services/api";

interface TerminalProps {
  id?: string;
}

export default function Terminal({ id }: TerminalProps) {
  console.log("[STARTUP] Terminal mount", Math.round(performance.now()) + "ms id=" + id);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    console.log("[STARTUP] Terminal useEffect start", Math.round(performance.now()) + "ms");

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

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    // Set up PTY connection — deferred to avoid blocking startup
    let cancelled = false;

    // Defer PTY creation by 2s so the UI can render first
    const ptyTimer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const result = await terminalCreate();
        if (cancelled) return;
        termIdRef.current = result.id;

        // Poll for PTY output
        pollTimerRef.current = setInterval(async () => {
          if (cancelled) return;
          try {
            const data = await terminalRead(result.id);
            if (data && termRef.current) {
              termRef.current.write(data);
            }
          } catch {
            // Ignore read errors
          }
        }, 50); // Poll every 50ms

        // Forward user input to PTY
        term.onData((data) => {
          if (!cancelled && termIdRef.current) {
            terminalWrite(termIdRef.current, data).catch(() => {});
          }
        });

        // Handle terminal resize
        const resizeObserver = new ResizeObserver(() => {
          if (termRef.current && fitAddonRef.current) {
            fitAddonRef.current.fit();
            // Tauri PTY resize
            if (termIdRef.current && termRef.current) {
              const dims = fitAddon.proposeDimensions();
              if (dims?.cols && dims?.rows) {
                terminalResize(termIdRef.current, dims.cols, dims.rows).catch(() => {});
              }
            }
          }
        });
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }
      } catch (err) {
        if (!cancelled && termRef.current) {
          termRef.current.writeln(`Failed to start terminal: ${err}`);
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (termIdRef.current) {
        terminalKill(termIdRef.current).catch(() => {});
      }
      term.dispose();
    };
  }, [id]);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
    />
  );
}
