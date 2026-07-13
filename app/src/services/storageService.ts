/**
 * StorageService — VSCode IStorageService pattern.
 *
 * Scoped key-value persistence with workspace vs global scope.
 * Currently backed by localStorage; can be swapped to Tauri's
 * filesystem storage for workspace-scoped data.
 *
 * Usage:
 *   storage.set("sidebar.visible", true, StorageScope.WORKSPACE);
 *   const visible = storage.get("sidebar.visible", StorageScope.WORKSPACE, true);
 */

export const enum StorageScope {
  /** Global: shared across all workspaces */
  GLOBAL = "global",
  /** Workspace: scoped to the current project */
  WORKSPACE = "workspace",
}

class StorageService {
  private workspacePrefix = "";

  /** Set the workspace key prefix (e.g. the project root path). */
  setWorkspace(workspaceRoot: string): void {
    this.workspacePrefix = `ws:${workspaceRoot}:`;
  }

  /** Get a stored value. Returns defaultValue if not found. */
  get<T>(key: string, scope: StorageScope, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(this.scopedKey(key, scope));
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  /** Store a value. */
  set<T>(key: string, value: T, scope: StorageScope): void {
    try {
      localStorage.setItem(this.scopedKey(key, scope), JSON.stringify(value));
    } catch {
      // Storage full or unavailable
    }
  }

  /** Remove a stored value. */
  delete(key: string, scope: StorageScope): void {
    localStorage.removeItem(this.scopedKey(key, scope));
  }

  private scopedKey(key: string, scope: StorageScope): string {
    if (scope === StorageScope.WORKSPACE && this.workspacePrefix) {
      return `${this.workspacePrefix}${key}`;
    }
    return `oceanix:${key}`;
  }
}

export const storage = new StorageService();
