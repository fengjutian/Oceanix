/**
 * Settings Panel — VSCode-style registry-driven settings editor.
 *
 * Pattern: VSCode's SettingsEditor2 + SettingsTree
 *
 * Sections come from IConfigurationRegistry, values from IConfigurationService.
 * Search filters across all settings by key/description/tags.
 */

import { useState, useEffect, useMemo } from "react";
import {
  getConfigurationService,
  ConfigurationTarget,
  configurationRegistry,
  type IConfigurationPropertySchema,
  type IConfigurationNode,
  type ConfigurationProperties,
} from "../services/configuration";
import { getMcpTools, registerUserTool, removeUserTool, type McpToolDef, type UserToolDef } from "../services/api";
import { DARK_THEME, LIGHT_THEME, applyTheme } from "@oceanix/theme";
import { Search } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

interface SettingsPanelProps {
  onClose?: () => void;
}

/* ─── Widgets ───────────────────────────────────────── */

function renderSettingWidget(
  key: string,
  schema: IConfigurationPropertySchema,
  value: unknown,
  onChange: (value: unknown) => void,
  t: (k: string) => string,
): JSX.Element {
  if (schema.enum && schema.enum.length > 0) {
    return (
      <select
        value={String(value ?? schema.default ?? "")}
        onChange={(e) => {
          const v = e.target.value;
          const idx = schema.enum!.findIndex((ev) => String(ev) === v);
          onChange(schema.enum![idx]);
        }}
        style={inputStyle}
      >
        {schema.enum.map((ev, i) => (
          <option key={String(ev)} value={String(ev)}>
            {schema.enumDescriptions?.[i] ? t(schema.enumDescriptions[i]) : String(ev)}
          </option>
        ))}
      </select>
    );
  }

  switch (schema.type) {
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={Boolean(value ?? schema.default)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={Number(value ?? schema.default ?? 0)}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.step ?? 1}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...inputStyle, width: 80 }}
        />
      );
    case "string":
    default:
      if (schema.editPresentation === "multiline") {
        return (
          <textarea
            value={String(value ?? schema.default ?? "")}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...inputStyle, width: "100%", minHeight: 60, resize: "vertical" }}
          />
        );
      }
      return (
        <input
          type="text"
          value={String(value ?? schema.default ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, width: "100%" }}
        />
      );
  }
}

/* ─── Component ─────────────────────────────────────── */

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { t } = useLocale();
  const service = getConfigurationService();
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState("appearance");
  // Trigger re-render on config changes
  const [, setTick] = useState(0);

  // MCP Tools state (kept separate from config service)
  const [mcpTools, setMcpTools] = useState<McpToolDef[]>([]);
  const [userTools, setUserTools] = useState<UserToolDef[]>([]);
  const [mcpToolsLoading, setMcpToolsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTool, setNewTool] = useState({
    name: "", description: "", type: "shell" as "shell" | "python",
    code: "", scope: "project" as "project" | "global",
    paramsStr: "",
  });
  const [toolError, setToolError] = useState("");

  // Get sections and properties from registry
  const sections = useMemo(() => configurationRegistry.getConfigurationSections(), []);
  const allProperties = useMemo(() => configurationRegistry.getConfigurationProperties(), []);

  // Force re-render when registry or config changes
  useEffect(() => {
    const unsub1 = service.onDidChangeConfiguration(() => setTick((n) => n + 1));
    const unsub2 = configurationRegistry.onDidChange(() => setTick((n) => n + 1));
    return () => { unsub1(); unsub2(); };
  }, [service]);

  // Load MCP tools
  useEffect(() => {
    setMcpToolsLoading(true);
    getMcpTools()
      .then((result) => { setMcpTools(result.tools); setUserTools(result.user_tools); })
      .catch(() => { setMcpTools([]); setUserTools([]); })
      .finally(() => setMcpToolsLoading(false));
  }, []);

  const handleChange = (key: string, value: unknown) => {
    service.updateValue(key, value, ConfigurationTarget.USER);
    // Special: apply theme immediately
    if (key === "appearance.theme") {
      applyTheme(value === "vs-dark" ? DARK_THEME : LIGHT_THEME);
    }
  };

  // Build settings list for the active group (or search results)
  const filteredSettings = useMemo(() => {
    const searchLower = search.trim().toLowerCase();

    if (searchLower) {
      // Search across ALL registered settings
      const results: Array<{ key: string; schema: IConfigurationPropertySchema; sectionId: string }> = [];
      for (const [fullKey, schema] of Object.entries(allProperties)) {
        const sectionId = fullKey.split(".")[0];
        const label = t(fullKey);
        const desc = t(schema.description);
        const tags = schema.tags?.join(" ") ?? "";
        const haystack = `${fullKey} ${label} ${desc} ${tags}`.toLowerCase();
        if (haystack.includes(searchLower)) {
          results.push({ key: fullKey, schema, sectionId });
        }
      }
      return results;
    }

    // Filter by active group (section)
    const section = sections.find((s) => s.id === activeGroup);
    if (!section) return [];
    return Object.entries(section.properties).map(([propKey, schema]) => ({
      key: `${section.id}.${propKey}`,
      schema,
      sectionId: section.id,
    }));
  }, [search, activeGroup, sections, allProperties, t]);

  // MCP Tools handlers
  const handleAddTool = async () => {
    setToolError("");
    if (!newTool.name.trim() || !newTool.code.trim()) {
      setToolError("Name and code are required.");
      return;
    }
    const parameters = newTool.paramsStr
      .split(",").map((s) => s.trim()).filter(Boolean)
      .map((part) => {
        const [name, type, ...desc] = part.split(":");
        return { name: name.trim(), type: (type || "str").trim(), description: desc.join(":").trim() };
      });
    try {
      const created = await registerUserTool({
        name: newTool.name.trim(), description: newTool.description.trim(),
        type: newTool.type, code: newTool.code, parameters, scope: newTool.scope,
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
    } catch (e: any) { setToolError(e.message); }
  };

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
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 18,
          }}>×</button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--border-color)" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-tertiary)", borderRadius: 4, padding: "4px 10px",
        }}>
          <Search size={14} style={{ color: "var(--text-secondary)" }} />
          <input
            style={{
              flex: 1, background: "none", border: "none", color: "var(--text-primary)",
              fontSize: 13, outline: "none",
            }}
            placeholder={t("settings.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left TOC (hidden when searching) */}
        {!search.trim() && (
          <div style={{
            width: 180, borderRight: "1px solid var(--border-color)",
            overflow: "auto", padding: "8px 0", flexShrink: 0,
          }}>
            {sections.map((section) => (
              <div
                key={section.id}
                onClick={() => setActiveGroup(section.id)}
                style={{
                  padding: "6px 16px", fontSize: 13, cursor: "pointer",
                  color: activeGroup === section.id ? "var(--text-primary)" : "var(--text-secondary)",
                  background: activeGroup === section.id ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                {t(section.title)}
              </div>
            ))}
            <div
              onClick={() => setActiveGroup("mcp")}
              style={{
                padding: "6px 16px", fontSize: 13, cursor: "pointer",
                color: activeGroup === "mcp" ? "var(--text-primary)" : "var(--text-secondary)",
                background: activeGroup === "mcp" ? "var(--bg-tertiary)" : "transparent",
              }}
            >
              {t("settings.group.mcpTools")}
            </div>
          </div>
        )}

        {/* Right: settings list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* MCP Tools custom view */}
          {activeGroup === "mcp" && !search.trim() ? (
            mcpToolsLoading ? (
              <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("sidebar.loading")}
              </div>
            ) : (mcpTools.length === 0 && userTools.length === 0) ? (
              <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                {t("settings.mcpTools.unavailable")}
              </div>
            ) : (
              <div>
                {/* Built-in tools */}
                {mcpTools.map((tool) => (
                  <div key={tool.name} style={{
                    padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <code style={{
                        background: "var(--bg-tertiary)", padding: "1px 6px", borderRadius: 3,
                        fontSize: 12, color: "var(--accent-color, #4fc1ff)",
                        fontFamily: "var(--font-mono)",
                      }}>{tool.name}</code>
                      <span style={{
                        fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)",
                        padding: "0 4px", borderRadius: 2,
                      }}>built-in</span>
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
                            <span style={{ color: "var(--text-tertiary)" }}>: {p.type}</span>
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
                        }}>{tool.name}</code>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>{tool.type}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-tertiary)", padding: "0 4px", borderRadius: 2 }}>{tool.source}</span>
                      </div>
                      <button onClick={() => handleDeleteTool(tool.name)} style={{
                        background: "none", border: "none", color: "var(--text-secondary)",
                        cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 3,
                      }} title={t("settings.mcpTools.delete")}>×</button>
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
                            <span style={{ color: "var(--text-tertiary)" }}>: {p.type}</span>
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
                        <input style={{ ...inputStyle, flex: 1 }} placeholder={t("settings.mcpTools.namePlaceholder")}
                          value={newTool.name} onChange={(e) => setNewTool({ ...newTool, name: e.target.value })} />
                        <select value={newTool.type} onChange={(e) => setNewTool({ ...newTool, type: e.target.value as "shell" | "python" })}
                          style={{ ...inputStyle, width: 100 }}>
                          <option value="shell">Shell</option>
                          <option value="python">Python</option>
                        </select>
                        <select value={newTool.scope} onChange={(e) => setNewTool({ ...newTool, scope: e.target.value as "project" | "global" })}
                          style={{ ...inputStyle, width: 100 }}>
                          <option value="project">{t("settings.mcpTools.scopeProject")}</option>
                          <option value="global">{t("settings.mcpTools.scopeGlobal")}</option>
                        </select>
                      </div>
                      <input style={inputStyle} placeholder={t("settings.mcpTools.descPlaceholder")}
                        value={newTool.description} onChange={(e) => setNewTool({ ...newTool, description: e.target.value })} />
                      <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "var(--font-mono)" }}
                        placeholder={newTool.type === "shell" ? 'echo "Hello {name}"' : 'def run(name: str) -> str:\n    return f"Hello {name}"'}
                        value={newTool.code} onChange={(e) => setNewTool({ ...newTool, code: e.target.value })} />
                      <input style={inputStyle} placeholder={t("settings.mcpTools.paramsPlaceholder")}
                        value={newTool.paramsStr} onChange={(e) => setNewTool({ ...newTool, paramsStr: e.target.value })} />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => { setShowAddForm(false); setToolError(""); }}
                          style={{ ...btnStyle, background: "var(--bg-tertiary)" }}>{t("settings.mcpTools.cancel")}</button>
                        <button onClick={handleAddTool} style={btnStyle}>{t("settings.mcpTools.save")}</button>
                      </div>
                    </div>
                  </div>
                )}

                {!showAddForm && (
                  <div style={{ padding: "8px 16px" }}>
                    <button onClick={() => setShowAddForm(true)} style={{
                      background: "var(--bg-tertiary)", border: "1px dashed var(--border-color)",
                      color: "var(--text-secondary)", padding: "6px 14px", borderRadius: 4,
                      cursor: "pointer", fontSize: 12, width: "100%",
                    }}>+ {t("settings.mcpTools.addTool")}</button>
                  </div>
                )}
              </div>
            )
          ) : (
            /* Standard settings rendering */
            filteredSettings.map(({ key, schema }) => {
              const inspected = service.inspect(key);
              const value = inspected.value;
              const isModified = inspected.source !== "default";

              return (
                <div key={key} style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--border-color)",
                  display: "flex", alignItems: "flex-start", gap: 16, minHeight: 60,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                      {key}
                      {isModified && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, color: "var(--text-tertiary)",
                          background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 2,
                        }}>
                          {inspected.source === "user" ? "User" : inspected.source === "workspace" ? "Workspace" : "Memory"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {t(schema.description)}
                    </div>
                    {/* Show default value */}
                    {inspected.defaultValue !== undefined && inspected.source !== "default" && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                        Default: {String(inspected.defaultValue)}
                      </div>
                    )}
                  </div>
                  <div style={{ width: 180, flexShrink: 0 }}>
                    {renderSettingWidget(key, schema, value, (v) => handleChange(key, v), t)}
                  </div>
                </div>
              );
            })
          )}

          {/* Empty state */}
          {filteredSettings.length === 0 && !search.trim() && activeGroup !== "mcp" && (
            <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
              No settings registered for this category.
            </div>
          )}
          {filteredSettings.length === 0 && search.trim() && (
            <div style={{ padding: 16, color: "var(--text-secondary)", fontSize: 13 }}>
              No settings found for "{search}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)", color: "var(--text-primary)",
  border: "1px solid var(--border-color)", borderRadius: 4,
  padding: "4px 8px", fontSize: 13, outline: "none",
};

const btnStyle: React.CSSProperties = {
  background: "var(--accent-color, #4fc1ff)", color: "#fff",
  border: "none", borderRadius: 4, padding: "4px 12px",
  fontSize: 12, cursor: "pointer",
};
