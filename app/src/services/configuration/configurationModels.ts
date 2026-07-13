/**
 * Configuration Models — hierarchical merge engine.
 *
 * Pattern: VSCode's configurationModels.ts
 *
 * ConfigurationModel: immutable snapshot of key→value pairs at ONE layer
 * Configuration: holds 4 layers (defaults/user/workspace/memory) and consolidates
 *
 * Layer priority (lowest → highest):
 *   defaults  →  user  →  workspace  →  memory
 *
 * The "highest" layer that has a key wins. Overrides (language-specific [lang])
 * are supported on any layer.
 */

import type { ConfigurationProperties } from "./configurationRegistry";

/* ─── Helpers ───────────────────────────────────────── */

/** Deep-merge two plain objects. `target` wins on conflict. */
function deepMerge(base: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(target)) {
    const tv = target[key];
    const bv = base[key];
    if (
      tv !== null && typeof tv === "object" && !Array.isArray(tv) &&
      bv !== null && typeof bv === "object" && !Array.isArray(bv)
    ) {
      result[key] = deepMerge(bv as Record<string, unknown>, tv as Record<string, unknown>);
    } else {
      result[key] = tv;
    }
  }
  return result;
}

/** Override pattern regex: "[language]" → { identifier: "language" } */
const OVERRIDE_PROPERTY_REGEX = /^\[(.+)\]$/;

/** Parse a top-level key: returns { isOverride, identifier, key } */
function parseOverrideKey(propKey: string): {
  isOverride: boolean;
  identifier: string | null;
  key: string;
} {
  const m = propKey.match(OVERRIDE_PROPERTY_REGEX);
  if (m) {
    return { isOverride: true, identifier: m[1], key: propKey };
  }
  return { isOverride: false, identifier: null, key: propKey };
}

/* ─── ConfigurationModel ────────────────────────────── */

export interface IConfigurationModel {
  /** Raw key→value contents (includes [lang] override blocks). */
  contents: Record<string, unknown>;
  /** All top-level keys (excluding override blocks). */
  keys: string[];
  /** Override blocks: Map<languageId, Record<key, value>> */
  overrides: Map<string, Record<string, unknown>>;
}

export class ConfigurationModel implements IConfigurationModel {
  public readonly contents: Record<string, unknown>;
  public readonly keys: string[];
  public readonly overrides: Map<string, Record<string, unknown>>;

  constructor(
    contents: Record<string, unknown> = {},
    keys: string[] = [],
    overrides: Map<string, Record<string, unknown>> = new Map(),
  ) {
    this.contents = { ...contents };
    this.keys = [...keys];
    this.overrides = new Map(overrides);
  }

  /** Get a raw value from this model (no consolidation). */
  getValue(key: string): unknown {
    return this.contents[key] !== undefined ? this.contents[key] : undefined;
  }

  /** Get a value from a language override block. */
  getOverrideValue(identifier: string, key: string): unknown {
    const block = this.overrides.get(identifier);
    return block?.[key];
  }

  /** Merge another model INTO this one. The other model's values win on conflict. */
  merge(other: ConfigurationModel): ConfigurationModel {
    const merged = deepMerge(
      this.contents,
      other.contents,
    );
    const mergedKeys = [...new Set([...this.keys, ...other.keys])];
    const mergedOverrides = new Map(this.overrides);
    for (const [lang, block] of other.overrides) {
      const existing = mergedOverrides.get(lang);
      mergedOverrides.set(lang, existing ? { ...existing, ...block } : { ...block });
    }
    return new ConfigurationModel(merged, mergedKeys, mergedOverrides);
  }

  /** Return a flat model with language overrides applied. */
  override(identifier: string): ConfigurationModel {
    const block = this.overrides.get(identifier);
    if (!block) return this;
    const merged = { ...this.contents, ...block };
    const mergedKeys = [...new Set([...this.keys, ...Object.keys(block)])];
    return new ConfigurationModel(merged, mergedKeys);
  }

  /** Build a model from flat key→value pairs, separating [lang] overrides. */
  static fromFlat(flat: Record<string, unknown>): ConfigurationModel {
    const contents: Record<string, unknown> = {};
    const keys: string[] = [];
    const overrides = new Map<string, Record<string, unknown>>();

    for (const [key, value] of Object.entries(flat)) {
      const { isOverride, identifier } = parseOverrideKey(key);
      if (isOverride && identifier) {
        let block = overrides.get(identifier);
        if (!block) {
          block = {};
          overrides.set(identifier, block);
        }
        block[key] = value; // keep full key including [lang]
      } else {
        contents[key] = value;
        keys.push(key);
      }
    }

    return new ConfigurationModel(contents, keys, overrides);
  }

  /** Build model from registry defaults (flat property map). */
  static fromDefaults(properties: ConfigurationProperties): ConfigurationModel {
    const flat: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(properties)) {
      flat[key] = schema.default;
    }
    return ConfigurationModel.fromFlat(flat);
  }

  /** Empty model. */
  static empty(): ConfigurationModel {
    return new ConfigurationModel({}, [], new Map());
  }
}

/* ─── ConfigurationInspectValue ─────────────────────── */

export interface IConfigurationInspectValue<T> {
  /** The resolved value (highest-priority layer that has this key). */
  value: T | undefined;
  /** Value from the defaults layer (registry). */
  defaultValue: T | undefined;
  /** Value from user settings.json. */
  userValue: T | undefined;
  /** Value from workspace settings.json. */
  workspaceValue: T | undefined;
  /** Value from in-memory overrides. */
  memoryValue: T | undefined;
  /** Which layer provided the resolved value. */
  source: "default" | "user" | "workspace" | "memory";
}

/* ─── Configuration ─────────────────────────────────── */

export class Configuration {
  private _defaults: ConfigurationModel;
  private _user: ConfigurationModel;
  private _workspace: ConfigurationModel;
  private _memory: ConfigurationModel;

  /** Cached consolidated model. Invalidated on any layer update. */
  private _consolidated: ConfigurationModel | null = null;

  constructor(
    defaults: ConfigurationModel = ConfigurationModel.empty(),
    user: ConfigurationModel = ConfigurationModel.empty(),
    workspace: ConfigurationModel = ConfigurationModel.empty(),
    memory: ConfigurationModel = ConfigurationModel.empty(),
  ) {
    this._defaults = defaults;
    this._user = user;
    this._workspace = workspace;
    this._memory = memory;
  }

  /** Update a specific layer. */
  updateDefaults(model: ConfigurationModel): void {
    this._defaults = model;
    this._consolidated = null;
  }

  updateUser(model: ConfigurationModel): void {
    this._user = model;
    this._consolidated = null;
  }

  updateWorkspace(model: ConfigurationModel): void {
    this._workspace = model;
    this._consolidated = null;
  }

  updateMemory(model: ConfigurationModel): void {
    this._memory = model;
    this._consolidated = null;
  }

  /** Get the fully consolidated model (all layers merged, highest wins). */
  getConsolidated(): ConfigurationModel {
    if (this._consolidated) return this._consolidated;
    this._consolidated = this._defaults
      .merge(this._user)
      .merge(this._workspace)
      .merge(this._memory);
    return this._consolidated;
  }

  /** Get a single resolved value. */
  getValue<T>(key: string): T | undefined {
    return this.getConsolidated().getValue(key) as T | undefined;
  }

  /** Inspect a setting: get per-layer values. */
  inspect<T>(key: string): IConfigurationInspectValue<T> {
    const defaultValue = this._defaults.getValue(key) as T | undefined;
    const userValue = this._user.getValue(key) as T | undefined;
    const workspaceValue = this._workspace.getValue(key) as T | undefined;
    const memoryValue = this._memory.getValue(key) as T | undefined;

    // Highest layer that has a value wins
    let value: T | undefined;
    let source: IConfigurationInspectValue<T>["source"] = "default";
    if (memoryValue !== undefined) {
      value = memoryValue;
      source = "memory";
    } else if (workspaceValue !== undefined) {
      value = workspaceValue;
      source = "workspace";
    } else if (userValue !== undefined) {
      value = userValue;
      source = "user";
    } else {
      value = defaultValue;
      source = "default";
    }

    return { value, defaultValue, userValue, workspaceValue, memoryValue, source };
  }

  /** Get all known configuration keys. */
  keys(): string[] {
    return this.getConsolidated().keys;
  }

  /** Get a raw snapshot of the consolidated model. */
  toJSON(): Record<string, unknown> {
    return { ...this.getConsolidated().contents };
  }

  /** Get the user-layer model as flat object. */
  getUserSettings(): Record<string, unknown> {
    return { ...this._user.contents };
  }

  /** Get the workspace-layer model as flat object. */
  getWorkspaceSettings(): Record<string, unknown> {
    return { ...this._workspace.contents };
  }
}
