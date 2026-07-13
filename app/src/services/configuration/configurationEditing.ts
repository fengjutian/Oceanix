/**
 * Configuration Persistence Bridge — connects ConfigurationService to Rust backend.
 *
 * Pattern: VSCode's configurationEditing.ts + UserSettings/WorkspaceConfiguration file watchers.
 *
 * Rust backend:
 *   settings_load()   → { user: {...}, workspace: {...} | null }
 *   settings_save()   → read-merge-write for user or workspace
 */

import type { IConfigurationPersistence } from "./configurationService";

/* ─── Tauri IPC wrappers ────────────────────────────── */

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Dynamic import so this file can be used in non-Tauri contexts (tests)
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/* ─── Tauri Persistence ─────────────────────────────── */

let _projectRoot: string | null = null;

/** Set the current project root (for workspace settings path). */
export function setProjectRootForSettings(path: string): void {
  _projectRoot = path;
}

export const tauriPersistence: IConfigurationPersistence = {
  async loadUserSettings(): Promise<Record<string, unknown>> {
    try {
      const result = await tauriInvoke<{ user: Record<string, unknown>; workspace?: Record<string, unknown> | null }>(
        "settings_load",
      );
      return result.user ?? {};
    } catch {
      return {};
    }
  },

  async loadWorkspaceSettings(): Promise<Record<string, unknown> | null> {
    try {
      const result = await tauriInvoke<{ user: Record<string, unknown>; workspace?: Record<string, unknown> | null }>(
        "settings_load",
      );
      return result.workspace ?? null;
    } catch {
      return null;
    }
  },

  async saveUserSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      await tauriInvoke("settings_save", {
        target: "user",
        settings,
      });
    } catch (e) {
      console.error("Failed to save user settings:", e);
    }
  },

  async saveWorkspaceSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      await tauriInvoke("settings_save", {
        target: "workspace",
        settings,
      });
    } catch (e) {
      console.error("Failed to save workspace settings:", e);
    }
  },
};
