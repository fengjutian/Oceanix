// ---------------------------------------------------------------------------
// SearchPanel — Workspace text search sidebar component.
// Architecture inspired by VSCode's SearchView.
//   SearchPanel (UI) → QueryBuilder → searchInFiles() → grouped results tree.
// ---------------------------------------------------------------------------

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { searchInFiles } from "../services/api";
import type { RawSearchMatch, RawSearchResponse, FileMatch, SearchMatch } from "../search/types";

// ─── Props ────────────────────────────────────────────

interface SearchPanelProps {
  /** Root directory to search under. */
  projectRoot: string;
  /** Called when the user clicks a file to open it. */
  onOpenFile: (path: string) => void;
}

// ─── Constants ────────────────────────────────────────

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 50;
const DEFAULT_CONTEXT = 1;

// ─── Helper: group raw matches by file ────────────────

function groupByFile(raw: RawSearchMatch[]): FileMatch[] {
  const map = new Map<string, SearchMatch[]>();
  for (const m of raw) {
    const list = map.get(m.file);
    const match: SearchMatch = {
      lineNumber: m.line,
      column: m.column,
      lineText: m.text,
      matchStart: m.match_start,
      matchEnd: m.match_end,
      contextBefore: m.context_before ?? [],
      contextAfter: m.context_after ?? [],
    };
    if (list) {
      list.push(match);
    } else {
      map.set(m.file, [match]);
    }
  }

  const result: FileMatch[] = [];
  for (const [filePath, matches] of map) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    result.push({
      filePath,
      fileName: parts[parts.length - 1] ?? filePath,
      relativePath: filePath,
      folderName: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
      matches,
    });
  }
  return result;
}

// ─── Inline match highlighter ─────────────────────────

/** Renders line text with the matched portion highlighted. */
function highlightMatch(
  text: string,
  matchStart: number,
  matchEnd: number,
  accentColor: string,
): JSX.Element {
  if (matchStart >= matchEnd || matchStart >= text.length) {
    return <>{text}</>;
  }
  const before = text.slice(0, matchStart);
  const match = text.slice(matchStart, matchEnd);
  const after = text.slice(matchEnd);
  return (
    <>
      {before}
      <span style={{ background: accentColor, color: "#000", borderRadius: 2, padding: "0 1px" }}>
        {match}
      </span>
      {after}
    </>
  );
}

// ─── Component ────────────────────────────────────────

export default function SearchPanel({ projectRoot, onOpenFile }: SearchPanelProps) {
  // -- UI state --
  const [query, setQuery] = useState("");
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // -- Results state --
  const [results, setResults] = useState<FileMatch[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // -- Expanded files --
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // -- Debounce / cancel ref --
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // -- Search function --
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        setLimitHit(false);
        return;
      }

      // Cancel any in-flight search
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setSearched(true);
      try {
        const resp: RawSearchResponse = await searchInFiles({
          query: q,
          path: projectRoot,
          regex: isRegex,
          caseSensitive: isCaseSensitive,
          wholeWord: isWholeWord,
          include: includePattern || undefined,
          exclude: excludePattern || undefined,
          surroundingContext: DEFAULT_CONTEXT,
        });

        if (controller.signal.aborted) return;

        const grouped = groupByFile(resp.matches);
        setResults(grouped);
        setLimitHit(resp.limit_hit);
        // Auto-expand all files when results first arrive
        setExpandedFiles(new Set(grouped.map((f) => f.filePath)));
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [projectRoot, isCaseSensitive, isWholeWord, isRegex, includePattern, excludePattern],
  );

  // -- Cancel search --
  const cancelSearch = useCallback(() => {
    abortRef.current?.abort();
    timerRef.current && clearTimeout(timerRef.current);
    setLoading(false);
  }, []);

  // -- Debounced effect --
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, doSearch]);

  // -- Toggle file expansion --
  const toggleExpand = useCallback((fp: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fp)) next.delete(fp);
      else next.add(fp);
      return next;
    });
  }, []);

  // -- Expand / Collapse all --
  const expandAll = useCallback(() => {
    setExpandedFiles(new Set(results.map((f) => f.filePath)));
  }, [results]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  // -- Total match count --
  const totalMatches = useMemo(
    () => results.reduce((sum, f) => sum + f.matches.length, 0),
    [results],
  );

  // -- Handle Enter key to search immediately --
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        doSearch(query);
      }
      if (e.key === "Escape") {
        cancelSearch();
      }
    },
    [query, doSearch, cancelSearch],
  );

  // ── Render ──────────────────────────────────────────

  const inputBg = "var(--bg-tertiary)";
  const borderColor = "var(--border-color)";
  const textPrimary = "var(--text-primary)";
  const textSecondary = "var(--text-secondary)";
  const accentColor = "var(--accent-color, #4fc1ff)";
  const warnColor = "#e5a845";

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "2px 6px",
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    background: active ? accentColor : inputBg,
    color: active ? "#fff" : textSecondary,
    border: `1px solid ${active ? accentColor : borderColor}`,
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "monospace",
  });

  const smallBtnStyle: React.CSSProperties = {
    padding: "1px 6px",
    fontSize: 10,
    background: inputBg,
    color: textSecondary,
    border: `1px solid ${borderColor}`,
    borderRadius: 3,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Search input ── */}
      <div style={{ padding: "8px 8px 4px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          <input
            style={{
              flex: 1,
              padding: "5px 8px",
              background: inputBg,
              border: `1px solid ${borderColor}`,
              color: textPrimary,
              fontSize: 13,
              borderRadius: 4,
              outline: "none",
            }}
            placeholder="Search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {loading && (
            <button
              style={{
                ...smallBtnStyle,
                color: warnColor,
                fontWeight: 600,
              }}
              onClick={cancelSearch}
              title="Cancel search (Escape)"
            >
              ■
            </button>
          )}
        </div>

        {/* ── Toggle buttons row ── */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            style={toggleBtnStyle(isCaseSensitive)}
            onClick={() => setIsCaseSensitive((v) => !v)}
            title="Match Case"
          >
            Aa
          </button>
          <button
            style={toggleBtnStyle(isWholeWord)}
            onClick={() => setIsWholeWord((v) => !v)}
            title="Match Whole Word"
          >
            ab
          </button>
          <button
            style={toggleBtnStyle(isRegex)}
            onClick={() => setIsRegex((v) => !v)}
            title="Use Regular Expression"
          >
            .*
          </button>

          <div style={{ flex: 1 }} />

          <button
            style={{
              ...toggleBtnStyle(showFilters),
              fontSize: 11,
              fontFamily: "inherit",
            }}
            onClick={() => setShowFilters((v) => !v)}
            title="Toggle include/exclude filters"
          >
            {showFilters ? "− Filters" : "+ Filters"}
          </button>
        </div>

        {/* ── Include / Exclude (collapsible) ── */}
        {showFilters && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            <input
              style={{
                padding: "3px 6px",
                background: inputBg,
                border: `1px solid ${borderColor}`,
                color: textPrimary,
                fontSize: 12,
                borderRadius: 3,
                outline: "none",
              }}
              placeholder="files to include (e.g. *.ts)"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
            />
            <input
              style={{
                padding: "3px 6px",
                background: inputBg,
                border: `1px solid ${borderColor}`,
                color: textPrimary,
                fontSize: 12,
                borderRadius: 3,
                outline: "none",
              }}
              placeholder="files to exclude (e.g. *.css)"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      {searched && !loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "2px 8px",
            fontSize: 11,
            gap: 6,
          }}
        >
          <span style={{ color: textSecondary }}>
            {totalMatches > 0
              ? `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${results.length} file${results.length !== 1 ? "s" : ""}`
              : "No results found"}
          </span>
          {limitHit && (
            <span style={{ color: warnColor, fontSize: 10 }}>
              (results truncated)
            </span>
          )}
          {results.length > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <button style={smallBtnStyle} onClick={expandAll} title="Expand All">
                ⊞ All
              </button>
              <button style={smallBtnStyle} onClick={collapseAll} title="Collapse All">
                ⊟ All
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: "4px 12px", fontSize: 12, color: textSecondary }}>
          Searching...
        </div>
      )}

      {/* ── Results tree ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px 8px" }}>
        {results.map((fileMatch) => {
          const isExpanded = expandedFiles.has(fileMatch.filePath);
          return (
            <div key={fileMatch.filePath} style={{ marginBottom: 2 }}>
              {/* ── File header ── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 4px",
                  cursor: "pointer",
                  borderRadius: 3,
                  fontSize: 12,
                  fontWeight: 600,
                  color: textPrimary,
                  userSelect: "none",
                }}
                onClick={() => toggleExpand(fileMatch.filePath)}
                onKeyDown={(e) => { if (e.key === "Enter") toggleExpand(fileMatch.filePath); }}
                role="button"
                tabIndex={0}
              >
                <span style={{ fontSize: 10, width: 12, flexShrink: 0 }}>
                  {isExpanded ? "▾" : "▸"}
                </span>
                <span style={{ flexShrink: 0 }}>📄</span>
                <span>{fileMatch.fileName}</span>
                <span style={{ color: textSecondary, fontSize: 10, marginLeft: "auto" }}>
                  {fileMatch.folderName}
                </span>
                <span
                  style={{
                    background: inputBg,
                    borderRadius: 8,
                    padding: "0 5px",
                    fontSize: 10,
                    color: textSecondary,
                  }}
                >
                  {fileMatch.matches.length}
                </span>
              </div>

              {/* ── Match lines ── */}
              {isExpanded &&
                fileMatch.matches.map((match, mi) => (
                  <div key={`${fileMatch.filePath}-${match.lineNumber}-${mi}`}>
                    {/* Context before */}
                    {mi === 0 && rawContextLines(fileMatch, "before").map((ctx) => (
                      <ContextRow key={`ctxb-${ctx[0]}`} lineNumber={ctx[0]} text={ctx[1]} dimColor={textSecondary} />
                    ))}

                    {/* Match line */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 6,
                        padding: "2px 4px 2px 24px",
                        cursor: "pointer",
                        borderRadius: 3,
                        fontSize: 12,
                        fontFamily: "var(--font-mono, monospace)",
                        background: "transparent",
                      }}
                      onClick={() => onOpenFile(fileMatch.filePath)}
                      title={`Line ${match.lineNumber}: ${match.lineText.trim()}`}
                    >
                      <span
                        style={{
                          color: accentColor,
                          minWidth: 32,
                          textAlign: "right",
                          flexShrink: 0,
                          fontWeight: 600,
                        }}
                      >
                        {match.lineNumber}
                      </span>
                      <span
                        style={{
                          whiteSpace: "pre",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: textPrimary,
                        }}
                      >
                        {highlightMatch(match.lineText, match.matchStart, match.matchEnd, accentColor)}
                      </span>
                    </div>

                    {/* Context after */}
                    {mi === fileMatch.matches.length - 1 && rawContextLines(fileMatch, "after").map((ctx) => (
                      <ContextRow key={`ctxa-${ctx[0]}`} lineNumber={ctx[0]} text={ctx[1]} dimColor={textSecondary} />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Context line accessors ───────────────────────────

/**
 * Extract context_before or context_after lines from the FIRST or LAST match
 * in a file. We only show context once per file to avoid repetition.
 */
function rawContextLines(
  fileMatch: FileMatch,
  which: "before" | "after",
): Array<[number, string]> {
  if (fileMatch.matches.length === 0) return [];
  if (which === "before") {
    return fileMatch.matches[0].contextBefore;
  }
  return fileMatch.matches[fileMatch.matches.length - 1].contextAfter;
}

/** Renders a single context line (dimmer, smaller). */
function ContextRow({
  lineNumber,
  text,
  dimColor,
}: {
  lineNumber: number;
  text: string;
  dimColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        padding: "1px 4px 1px 24px",
        fontSize: 11,
        fontFamily: "var(--font-mono, monospace)",
        color: dimColor,
        opacity: 0.7,
      }}
    >
      <span style={{ minWidth: 32, textAlign: "right", flexShrink: 0 }}>
        {lineNumber}
      </span>
      <span style={{ whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
        {text}
      </span>
    </div>
  );
}
