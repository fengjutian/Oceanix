/**
 * Configuration Registry — VSCode-style declarative settings registration.
 *
 * Pattern: VSCode's IConfigurationRegistry / IConfigurationNode
 * Extensions and built-in modules register configuration sections with
 * typed schema (type, default, enum, scope, description).
 *
 * The registry is the single source of truth for:
 *  - What settings exist (metadata)
 *  - Default values
 *  - Allowed scopes
 *  - UI rendering hints (enum, editPresentation, etc.)
 */

/* ─── Types ─────────────────────────────────────────── */

/** Where a setting can be persisted. Mirrors VSCode's ConfigurationScope. */
export enum ConfigurationScope {
  /** Machine-wide (application level) */
  APPLICATION = 1,
  /** Per-window / global user settings */
  RESOURCE = 2,
  /** Can be overridden per language via [lang] block */
  LANGUAGE_OVERRIDABLE = 3,
}

/** Where a setting update is written. Mirrors VSCode's ConfigurationTarget. */
export enum ConfigurationTarget {
  /** Write to user settings.json (~/.config/oceanix/settings.json) */
  USER = 1,
  /** Write to workspace settings.json (<project>/.oceanix/settings.json) */
  WORKSPACE = 2,
  /** Write to in-memory layer only (not persisted) */
  MEMORY = 3,
}

/** Per-setting property schema. Mirrors VSCode's IConfigurationPropertySchema. */
export interface IConfigurationPropertySchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  /** Default value — MUST be provided. */
  default: unknown;
  /** Human-readable label (i18n key). */
  description: string;
  /** Optional long-form description (i18n key or markdown). */
  markdownDescription?: string;
  /** Allowed values for enum-type settings. */
  enum?: unknown[];
  /** Human-readable labels for each enum value (i18n keys). */
  enumDescriptions?: string[];
  /** Where this setting can be stored. Defaults to RESOURCE. */
  scope?: ConfigurationScope;
  /** Tags for search/filtering. */
  tags?: string[];
  /** Minimum value (number type). */
  minimum?: number;
  /** Maximum value (number type). */
  maximum?: number;
  /** Step increment (number type). */
  step?: number;
  /** UI edit presentation hint. */
  editPresentation?: "singleline" | "multiline";
  /** Order within the group (lower = earlier). */
  order?: number;
  /** Whether the setting is restricted (requires elevated trust). */
  restricted?: boolean;
}

/** A contributed configuration section. Mirrors VSCode's IConfigurationNode. */
export interface IConfigurationNode {
  /** Unique section id, e.g. "editor", "files", "terminal" */
  id: string;
  /** Display title (i18n key). */
  title: string;
  /** Order among top-level groups. */
  order?: number;
  /** Map of property key → schema. Keys are relative to the section,
   *  e.g. { "fontSize": {...} } in section "editor" → full key "editor.fontSize". */
  properties: Record<string, IConfigurationPropertySchema>;
}

/** Full flattened configuration property map: key → schema. */
export type ConfigurationProperties = Record<string, IConfigurationPropertySchema>;

/* ─── Registry ──────────────────────────────────────── */

export interface IConfigurationRegistry {
  /**
   * Register a configuration section (group of related settings).
   * Called by built-in code and extensions.
   */
  registerConfiguration(node: IConfigurationNode): void;

  /**
   * Get the flattened map of all registered settings: "section.key" → schema.
   */
  getConfigurationProperties(): ConfigurationProperties;

  /**
   * Get the registered sections (for building TOC/sidebar in settings UI).
   */
  getConfigurationSections(): IConfigurationNode[];

  /**
   * Fires when any configuration section is registered or modified.
   */
  readonly onDidUpdateConfiguration: { fire(): void };
}

/* ─── Implementation ────────────────────────────────── */

class ConfigurationRegistry implements IConfigurationRegistry {
  private _sections: IConfigurationNode[] = [];
  private _properties: ConfigurationProperties = {};
  private _onDidUpdate: Array<() => void> = [];

  readonly onDidUpdateConfiguration = {
    fire: () => {
      for (const cb of this._onDidUpdate) cb();
    },
  };

  /** Register a listener. Returns disposable function. */
  onDidChange(cb: () => void): () => void {
    this._onDidUpdate.push(cb);
    return () => {
      const idx = this._onDidUpdate.indexOf(cb);
      if (idx >= 0) this._onDidUpdate.splice(idx, 1);
    };
  }

  registerConfiguration(node: IConfigurationNode): void {
    // Remove previous registration with same id
    const existingIdx = this._sections.findIndex((s) => s.id === node.id);
    if (existingIdx >= 0) {
      const oldNode = this._sections[existingIdx];
      // Remove old flattened properties
      for (const key of Object.keys(oldNode.properties)) {
        delete this._properties[`${oldNode.id}.${key}`];
      }
      this._sections.splice(existingIdx, 1);
    }

    // Sort by order then id
    const insertIdx = this._sections.findIndex(
      (s) => (s.order ?? 100) > (node.order ?? 100)
    );
    if (insertIdx < 0) {
      this._sections.push(node);
    } else {
      this._sections.splice(insertIdx, 0, node);
    }

    // Flatten properties into "section.key" → schema
    for (const [key, schema] of Object.entries(node.properties)) {
      const fullKey = `${node.id}.${key}`;
      this._properties[fullKey] = schema;
    }

    this.onDidUpdateConfiguration.fire();
  }

  getConfigurationProperties(): ConfigurationProperties {
    return { ...this._properties };
  }

  getConfigurationSections(): IConfigurationNode[] {
    return [...this._sections];
  }
}

/** Singleton registry instance. */
export const configurationRegistry = new ConfigurationRegistry();
