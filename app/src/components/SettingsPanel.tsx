import { useState, useEffect, useMemo } from "react";
import { loadSettings, saveSettings, getMcpTools, registerUserTool, removeUserTool, type EditorSettings, type McpToolDef, type UserToolDef } from "../services/api";
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
  "MCP Tools": "settings.group.mcpTools",
};

// ── Component ──────────────────────────────────────────

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useLocale();
  const [settings, setSettings] = useState<EditorSettings>({} as EditorSettings);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("Appearance");
  const [mcpTools, setMcpTools] = useState<McpToolDef[]>([]);
  const [userTools, setUserTools] = useState<UserToolDef[]>([]);
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTool, setNewTool] = useState({
    name: "", description: "", type: "shell" as "shell" | "python",
    code: "", scope: "project" as "project" | "global",
    paramsStr: "", // comma-separated "name:type:desc"
  });
  const [toolError, setToolError] = useState("");

  const settingGroups = useMemo(() => getSettingGroups(t as (key: string) => string), [t]);

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    setMcpToolsLoading(true);
    getMcpTools()
      .then((result) => {
        setMcpTools(result.tools);
        setUserTools(result.user_tools);
      })
      .catch(() => { setMcpTools([]); setUserTools([]); })
      .finally(() => setMcpToolsLoading(false));
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

  const handleAddTool = async () => {
    setToolError("");
    if (!newTool.name.trim() || !newTool.code.trim()) {
      setToolError("Name and code are required.");
      return;
    }
    // Parse params: "name:type:desc,name2:type:desc"
    const parameters = newTool.paramsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, type, ...desc] = part.split(":");
        return { name: name.trim(), type: (type || "str").trim(), description: desc.join(":").trim() };
      });

    try {
      const created = await registerUserTool({
        name: newTool.name.trim(),
        description: newTool.description.trim(),
        type: newTool.type,
        code: newTool.code,
        parameters,
        scope: newTool.scope,
      });
      setUserTools((prev) => [...prev.filter((t) => t.name !== created.name), created]);
      setShowAddForm(false);
      setNewTool({ name: "", description: "", type: "shell", code: "", scope: "project", paramsStr: "" });
    } catch (e: any) {
      setToolError(e.message);
    }
  };

  const handleDeleteTool = async (name: string) => {
    try {
      await removeUserTool(name);
      setUserTools((prev) => prev.filter((t) => t.name !== name));
    } catch (e: any) {
      setToolError(e.message);
    }
  };

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
            <div
              onClick={() => setActiveGroup("MCP Tools")}
              style={{
                padding: "6px 16px", fontSize: 13, cursor: "pointer",
                color: activeGroup === "MCP Tools" ? "var(--text-primary)" : "var(--text-secondary)",
                background: activeGroup === "MCP Tools" ? "var(--bg-tertiary)" : "transparent",
              }}
            >
              {t("settings.group.mcpTools")}
            </div>
          </div>
        )}

        {/* Right: settings list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* MCP Tools custom view */}
          {activeGroup === "MCP Tools" && !search.trim() ? (
            mcpToolsLoading ? (
              <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>{t("sidebar.loading")}</div>
            ) : (mcpTools.length === 0 && userTools.length === 0) ? (
              <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("settings.mcpTools.unavailable")}
              </div>
            ) : (
              <div>
                {/* Tool list */}
                {mcpTools.map((tool) => (
                  <div key={tool.name} style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <code style={{
                        background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 3,
                        fontSize: 12, color: "var(--accent-color, #4fc1ff)", fontFamily: "var(--font-mono)",
                      }}>
                        {tool.name}
                      </code>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary, #888)", background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>
                        built-in
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
                      {tool.description}
                    </div>
                    {tool.parameters.length > 0 && (
                      <div style={{
                        background: "var(--bg-tertiary)", borderRadius: 4, padding: "6px 10px",
                        fontSize: 12, fontFamily: "var(--font-mono)",
                      }}>
                        {tool.parameters.map((p, i) => (
                          <div key={p.name} style={{ color: "var(--text-secondary)", marginTop: i > 0 ? 2 : 0 }}>
                            <span style={{ color: "var(--accent-color, #4fc1ff)" }}>{p.name}</span>
                            <span style={{ color: "var(--text-tertiary, #888)" }}>: {p.type}</span>
                            <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>— {p.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* User tools */}
                {userTools.map((tool) => (
                  <div key={tool.name} style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                    borderLeft: "3px solid #4fc1ff",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{
                          background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 3,
                          fontSize: 12, color: "#4fc1ff", fontFamily: "var(--font-mono)",
                        }}>
                          {tool.name}
                        </code>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>
                          {tool.type}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>
                          {tool.source}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteTool(tool.name)} style={{
                        background: "none", border: "none", color: "var(--text-secondary)",
                        cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 3,
                      }} title={t("settings.mcpTools.delete")}>
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
                      {tool.description}
                    </div>
                    {tool.parameters.length > 0 && (
                      <div style={{
                        background: "var(--bg-tertiary)", borderRadius: 4, padding: "6px 10px",
                        fontSize: 12, fontFamily: "var(--font-mono)",
                      }}>
                        {tool.parameters.map((p, i) => (
                          <div key={p.name} style={{ color: "var(--text-secondary)", marginTop: i > 0 ? 2 : 0 }}>
                            <span style={{ color: "var(--accent-color, #4fc1ff)" }}>{p.name}</span>
                            <span style={{ color: "var(--text-tertiary, #888)" }}>: {p.type}</span>
                            <span style={{ marginLeft: 8, color: "var(--text-secondary)" }}>— {p.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 11, color: "var(--text-tertiary)", cursor: "pointer" }}>
                        {t("settings.mcpTools.showCode")}
                      </summary>
                      <pre style={{
                        margin: "4px 0 0", padding: "6px 8px", background: "var(--bg-tertiary)",
                        borderRadius: 4, fontSize: 11, overflow: "auto", maxHeight: 120,
                        color: "var(--text-secondary)",
                      }}>{tool.code}</pre>
                    </details>
                  </div>
                ))}

                {/* Add Tool Form */}
                {showAddForm && (
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                      {t("settings.mcpTools.newTool")}
                    </div>
                    {toolError && (
                      <div style={{ color: "#f44747", fontSize: 12, marginBottom: 8 }}>{toolError}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder={t("settings.mcpTools.namePlaceholder")}
                          value={newTool.name}
                          onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                        />
                        <select
                          value={newTool.type}
                          onChange={(e) => setNewTool({ ...newTool, type: e.target.value as "shell" | "python" })}
                          style={{ ...inputStyle, width: 100 }}
                        >
                          <option value="shell">Shell</option>
                          <option value="python">Python</option>
                        </select>
                        <select
                          value={newTool.scope}
                          onChange={(e) => setNewTool({ ...newTool, scope: e.target.value as "project" | "global" })}
                          style={{ ...inputStyle, width: 100 }}
                        >
                          <option value="project">{t("settings.mcpTools.scopeProject")}</option>
                          <option value="global">{t("settings.mcpTools.scopeGlobal")}</option>
                        </select>
                      </div>
                      <input
                        style={inputStyle}
                        placeholder={t("settings.mcpTools.descPlaceholder")}
                        value={newTool.description}
                        onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                      />
                      <textarea
                        style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "var(--font-mono)" }}
                        placeholder={newTool.type === "shell" ? 'echo "Hello {name}"' : 'def run(name: str) -> str:\n    return f"Hello {name}"'}
                        value={newTool.code}
                        onChange={(e) => setNewTool({ ...newTool, code: e.target.value })}
                      />
                      <input
                        style={inputStyle}
                        placeholder={t("settings.mcpTools.paramsPlaceholder")}
                        value={newTool.paramsStr}
                        onChange={(e) => setNewTool({ ...newTool, paramsStr: e.target.value })}
                      />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => { setShowAddForm(false); setToolError(""); }}
                          style={{ ...btnStyle, background: "var(--bg-tertiary)" }}>
                          {t("settings.mcpTools.cancel")}
                        </button>
                        <button onClick={handleAddTool} style={btnStyle}>
                          {t("settings.mcpTools.save")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Add button */}
                {!showAddForm && (
                  <div style={{ padding: "8px 16px" }}>
                    <button onClick={() => setShowAddForm(true)} style={{
                      background: "var(--bg-tertiary)", border: "1px dashed var(--border-color)",
                      color: "var(--text-secondary)", padding: "6px 14px", borderRadius: 4,
                      cursor: "pointer", fontSize: 12, width: "100%",
                    }}>
                      + {t("settings.mcpTools.addTool")}
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            /* Standard settings rendering */
            filtered.map((def) => {
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
          })
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none",
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent-color, #4fc1ff)", color: "#fff",
  border: "none", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer",
};
