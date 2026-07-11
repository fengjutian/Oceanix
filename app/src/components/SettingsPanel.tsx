import { useState, useEffect } from "react";
import { loadSettings, saveSettings, type EditorSettings } from "../services/api";
import { DARK_THEME, LIGHT_THEME, applyTheme } from "@oceanix/theme";
import { Search } from "lucide-react";

interface SettingsPanelProps {
  onClose?: () => void;
}

// ── Setting definition ─────────────────────────────────

interface SettingDef {
  key: keyof EditorSettings;
  label: string;
  description: string;
  type: "select" | "number" | "checkbox" | "text";
  options?: Array<{ value: string | number | boolean; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

const SETTING_GROUPS: Record<string, SettingDef[]> = {
  "Appearance": [
    { key: "theme", label: "Color Theme", description: "Specifies the color theme used in the editor.", type: "select", options: [
      { value: "vs-dark", label: "Dark" }, { value: "vs-light", label: "Light" },
    ]},
    { key: "fontSize", label: "Font Size", description: "Controls the font size in pixels.", type: "number", min: 10, max: 32 },
    { key: "fontFamily", label: "Font Family", description: "Controls the font family.", type: "text" },
    { key: "minimap", label: "Minimap", description: "Controls whether the minimap is shown.", type: "checkbox" },
  ],
  "Editor": [
    { key: "tabSize", label: "Tab Size", description: "The number of spaces a tab is equal to.", type: "select", options: [
      { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 4, label: "4" }, { value: 8, label: "8" },
    ]},
    { key: "insertSpaces", label: "Insert Spaces", description: "Insert spaces when pressing Tab.", type: "checkbox" },
    { key: "wordWrap", label: "Word Wrap", description: "Controls how lines should wrap.", type: "select", options: [
      { value: "off", label: "Off" }, { value: "on", label: "On" }, { value: "wordWrapColumn", label: "Column" },
    ]},
    { key: "autoSave", label: "Auto Save", description: "Controls auto save of dirty editors.", type: "select", options: [
      { value: "off", label: "Off" }, { value: "afterDelay", label: "After Delay" }, { value: "onFocusChange", label: "On Focus Change" },
    ]},
    { key: "autoSaveDelay", label: "Auto Save Delay", description: "Controls the delay in ms after which auto save runs.", type: "number", min: 500, max: 10000, step: 500 },
  ],
};

function flattenSettings(): SettingDef[] {
  return Object.values(SETTING_GROUPS).flat();
}

// ── Component ──────────────────────────────────────────

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<EditorSettings>({} as EditorSettings);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Appearance");

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings({ [key]: value }).catch(() => {});
    if (key === "theme") {
      applyTheme(value === "vs-dark" ? DARK_THEME : LIGHT_THEME);
    }
  };

  const allSettings = flattenSettings();
  const filtered = search.trim()
    ? allSettings.filter((s) => s.label.toLowerCase().includes(search.toLowerCase()) || s.key.toLowerCase().includes(search.toLowerCase()))
    : SETTING_GROUPS[activeGroup] || [];

  if (!loaded) return <div style={{ padding: 12, color: "var(--text-secondary)" }}>Loading...</div>;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid var(--border-color)",
        fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
      }}>
        <span>Settings</span>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18 }}>×</button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border-color)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-tertiary)", borderRadius: 4, padding: "4px 10px" }}>
          <Search size={14} style={{ color: "var(--text-secondary)" }} />
          <input
            style={{
              flex: 1, background: "none", border: "none", color: "var(--text-primary)", fontSize: 13, outline: "none",
            }}
            placeholder="Search settings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left sidebar (hidden when searching) */}
        {!search.trim() && (
          <div style={{
            width: 180, borderRight: "1px solid var(--border-color)",
            overflow: "auto", padding: "8px 0", flexShrink: 0,
          }}>
            {Object.keys(SETTING_GROUPS).map((group) => (
              <div
                key={group}
                onClick={() => setActiveGroup(group)}
                style={{
                  padding: "6px 16px", fontSize: 13, cursor: "pointer",
                  color: activeGroup === group ? "var(--text-primary)" : "var(--text-secondary)",
                  background: activeGroup === group ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                {group}
              </div>
            ))}
          </div>
        )}

        {/* Right: settings list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.map((def) => {
            const value = settings[def.key];
            return (
              <div key={def.key} style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                display: "flex", alignItems: "flex-start", gap: 16, minHeight: 60,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{def.label}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{def.description}</div>
                </div>
                <div style={{ width: 160, flexShrink: 0 }}>
                  {def.type === "select" && def.options ? (
                    <select
                      value={String(value ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        const opt = def.options!.find((o) => String(o.value) === v);
                        if (opt) update(def.key, opt.value as EditorSettings[typeof def.key]);
                      }}
                      style={inputStyle}
                    >
                      {def.options.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  ) : def.type === "checkbox" ? (
                    <input
                      type="checkbox" checked={Boolean(value)}
                      onChange={(e) => update(def.key, e.target.checked as EditorSettings[typeof def.key])}
                    />
                  ) : def.type === "number" ? (
                    <input
                      type="number" value={Number(value) || 0}
                      min={def.min} max={def.max} step={def.step}
                      onChange={(e) => update(def.key, Number(e.target.value) as EditorSettings[typeof def.key])}
                      style={{ ...inputStyle, width: 80 }}
                    />
                  ) : (
                    <input
                      type="text" value={String(value ?? "")}
                      onChange={(e) => update(def.key, e.target.value as EditorSettings[typeof def.key])}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none",
};
