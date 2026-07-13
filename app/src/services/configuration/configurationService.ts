/**
 * Configuration Service — unified read/write API for settings.
 *
 * Pattern: VSCode's IConfigurationService + WorkspaceService
 *
 * Public API:
 *   getValue<T>(key)          — resolved value from all layers
 *   inspect<T>(key)           — per-layer breakdown
 *   updateValue(key, value)   — write to target layer
 *   onDidChangeConfiguration  — event emitter
 *
 * Layers (lowest → highest):
 *   defaults → user → workspace → memory
 */

import {
  type ConfigurationProperties,
  type IConfigurationPropertySchema,
  ConfigurationTarget,
  configurationRegistry,
} from "./configurationRegistry";
import {
  ConfigurationModel,
  Configuration,
  type IConfigurationInspectValue,
} from "./configurationModels";

/* ─── Event ─────────────────────────────────────────── */

export interface ConfigurationChangeEvent {
  affectedKeys?: string[];
  source: ConfigurationTarget;
}

type Listener = (event: ConfigurationChangeEvent) => void;

/* ─── Service Interface ─────────────────────────────── */

export interface IConfigurationService {
  getValue<T>(key: string): T | undefined;
  inspect<T>(key: string): IConfigurationInspectValue<T>;
  updateValue(key: string, value: unknown, target?: ConfigurationTarget): Promise<void>;
  keys(): string[];
  getSchema(key: string): IConfigurationPropertySchema | undefined;
  getConfigurationProperties(): ConfigurationProperties;
  onDidChangeConfiguration(listener: Listener): () => void;
}

/* ─── Persistence Provider ──────────────────────────── */

export interface IConfigurationPersistence {
  loadUserSettings(): Promise<Record<string, unknown>>;
  loadWorkspaceSettings(): Promise<Record<string, unknown> | null>;
  saveUserSettings(settings: Record<string, unknown>): Promise<void>;
  saveWorkspaceSettings(settings: Record<string, unknown>): Promise<void>;
}

const noopPersistence: IConfigurationPersistence = {
  loadUserSettings: async () => ({}),
  loadWorkspaceSettings: async () => null,
  saveUserSettings: async () => {},
  saveWorkspaceSettings: async () => {},
};

/* ─── Service Implementation ────────────────────────── */

export class ConfigurationService implements IConfigurationService {
  private _configuration: Configuration;
  private _persistence: IConfigurationPersistence;
  private _listeners: Listener[] = [];
  private _initialized = false;
  /** Memory-layer flat overrides (separate from Configuration's memory model) */
  private _memoryOverrides: Record<string, unknown> = {};

  constructor(persistence: IConfigurationPersistence = noopPersistence) {
    this._persistence = persistence;
    this._configuration = new Configuration(
      ConfigurationModel.fromDefaults(configurationRegistry.getConfigurationProperties()),
    );
    configurationRegistry.onDidChange(() => {
      this._configuration.updateDefaults(
        ConfigurationModel.fromDefaults(configurationRegistry.getConfigurationProperties()),
      );
      this._syncMemoryToConfig();
      this._fire({ source: ConfigurationTarget.MEMORY, affectedKeys: undefined });
    });
  }

  async initialize(): Promise<void> {
    try {
      const userSettings = await this._persistence.loadUserSettings();
      this._configuration.updateUser(ConfigurationModel.fromFlat(userSettings));
    } catch { /* no user settings */ }

    try {
      const wsSettings = await this._persistence.loadWorkspaceSettings();
      if (wsSettings) {
        this._configuration.updateWorkspace(ConfigurationModel.fromFlat(wsSettings));
      }
    } catch { /* no workspace settings */ }

    this._initialized = true;
    this._fire({ source: ConfigurationTarget.USER, affectedKeys: undefined });
  }

  get isInitialized(): boolean { return this._initialized; }

  /* ── Read API ─────────────────────────────────────── */

  getValue<T>(key: string): T | undefined {
    // Check memory overrides first
    if (key in this._memoryOverrides) {
      return this._memoryOverrides[key] as T;
    }
    return this._configuration.getValue<T>(key);
  }

  inspect<T>(key: string): IConfigurationInspectValue<T> {
    const base = this._configuration.inspect<T>(key);
    const memoryValue = (key in this._memoryOverrides)
      ? this._memoryOverrides[key] as T
      : undefined;
    let value = base.value;
    let source = base.source;
    if (memoryValue !== undefined) {
      value = memoryValue;
      source = "memory";
    }
    return { ...base, memoryValue, value, source };
  }

  keys(): string[] {
    return [
      ...new Set([
        ...this._configuration.keys(),
        ...Object.keys(this._memoryOverrides),
      ]),
    ];
  }

  getSchema(key: string): IConfigurationPropertySchema | undefined {
    return configurationRegistry.getConfigurationProperties()[key];
  }

  getConfigurationProperties(): ConfigurationProperties {
    return configurationRegistry.getConfigurationProperties();
  }

  /* ── Write API ────────────────────────────────────── */

  async updateValue(
    key: string,
    value: unknown,
    target: ConfigurationTarget = ConfigurationTarget.MEMORY,
  ): Promise<void> {
    switch (target) {
      case ConfigurationTarget.MEMORY: {
        this._memoryOverrides[key] = value;
        this._syncMemoryToConfig();
        break;
      }
      case ConfigurationTarget.USER: {
        await this._persistence.saveUserSettings({ [key]: value });
        const userSettings = await this._persistence.loadUserSettings();
        this._configuration.updateUser(ConfigurationModel.fromFlat(userSettings));
        break;
      }
      case ConfigurationTarget.WORKSPACE: {
        await this._persistence.saveWorkspaceSettings({ [key]: value });
        const wsSettings = await this._persistence.loadWorkspaceSettings();
        if (wsSettings) {
          this._configuration.updateWorkspace(ConfigurationModel.fromFlat(wsSettings));
        }
        break;
      }
    }

    this._fire({ source: target, affectedKeys: [key] });
  }

  /* ── Events ───────────────────────────────────────── */

  onDidChangeConfiguration(listener: Listener): () => void {
    this._listeners.push(listener);
    return () => {
      const idx = this._listeners.indexOf(listener);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  private _fire(event: ConfigurationChangeEvent): void {
    for (const l of this._listeners) {
      try { l(event); } catch { /* swallow */ }
    }
  }

  private _syncMemoryToConfig(): void {
    this._configuration.updateMemory(ConfigurationModel.fromFlat(this._memoryOverrides));
  }

  /** Reload user+workspace from persistence (e.g. after file system changes). */
  async reload(): Promise<void> {
    await this.initialize();
  }

  getInternalConfiguration(): Configuration {
    return this._configuration;
  }
}

/* ─── Singleton ─────────────────────────────────────── */

let _service: ConfigurationService | null = null;

export function getConfigurationService(): ConfigurationService {
  if (!_service) {
    _service = new ConfigurationService();
  }
  return _service;
}

export function setConfigurationService(service: ConfigurationService): void {
  _service = service;
}
