/**
 * Agent Settings — now unified with ConfigurationService (MEMORY layer).
 *
 * Pattern: VSCode-style — settings read/written via IConfigurationService.
 * Agent-specific settings are registered under the "ai" section.
 */

import { useState, useEffect } from "react";
import { GlassBtn } from "@oceanix/glass";
import { getConfigurationService, ConfigurationTarget } from "../services/configuration";

interface AgentSettingsProps {
  open: boolean;
  onClose: () => void;
}

export default function AgentSettings({ open, onClose }: AgentSettingsProps) {
  const service = getConfigurationService();

  // Local state mirrors the MEMORY layer for fast UI updates
  const [model, setModel] = useState("");
  const [maxSteps, setMaxSteps] = useState(10);
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");

  useEffect(() => {
    if (open) {
      setModel(service.getValue<string>("ai.chatModel") ?? "");
      setMaxSteps(service.getValue<number>("ai.maxSteps") ?? 10);
      setTemperature(service.getValue<number>("ai.temperature") ?? 0.7);
      setSystemPrompt(service.getValue<string>("ai.systemPrompt") ?? "");
    }
  }, [open, service]);

  if (!open) return null;

  const persist = () => {
    service.updateValue("ai.chatModel", model, ConfigurationTarget.USER);
    service.updateValue("ai.maxSteps", maxSteps, ConfigurationTarget.USER);
    service.updateValue("ai.temperature", temperature, ConfigurationTarget.USER);
    service.updateValue("ai.systemPrompt", systemPrompt, ConfigurationTarget.USER);
    onClose();
  };

  const handleReset = () => {
    setModel("");
    setMaxSteps(10);
    setTemperature(0.7);
    setSystemPrompt("");
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-tertiary, #2d2d30)",
    color: "var(--text-primary, #ccc)",
    border: "1px solid var(--border-color, #3e3e42)",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-secondary, #858585)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0,
      width: 280, background: "var(--bg-secondary, #252526)",
      borderLeft: "1px solid var(--border-color, #3e3e42)",
      zIndex: 20, display: "flex", flexDirection: "column",
      boxShadow: "-4px 0 16px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderBottom: "1px solid var(--border-color, #3e3e42)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #ccc)" }}>
          ⚙ Agent Settings
        </span>
        <GlassBtn onClick={onClose} style={{ fontSize: 12, padding: "2px 6px", minWidth: "unset" }}>
          ✕
        </GlassBtn>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {/* Model */}
        <label style={labelStyle}>Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
        >
          <option value="">Auto (default)</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="claude-sonnet">Claude Sonnet</option>
          <option value="claude-haiku">Claude Haiku</option>
          <option value="gemini-pro">Gemini Pro</option>
          <option value="deepseek-v3">DeepSeek V3</option>
        </select>

        {/* Max Steps */}
        <label style={{ ...labelStyle, marginTop: 16 }}>Max Steps</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={1} max={50}
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent, #007acc)" }}
          />
          <span style={{ fontSize: 13, color: "var(--text-primary, #ccc)", minWidth: 24, textAlign: "center" }}>
            {maxSteps}
          </span>
        </div>

        {/* Temperature */}
        <label style={{ ...labelStyle, marginTop: 16 }}>Temperature</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range" min={0} max={2} step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent, #007acc)" }}
          />
          <span style={{ fontSize: 13, color: "var(--text-primary, #ccc)", minWidth: 28, textAlign: "center" }}>
            {temperature.toFixed(1)}
          </span>
        </div>

        {/* System Prompt */}
        <label style={{ ...labelStyle, marginTop: 16 }}>System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Optional: override the default system prompt..."
          rows={5}
          style={{ ...inputStyle, width: "100%", resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
        />
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 12px",
        borderTop: "1px solid var(--border-color, #3e3e42)",
      }}>
        <GlassBtn onClick={handleReset} style={{ fontSize: 12 }}>Reset</GlassBtn>
        <div style={{ flex: 1 }} />
        <GlassBtn accent onClick={persist} style={{ fontSize: 12 }}>Save</GlassBtn>
      </div>
    </div>
  );
}
