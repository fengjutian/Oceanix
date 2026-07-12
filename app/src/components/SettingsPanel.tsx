import { useState, useEffect, useMemo } from "react";
import { loadSettings, saveSettings, type EditorSettings } from "../services/api";
import { DARK_THEME, LIGHT_THEME, applyTheme } from "@oceanix/theme";
import { Search } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

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

function getSettingGroups(t: (key: string) => string): Record<string, SettingDef[]> {
  return {
    "Appearance": [
      { key: "theme", label: t("settings.label.theme"), description: t("settings.desc.theme"), type: "select", options: [
        { value: "vs-dark", label: t("settings.option.dark") }, { value: "vs-light", label: t("settings.option.light") },
      ]},
      { key: "fontSize", label: t("settings.label.fontSize"), description: t("settings.desc.fontSize"), type: "number", min: 10, max: 32 },
      { key: "fontFamily", label: t("settings.label.fontFamily"), description: t("settings.desc.fontFamily"), type: "text" },
      { key: "minimap", label: t("settings.label.minimap"), description: t("settings.desc.minimap"), type: "checkbox" },
    ],
    "Editor": [
      { key: "tabSize", label: t("settings.label.tabSize"), description: t("settings.desc.tabSize"), type: "select", options: [
        { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 4, label: "4" }, { value: 8, label: "8" },
      ]},
      { key: "insertSpaces", label: t("settings.label.insertSpaces"), description: t("settings.desc.insertSpaces"), type: "checkbox" },
      { key: "wordWrap", label: t("settings.label.wordWrap"), description: t("settings.desc.wordWrap"), type: "select", options: [
        { value: "off", label: t("settings.option.off") }, { value: "on", label: t("settings.option.on") }, { value: "wordWrapColumn", label: t("settings.option.wordWrapColumn") },
      ]},
      { key: "autoSave", label: t("settings.label.autoSave"), description: t("settings.desc.autoSave"), type: "select", options: [
        { value: "off", label: t("settings.option.off") }, { value: "afterDelay", label: t("settings.option.afterDelay") }, { value: "onFocusChange", label: t("settings.option.onFocusChange") },
      ]},
      { key: "autoSaveDelay", label: t("settings.label.autoSaveDelay"), description: t("settings.desc.autoSaveDelay"), type: "number", min: 500, max: 10000, step: 500 },
    ],
    "AI": [
      { key: "aiModel", label: t("settings.label.aiModel"), description: t("settings.desc.aiModel"), type: "select", options: [
        { value: "deepseek-v4-pro", label: "deepseek-v4-pro" },
        { value: "deepseek-v4-flash", label: "deepseek-v4-flash" },
      ]},
    ],
  };
}

const GROUP_I18N_KEYS: Record<string, string> = {
  "Appearance": "settings.group.appearance",
  "Editor": "settings.group.editor",
  "AI": "settings.group.ai",
};

// ── Component ──────────────────────────────────────────

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useLocale();
  const [settings, setSettings] = useState<EditorSettings>({} as EditorSettings);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Appearance");

  const settingGroups = useMemo(() => getSettingGroups(t as (key: string) => string), [t]);

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

  const allSettings = useMemo(() => Object.values(settingGroups).flat(), [settingGroups]);
  const filtered = search.trim()
    ? allSettings.filter((s) => s.label.toLowerCase().includes(search.toLowerCase()) || s.key.toLowerCase().includes(search.toLowerCase()))
    : settingGroups[activeGroup] || [];

  if (!loaded) return <div style={{ padding: 12, color: "var(--text-secondary)" }}>{t("sidebar.loading")}</div>;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
      {/* Title bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px", borderBottom: "1px solid var(--border-color)",
        fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
      }}>
        <span>{t("menu.view.settings")}</span>
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
            placeholder={t("settings.searchPlaceholder")}
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
            {Object.keys(settingGroups).map((group) => (
              <div
                key={group}
                onClick={() => setActiveGroup(group)}
                style={{
                  padding: "6px 16px", fontSize: 13, cursor: "pointer",
                  color: activeGroup === group ? "var(--text-primary)" : "var(--text-secondary)",
                  background: activeGroup === group ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                {t(GROUP_I18N_KEYS[group])}
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
