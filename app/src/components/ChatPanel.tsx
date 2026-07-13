import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { GlassCard, GlassInput, GlassBtn } from "@oceanix/glass";
import {
  listConversations,
  loadConversation,
  saveConversation,
  deleteConversation,
  type ConvMeta,
} from "../services/api";
import { getConfigurationService } from "../services/configuration";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const AI_SERVER_URL = "http://127.0.0.1:11435";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "agent";
  content: string;
  agentType?: "plan" | "tool_call" | "tool_result" | "result" | "error";
  agentMeta?: Record<string, unknown>;
}

let _msgId = 0;
function nextId(): string {
  return `msg-${++_msgId}-${Date.now()}`;
}

function makeConvId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Extract a title from the first user message */
function convTitle(msgs: ChatMessage[]): string {
  const first = msgs.find((m) => m.role === "user");
  if (!first) return "";
  const text = first.content.replace(/\n/g, " ").trim();
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

const SLASH_COMMANDS: Record<string, string> = {
  "/review": "Review the following code for bugs, security issues, and style problems:\n\n",
  "/test": "Generate unit tests for the following code:\n\n",
  "/explain": "Explain what the following code does in detail:\n\n",
  "/fix": "Fix the following code. Identify and correct all issues:\n\n",
  "/codebase": "Search the codebase for relevant code. Provide context about the project.\n\n",
};

// ── CodeBlock with syntax highlighting, copy, apply, insert ──

function CodeBlock({
  language,
  code,
  activeFile,
  onApplyToFile,
  onInsertAtCursor,
}: {
  language: string;
  code: string;
  activeFile?: string;
  onApplyToFile?: (code: string, targetFile: string) => void;
  onInsertAtCursor?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  const handleApply = useCallback(() => {
    if (onApplyToFile && activeFile) {
      onApplyToFile(code, activeFile);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  }, [code, activeFile, onApplyToFile]);

  const handleInsert = useCallback(() => {
    onInsertAtCursor?.(code);
  }, [code, onInsertAtCursor]);

  return (
    <div style={{ position: "relative", margin: "8px 0", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-color, #3e3e42)" }}>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "3px 8px", background: "var(--bg-tertiary, #2d2d30)",
        borderBottom: "1px solid var(--border-color, #3e3e42)",
        fontSize: 11, color: "var(--text-secondary, #999)",
      }}>
        <span style={{ fontFamily: "var(--font-mono, 'Cascadia Code', Consolas, monospace)", fontSize: 11 }}>
          {language}
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {onInsertAtCursor && (
            <GlassBtn onClick={handleInsert} style={{ fontSize: 10, padding: "1px 6px" }} title="Insert at cursor">
              ↩ Insert
            </GlassBtn>
          )}
          {onApplyToFile && activeFile && (
            <GlassBtn onClick={handleApply} style={{ fontSize: 10, padding: "1px 6px" }} title={`Apply to ${activeFile}`}>
              {applied ? "✓ Applied" : "📄 Apply"}
            </GlassBtn>
          )}
          <GlassBtn onClick={handleCopy} style={{ fontSize: 10, padding: "1px 6px" }} title="Copy code">
            {copied ? "✓ Copied" : "📋 Copy"}
          </GlassBtn>
        </div>
      </div>
      {/* Code */}
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          padding: "10px 12px",
          fontSize: 12,
          fontFamily: "var(--font-mono, 'Cascadia Code', Consolas, monospace)",
          background: "var(--bg-primary, #1e1e1e)",
        }}
        codeTagProps={{ style: { fontFamily: "inherit" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ── AgentEventCard — renders agent plan/tool_call/tool_result/result/error ──

function AgentEventCard({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const { agentType, agentMeta } = msg;

  switch (agentType) {
    case "plan": {
      const steps = (agentMeta?.steps as string[]) ?? [];
      return (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg-tertiary, #2d2d30)", border: "1px solid var(--border-color, #3e3e42)", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "var(--accent, #4fc1ff)", marginBottom: 4 }}>📋 Plan</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary, #999)" }}>
            {steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
          </ol>
        </div>
      );
    }
    case "tool_call": {
      const tool = (agentMeta?.tool as string) ?? "unknown";
      const input = (agentMeta?.input as string) ?? "";
      return (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg-tertiary, #2d2d30)", border: "1px solid var(--border-color, #3e3e42)", fontSize: 12, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-secondary)" }}>{expanded ? "▼" : "▶"}</span>
            <span style={{ fontWeight: 600, color: "#dcdcaa" }}>🔧 {tool}</span>
            <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{input.slice(0, 80)}</span>
          </div>
          {expanded && (
            <pre style={{ margin: "6px 0 0", padding: 6, background: "var(--bg-primary, #1e1e1e)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 160, overflow: "auto" }}>
              {input}
            </pre>
          )}
        </div>
      );
    }
    case "tool_result": {
      const output = (agentMeta?.output as string) ?? "";
      return (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "var(--bg-tertiary, #2d2d30)", border: "1px solid var(--border-color, #3e3e42)", fontSize: 12, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-secondary)" }}>{expanded ? "▼" : "▶"}</span>
            <span style={{ color: "#6a9955" }}>📤 Result</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 11 }}>{output.length} chars</span>
          </div>
          {expanded && (
            <pre style={{ margin: "6px 0 0", padding: 6, background: "var(--bg-primary, #1e1e1e)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 240, overflow: "auto" }}>
              {output}
            </pre>
          )}
        </div>
      );
    }
    case "result": {
      const stepsCompleted = agentMeta?.steps_completed as number | undefined;
      const files = agentMeta?.files as number | undefined;
      return (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(106, 153, 85, 0.1)", border: "1px solid #6a9955", fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: "#6a9955", marginBottom: 2 }}>✅ Completed</div>
          {stepsCompleted !== undefined && <div style={{ color: "var(--text-secondary)" }}>{stepsCompleted} steps</div>}
          {files !== undefined && <div style={{ color: "var(--text-secondary)" }}>{files} files changed</div>}
          {msg.content && (
            <div style={{ marginTop: 4, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{msg.content}</div>
          )}
        </div>
      );
    }
    case "error": {
      const message = (agentMeta?.message as string) ?? "Unknown error";
      return (
        <div style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(244, 71, 71, 0.1)", border: "1px solid #f44747", fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: "#f44747" }}>❌ Error: </span>
          <span style={{ color: "var(--text-primary)" }}>{message}</span>
        </div>
      );
    }
    default:
      return null;
  }
}

/**
 * ChatPanel — AI chat interface with real SSE streaming,
 * conversation history, and slash commands.
 */
export default function ChatPanel({
  selectionContext,
  editorContext,
  onApplyToFile,
  onInsertAtCursor,
}: {
  selectionContext?: { code: string; file: string; language: string } | null;
  editorContext?: { openFiles: string[]; activeFile: string } | null;
  onApplyToFile?: (code: string, targetFile: string) => void;
  onInsertAtCursor?: (code: string) => void;
}) {
  const { t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [convList, setConvList] = useState<ConvMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [slashMatch, setSlashMatch] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string>("deepseek-v4-pro");
  const [agentMode, setAgentMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stop generation ──────────────────────────────
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Load conversation list and settings on mount ──
  useEffect(() => {
    let cancelled = false;
    listConversations(30)
      .then((list) => {
        if (!cancelled) {
          setConvList(list);
          setHistoryLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    const aiModel = getConfigurationService().getValue<string>("ai.model") ?? "deepseek-v4-pro";
    setAiModel(aiModel);
    return () => { cancelled = true; };
  }, []);

  // ── Auto-scroll ────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Auto-save after streaming finishes ─────────────
  useEffect(() => {
    if (!streaming && messages.length > 0 && convId) {
      // Debounce save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveConversation(
          convId,
          messages.filter(m => m.role !== "agent").map((m) => ({ role: m.role === "agent" ? "assistant" : m.role, content: m.content }))
        )
          .then(() => refreshConvList())
          .catch(() => setError(t("chat.saveError")));
      }, 500);
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [streaming, messages, convId, t]);

  // ── Handle incoming selection context ──────────────
  const selectionHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectionContext || !selectionContext.code) return;
    // Avoid re-processing the same selection
    const key = `${selectionContext.file}:${selectionContext.code.slice(0, 40)}`;
    if (selectionHandledRef.current === key) return;
    selectionHandledRef.current = key;

    const ctx = `Regarding the selected code in \`${selectionContext.file}\`:\n\`\`\`${selectionContext.language || ""}\n${selectionContext.code}\n\`\`\`\n\n`;
    setInput(ctx);
  }, [selectionContext]);

  // ── Slash command detection ────────────────────────
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (value.startsWith("/")) {
      const word = value.split(/\s/)[0];
      if (SLASH_COMMANDS[word]) {
        setSlashMatch(word);
        return;
      }
      // Partial match for autocomplete hint
      const partial = Object.keys(SLASH_COMMANDS).find((k) => k.startsWith(word));
      setSlashMatch(partial ?? null);
    } else {
      setSlashMatch(null);
    }
  }, []);

  // ── Expand slash command on Tab ────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab" && slashMatch && input === slashMatch) {
        e.preventDefault();
        const template = SLASH_COMMANDS[slashMatch];
        setInput(template);
        setSlashMatch(null);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // Expand slash command on Enter too
        const word = input.trim().split(/\s/)[0];
        if (SLASH_COMMANDS[word]) {
          const template = SLASH_COMMANDS[word];
          const rest = input.trim().slice(word.length).trim();
          setInput(template + (rest ? " " + rest : ""));
          // Don't send immediately — let user add more context
          setSlashMatch(null);
          return;
        }
        sendMessage();
      }
      if (e.key === "Escape" && slashMatch) {
        setSlashMatch(null);
      }
    },
    [slashMatch, input, streaming]
  );

  // ── Refresh conversation list ──────────────────────
  const refreshConvList = useCallback(async () => {
    try {
      const list = await listConversations(30);
      setConvList(list);
    } catch {
      // silent
    }
  }, []);

  // ── Start new chat ─────────────────────────────────
  const newChat = useCallback(() => {
    setMessages([]);
    setConvId(null);
    setError(null);
    setInput("");
    setShowHistory(false);
  }, []);

  // ── Load a conversation ────────────────────────────
  const handleLoadConv = useCallback(async (id: string) => {
    try {
      const data = await loadConversation(id);
      const msgs: ChatMessage[] = (data.messages ?? []).map((m: { role: string; content: string }) => ({
        id: nextId(),
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));
      setMessages(msgs);
      setConvId(id);
      setError(null);
      setShowHistory(false);
    } catch {
      setError(t("chat.loadError"));
    }
  }, [t]);

  // ── Delete a conversation ──────────────────────────
  const handleDeleteConv = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      if (convId === id) newChat();
      setConvList((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError(t("chat.saveError"));
    }
  }, [convId, newChat, t]);

  // ── Send chat-mode message ─────────────────────────
  const sendChatMessage = useCallback(async (
    text: string, cid: string, controller: AbortController, userMsg: ChatMessage
  ) => {
    const aiId = nextId();
    const aiMsg: ChatMessage = { id: aiId, role: "assistant", content: "" };
    setMessages((prev) => [...prev, aiMsg]);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role === "agent" ? "assistant" : m.role,
        content: m.content,
      }));

      const contextFiles = editorContext?.openFiles?.length
        ? editorContext.openFiles
        : undefined;

      const res = await fetch(`${AI_SERVER_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, context_files: contextFiles, model: aiModel }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              setMessages((prev) => prev.map((m) =>
                m.id === aiId ? { ...m, content: m.content + delta } : m
              ));
            }
            if (json?.error) setError(json.error);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, editorContext, aiModel]);

  // ── Send agent-mode message ────────────────────────
  const sendAgentMessage = useCallback(async (
    text: string, cid: string, controller: AbortController, _userMsg: ChatMessage
  ) => {
    try {
      const contextFiles = editorContext?.openFiles?.length
        ? editorContext.openFiles
        : undefined;

      const res = await fetch(`${AI_SERVER_URL}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: text, context_files: contextFiles, model: aiModel }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Agent server error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;
          try {
            const event = JSON.parse(data);
            handleAgentEvent(event);
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Agent connection failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [editorContext, aiModel]);

  // ── Handle agent streaming events ──────────────────
  const handleAgentEvent = useCallback((event: { type: string; [key: string]: unknown }) => {
    switch (event.type) {
      case "plan": {
        const steps = event.steps as string[] | undefined;
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: "",
          agentType: "plan",
          agentMeta: { steps: steps ?? [] },
        }]);
        break;
      }
      case "tool_call": {
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: "",
          agentType: "tool_call",
          agentMeta: { tool: event.tool as string, input: event.input as string },
        }]);
        break;
      }
      case "tool_result": {
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: "",
          agentType: "tool_result",
          agentMeta: { output: (event.output as string)?.slice(0, 2000) ?? "" },
        }]);
        break;
      }
      case "result": {
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: (event.summary as string) ?? "",
          agentType: "result",
          agentMeta: { steps_completed: event.steps_completed as number },
        }]);
        break;
      }
      case "error": {
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: "",
          agentType: "error",
          agentMeta: { message: event.message as string },
        }]);
        break;
      }
      case "file_changes": {
        setMessages((prev) => [...prev, {
          id: nextId(), role: "agent", content: "",
          agentType: "result",
          agentMeta: { files: event.files as number, insertions: event.insertions as number, deletions: event.deletions as number },
        }]);
        break;
      }
    }
  }, []);

  // ── Send message (chat or agent mode) ──────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    const cid = convId ?? makeConvId();
    if (!convId) setConvId(cid);

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    if (agentMode) {
      await sendAgentMessage(text, cid, controller, userMsg);
    } else {
      await sendChatMessage(text, cid, controller, userMsg);
    }
  }, [input, messages, streaming, convId, editorContext, agentMode, aiModel, sendChatMessage, sendAgentMessage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage();
    },
    [sendMessage]
  );

  // ── Render ──────────────────────────────────────────
  const title = convId ? convTitle(messages) : t("sidebar.aiChat");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "row" }}>
      {/* History sidebar */}
      {showHistory && (
        <div
          style={{
            width: 200,
            minWidth: 200,
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-primary, #1e1e1e)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {t("chat.history")}
            </span>
            <GlassBtn
              onClick={newChat}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              + {t("chat.newChat")}
            </GlassBtn>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {convList.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
                {t("chat.noHistory")}
              </div>
            )}
            {convList.map((c) => (
              <div
                key={c.id}
                onClick={() => handleLoadConv(c.id)}
                style={{
                  padding: "6px 8px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-color)",
                  background: c.id === convId ? "var(--bg-tertiary, #2d2d30)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.id === convId && messages.length > 0
                      ? convTitle(messages)
                      : `Conversation ${c.id.slice(-6)}`}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>
                    {c.message_count} msgs
                  </div>
                </div>
                <span
                  onClick={(e) => handleDeleteConv(c.id, e)}
                  title={t("chat.deleteChat")}
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    marginLeft: 4,
                    flexShrink: 0,
                  }}
                >
                  ×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              onClick={() => setShowHistory((v) => !v)}
              style={{
                cursor: "pointer",
                fontSize: 14,
                opacity: showHistory ? 1 : 0.6,
                userSelect: "none",
              }}
              title={t("chat.history")}
            >
              ☰
            </span>
            <span
              style={{
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GlassBtn
              onClick={() => setAgentMode((v) => !v)}
              style={{
                fontSize: 10,
                padding: "1px 8px",
                background: agentMode ? "var(--accent, #4fc1ff)" : "transparent",
                color: agentMode ? "#000" : "var(--text-secondary)",
                border: agentMode ? "none" : "1px solid var(--border-color)",
              }}
              title={agentMode ? "Switch to Chat mode" : "Switch to Agent mode"}
            >
              {agentMode ? "⚡ Agent" : "💬 Chat"}
            </GlassBtn>
            {convId && (
              <span
                onClick={newChat}
                style={{ cursor: "pointer", fontSize: 10, opacity: 0.7 }}
                title={t("chat.newChat")}
              >
                +
              </span>
            )}
            {streaming && (
              <GlassBtn
                onClick={handleStop}
                style={{ fontSize: 10, padding: "2px 8px", background: "var(--text-error, #f44747)", color: "#fff", border: "none" }}
              >
                ■ Stop{agentMode ? " Agent" : ""}
              </GlassBtn>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: "auto",
            padding: "8px",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                padding: 16,
                color: "var(--text-secondary)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {t("chat.empty")}
            </div>
          )}
          {messages.map((msg) => {
            // Agent event messages get special rendering
            if (msg.role === "agent") {
              return <AgentEventCard key={msg.id} msg={msg} />;
            }
            // Normal user/assistant messages
            return (
            <GlassCard
              key={msg.id}
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color:
                    msg.role === "user"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{msg.role === "user" ? t("chat.you") : t("chat.ai")}</span>
                {msg.role === "assistant" && msg.content && !streaming && (
                  <GlassBtn
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                    style={{ fontSize: 10, padding: "1px 6px", opacity: 0.6 }}
                    title="Copy message"
                  >
                    📋 Copy
                  </GlassBtn>
                )}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                  wordBreak: "break-word",
                }}
                className="chat-markdown"
              >
                {msg.content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeString = String(children).replace(/\n$/, "");
                        const inline = !match && !codeString.includes("\n");
                        if (inline) {
                          return (
                            <code
                              className={className}
                              style={{
                                background: "var(--bg-tertiary, #2d2d30)",
                                padding: "1px 4px",
                                borderRadius: 3,
                                fontSize: 12,
                                fontFamily: "var(--font-mono, 'Cascadia Code', Consolas, monospace)",
                              }}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        const language = match ? match[1] : "text";
                        return (
                          <CodeBlock
                            language={language}
                            code={codeString}
                            activeFile={editorContext?.activeFile}
                            onApplyToFile={onApplyToFile}
                            onInsertAtCursor={onInsertAtCursor}
                          />
                        );
                      },
                      pre({ children }) {
                        return <>{children}</>;
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : streaming && msg.role === "assistant" ? (
                  <span style={{ color: "var(--text-secondary)" }}>▊</span>
                ) : null}
              </div>
            </GlassCard>
            );
          })}
          {error && (
            <div
              style={{
                padding: 8,
                color: "var(--text-error)",
                fontSize: 12,
              }}
            >
              {t("chat.error")} {error}
            </div>
          )}
        </div>

        {/* Slash command hint */}
        {slashMatch && (
          <div
            style={{
              padding: "2px 8px",
              fontSize: 11,
              color: "var(--accent)",
              borderTop: "1px solid var(--border-color)",
              background: "var(--bg-tertiary, #2d2d30)",
            }}
          >
            {SLASH_COMMANDS[slashMatch]
              ? `Tab/Enter to expand "${slashMatch}" — ${SLASH_COMMANDS[slashMatch].slice(0, 60)}...`
              : `Unknown command. Available: ${Object.keys(SLASH_COMMANDS).join(" ")}`}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            borderTop: "1px solid var(--border-color)",
            padding: 8,
            display: "flex",
            gap: 6,
          }}
        >
          <GlassInput
            style={{
              flex: 1,
            }}
            placeholder={streaming ? t("chat.streaming") : t("chat.placeholder")}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
          <GlassBtn
            accent
            type="submit"
            disabled={streaming || !input.trim()}
            style={{ opacity: streaming || !input.trim() ? 0.5 : 1 }}
          >
            {t("chat.send")}
          </GlassBtn>
        </form>
      </div>
    </div>
  );
}
