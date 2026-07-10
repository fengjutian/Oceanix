export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
}

export interface Theme {
  name: string;
  type: "dark" | "light";
  colors: ThemeColors;
}

export const DARK_THEME: Theme = {
  name: "Oceanix Dark",
  type: "dark",
  colors: {
    bgPrimary: "#1e1e1e",
    bgSecondary: "#252526",
    bgTertiary: "#2d2d30",
    borderColor: "#3e3e42",
    textPrimary: "#cccccc",
    textSecondary: "#858585",
    accent: "#007acc",
    error: "#f44747",
    warning: "#cca700",
    success: "#4ec9b0",
  },
};

export const LIGHT_THEME: Theme = {
  name: "Oceanix Light",
  type: "light",
  colors: {
    bgPrimary: "#ffffff",
    bgSecondary: "#f3f3f3",
    bgTertiary: "#ececec",
    borderColor: "#e0e0e0",
    textPrimary: "#333333",
    textSecondary: "#717171",
    accent: "#007acc",
    error: "#e51400",
    warning: "#bf8803",
    success: "#388a34",
  },
};

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty("--bg-primary", c.bgPrimary);
  root.style.setProperty("--bg-secondary", c.bgSecondary);
  root.style.setProperty("--bg-tertiary", c.bgTertiary);
  root.style.setProperty("--border-color", c.borderColor);
  root.style.setProperty("--text-primary", c.textPrimary);
  root.style.setProperty("--text-secondary", c.textSecondary);
  root.style.setProperty("--accent", c.accent);
  root.style.setProperty("--error", c.error);
  root.style.setProperty("--warning", c.warning);
  root.style.setProperty("--success", c.success);
}

export function loadVSCodeTheme(json: Record<string, unknown>): Theme | null {
  try {
    const colors: Record<string, string> = (json.colors || {}) as Record<string, string>;
    const type = (json.type as string) === "light" ? "light" : "dark";
    return {
      name: (json.name as string) || "Imported Theme",
      type,
      colors: {
        bgPrimary: colors["editor.background"] || "#1e1e1e",
        bgSecondary: colors["sideBar.background"] || "#252526",
        bgTertiary: colors["input.background"] || "#2d2d30",
        borderColor: colors["sideBar.border"] || "#3e3e42",
        textPrimary: colors["editor.foreground"] || "#cccccc",
        textSecondary: colors["editorLineNumber.foreground"] || "#858585",
        accent: colors["button.background"] || "#007acc",
        error: colors["editorError.foreground"] || "#f44747",
        warning: colors["editorWarning.foreground"] || "#cca700",
        success: colors["terminal.ansiGreen"] || "#4ec9b0",
      },
    };
  } catch {
    return null;
  }
}
