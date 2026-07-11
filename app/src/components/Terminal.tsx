import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { terminalCreate, terminalWrite, terminalRead, terminalKill, terminalResize } from "../services/api";

interface TerminalProps {
  id?: string;
}

export default function Terminal({ id }: TerminalProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const termIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazy mount — defer xterm init to avoid blocking initial paint
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;
    let cancelled = false;

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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    // PTY spawn + slow poll via setTimeout chain (avoids flooding IPC)
    const ptyTimer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const result = await terminalCreate();
        if (cancelled) return;
        termIdRef.current = result.id;

        pollTimerRef.current = setInterval(async () => {
          if (cancelled) return;
          try {
            const data = await terminalRead(result.id);
            if (data && termRef.current) termRef.current.write(data);
          } catch { /* ignore */ }
        }, 50);

        term.onData((data) => {
          if (!cancelled && termIdRef.current) {
            terminalWrite(termIdRef.current, data).catch(() => {});
          }
        });

        const resizeObserver = new ResizeObserver(() => {
          if (termRef.current && fitAddonRef.current) {
            fitAddonRef.current.fit();
            if (termIdRef.current && termRef.current) {
              const dims = fitAddon.proposeDimensions();
              if (dims?.cols && dims?.rows) {
                terminalResize(termIdRef.current, dims.cols, dims.rows).catch(() => {});
              }
            }
          }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);
      } catch (err) {
        if (!cancelled && termRef.current) {
          termRef.current.writeln("Terminal unavailable: " + String(err));
        }
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(ptyTimer);
      window.removeEventListener("resize", handleResize);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (termIdRef.current) terminalKill(termIdRef.current).catch(() => {});
      term.dispose();
    };
  }, [mounted, id]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
