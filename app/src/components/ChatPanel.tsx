import { useState, useRef, useEffect, useCallback } from "react";
import { useLocale } from "../i18n/LocaleContext";
import { GlassCard, GlassInput, GlassBtn } from "@oceanix/glass";

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

/**
 * ChatPanel — AI chat interface with real SSE streaming.
 * Connects to Oceanix AI HTTP server /chat/stream endpoint.
 */
export default function ChatPanel() {
  const { t } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

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

      const res = await fetch(`${AI_SERVER_URL}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages }),
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
  }, [input, messages, streaming]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage();
    },
    [sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
        <span>{t("sidebar.aiChat")}</span>
        {streaming && (
          <span style={{ fontSize: 10, color: "var(--accent)" }}>● {t("sidebar.aiStreaming")}</span>
        )}
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
          onChange={(e) => setInput(e.target.value)}
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
  );
}
