import { useState, useEffect } from "react";
import { loadSettings, saveSettings, type EditorSettings } from "../services/api";
import { DARK_THEME, LIGHT_THEME, applyTheme } from "@oceanix/theme";

interface SettingsPanelProps {
  onClose?: () => void;
}

const FIELD: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 12px", borderBottom: "1px solid var(--border-color)",
  fontSize: 13,
};

const LABEL: React.CSSProperties = {
  color: "var(--text-primary)", fontWeight: 500,
};

const INPUT: React.CSSProperties = {
  background: "var(--bg-tertiary)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: 4,
  padding: "4px 8px", fontSize: 13, outline: "none",
  width: 120,
};

const SELECT: React.CSSProperties = { ...INPUT, cursor: "pointer" };

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<EditorSettings>({
    theme: "vs-dark",
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    tabSize: 2,
    insertSpaces: true,
    wordWrap: "off",
    minimap: true,
    autoSave: "off",
    autoSaveDelay: 1500,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings({ [key]: value }).catch(() => {});
    // Apply theme immediately
    if (key === "theme") {
      applyTheme(value === "vs-dark" ? DARK_THEME : LIGHT_THEME);
    }
  };

  if (!loaded) return <div style={{ padding: 12, color: "var(--text-secondary)" }}>Loading...</div>;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--border-color)",
        fontSize: 11, fontWeight: 600, textTransform: "uppercase",
        color: "var(--text-secondary)", letterSpacing: "0.5px",
      }}>
        <span>Settings</span>
        {onClose && (
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 16,
          }}>×</button>
        )}
      </div>

      {/* Theme */}
      <div style={FIELD}>
        <span style={LABEL}>Theme</span>
        <select
          style={SELECT}
          value={settings.theme}
          onChange={(e) => update("theme", e.target.value as "vs-dark" | "vs-light")}
        >
          <option value="vs-dark">Dark</option>
          <option value="vs-light">Light</option>
        </select>
      </div>

      {/* Font Size */}
      <div style={FIELD}>
        <span style={LABEL}>Font Size</span>
        <input
          type="number"
          style={INPUT}
          value={settings.fontSize}
          min={10} max={32}
          onChange={(e) => update("fontSize", Math.max(10, Math.min(32, Number(e.target.value) || 14)))}
        />
      </div>

      {/* Font Family */}
      <div style={FIELD}>
        <span style={LABEL}>Font Family</span>
        <input
          type="text"
          style={{ ...INPUT, width: 220 }}
          value={settings.fontFamily}
          onChange={(e) => update("fontFamily", e.target.value)}
        />
      </div>

      {/* Tab Size */}
      <div style={FIELD}>
        <span style={LABEL}>Tab Size</span>
        <select
          style={SELECT}
          value={settings.tabSize}
          onChange={(e) => update("tabSize", Number(e.target.value))}
        >
          {[1, 2, 4, 8].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Insert Spaces */}
      <div style={FIELD}>
        <span style={LABEL}>Insert Spaces</span>
        <input
          type="checkbox"
          checked={settings.insertSpaces}
          onChange={(e) => update("insertSpaces", e.target.checked)}
        />
      </div>

      {/* Word Wrap */}
      <div style={FIELD}>
        <span style={LABEL}>Word Wrap</span>
        <select
          style={SELECT}
          value={settings.wordWrap}
          onChange={(e) => update("wordWrap", e.target.value as "off" | "on" | "wordWrapColumn")}
        >
          <option value="off">Off</option>
          <option value="on">On</option>
          <option value="wordWrapColumn">Column</option>
        </select>
      </div>

      {/* Minimap */}
      <div style={FIELD}>
        <span style={LABEL}>Minimap</span>
        <input
          type="checkbox"
          checked={settings.minimap}
          onChange={(e) => update("minimap", e.target.checked)}
        />
      </div>

      {/* Auto Save */}
      <div style={FIELD}>
        <span style={LABEL}>Auto Save</span>
        <select
          style={SELECT}
          value={settings.autoSave}
          onChange={(e) => update("autoSave", e.target.value as EditorSettings["autoSave"])}
        >
          <option value="off">Off</option>
          <option value="afterDelay">After Delay</option>
          <option value="onFocusChange">On Focus Change</option>
        </select>
      </div>

      {/* Auto Save Delay */}
      <div style={FIELD}>
        <span style={LABEL}>Auto Save Delay (ms)</span>
        <input
          type="number"
          style={INPUT}
          value={settings.autoSaveDelay}
          min={500} max={10000} step={500}
          onChange={(e) => update("autoSaveDelay", Number(e.target.value) || 1500)}
        />
      </div>
    </div>
  );
}
