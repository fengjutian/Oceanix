import React, { useState, useRef, useEffect } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  /** Tool call results rendered as cards */
  toolResults?: Array<{ name: string; input: unknown; output: string }>;
}

interface AiChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isLoading: boolean;
  /** Current token usage for the budget bar */
  tokenUsage?: { used: number; total: number };
}

const STYLES: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-secondary, #252526)",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  messageBubble: {
    padding: "8px 12px",
    borderRadius: 8,
    maxWidth: "85%",
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "var(--accent, #007acc)",
    color: "#fff",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    background: "var(--bg-tertiary, #2d2d30)",
    color: "var(--text-primary, #ccc)",
  },
  inputArea: {
    padding: "8px 12px",
    borderTop: "1px solid var(--border-color, #3e3e42)",
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    background: "var(--bg-tertiary, #2d2d30)",
    border: "1px solid var(--border-color, #3e3e42)",
    borderRadius: 6,
    color: "var(--text-primary, #ccc)",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    padding: "8px 16px",
    background: "var(--accent, #007acc)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  tokenBar: {
    height: 3,
    background: "var(--bg-tertiary, #2d2d30)",
    position: "relative" as const,
  },
  tokenFill: {
    height: "100%",
    background: "var(--accent, #007acc)",
    transition: "width 0.3s",
  },
  toolCard: {
    background: "var(--bg-primary, #1e1e1e)",
    border: "1px solid var(--border-color, #3e3e42)",
    borderRadius: 6,
    padding: "8px 12px",
    marginTop: 6,
    fontSize: 12,
  },
  toolName: {
    fontWeight: 600,
    color: "var(--accent, #007acc)",
    marginBottom: 4,
  },
  toolOutput: {
    color: "var(--text-secondary, #858585)",
    fontFamily: "monospace",
    whiteSpace: "pre-wrap",
    maxHeight: 120,
    overflowY: "auto",
  },
  slashHint: {
    fontSize: 11,
    color: "var(--text-secondary, #858585)",
    padding: "4px 0",
    display: "flex",
    gap: 12,
  },
};

export function AiChatPanel({ messages, onSend, isLoading, tokenUsage }: AiChatPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={STYLES.container}>
      {tokenUsage && (
        <div style={STYLES.tokenBar} title={`${tokenUsage.used} / ${tokenUsage.total} tokens`}>
          <div style={{ ...STYLES.tokenFill, width: `${(tokenUsage.used / tokenUsage.total) * 100}%` }} />
        </div>
      )}
      <div style={STYLES.messages}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", padding: 24 }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>Oceanix AI</p>
            <p style={{ fontSize: 12 }}>
              Ask anything about your code. Use /review, /test, /explain, or /fix.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              style={{
                ...STYLES.messageBubble,
                ...(msg.role === "user" ? STYLES.userBubble : STYLES.assistantBubble),
              }}
            >
              {msg.content}
            </div>
            {msg.toolResults?.map((tr, i) => (
              <div key={i} style={STYLES.toolCard}>
                <div style={STYLES.toolName}>🔧 {tr.name}</div>
                <div style={STYLES.toolOutput}>{tr.output}</div>
              </div>
            ))}
          </div>
        ))}
        {isLoading && (
          <div style={{ ...STYLES.messageBubble, ...STYLES.assistantBubble }}>
            <span className="loading-dots">Thinking</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={STYLES.inputArea}>
        <input
          style={STYLES.input}
          placeholder="Ask Oceanix..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button style={STYLES.sendBtn} onClick={handleSend} disabled={isLoading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
