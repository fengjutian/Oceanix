import { useState, useRef, useEffect, useCallback } from "react";
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

const AI_SERVER_URL = "http://127.0.0.1:11435";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
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

/**
 * ChatPanel — AI chat interface with real SSE streaming,
 * conversation history, and slash commands.
 */
export default function ChatPanel({
  selectionContext,
  editorContext,
}: {
  selectionContext?: { code: string; file: string; language: string } | null;
  editorContext?: { openFiles: string[]; activeFile: string } | null;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          messages.map((m) => ({ role: m.role, content: m.content }))
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

  // ── Send message ───────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    // Assign a conversation ID if this is the first message
    const cid = convId ?? makeConvId();
    if (!convId) setConvId(cid);

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const aiId = nextId();
    const aiMsg: ChatMessage = { id: aiId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Build context: current open files
      const contextFiles = editorContext?.openFiles?.length
        ? editorContext.openFiles
        : undefined;

      const res = await fetch(`${AI_SERVER_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, context_files: contextFiles, model: aiModel }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId
                    ? { ...m, content: m.content + delta }
                    : m
                )
              );
            }
            if (json?.error) {
              setError(json.error);
            }
          } catch {
            // skip unparseable lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming, convId, editorContext]);

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
              <span style={{ fontSize: 10, color: "var(--accent)" }}>● {t("sidebar.aiStreaming")}</span>
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
          {messages.map((msg) => (
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
                }}
              >
                {msg.role === "user" ? t("chat.you") : t("chat.ai")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.content}
                {streaming && msg.role === "assistant" && msg.content === "" && (
                  <span style={{ color: "var(--text-secondary)" }}>▊</span>
                )}
              </div>
            </GlassCard>
          ))}
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
