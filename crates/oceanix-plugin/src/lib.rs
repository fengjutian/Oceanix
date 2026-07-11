//! oceanix-plugin: Extension / plugin framework.
//!
//! # Architecture
//! - A [`Plugin`] is a Rust trait that contributes commands, keybindings,
//!   views, themes, and settings.
//! - The [`PluginRegistry`] manages all installed plugins.
//! - Plugins ship as a manifest (JSON) describing contributions, plus
//!   optional WASM modules or native Rust code.
//!
//! This crate is the *protocol* — it defines the shape of extensions.
//! Actual execution (WASM, native linking) lives in `oceanix` (src-tauri).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Extension Manifest ──────────────────────────────

/// Describes a single plugin — corresponds to VS Code's `package.json` contributions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub display_name: String,
    pub description: String,

    /// What this plugin contributes.
    #[serde(default)]
    pub contributes: Contributions,

    /// Activation event — e.g. `"onLanguage:rust"`, `"onCommand:oceanix.openFolder"`.
    #[serde(default)]
    pub activation_events: Vec<String>,
}

/// All possible contribution points.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Contributions {
    #[serde(default)]
    pub commands: Vec<CommandContribution>,
    #[serde(default)]
    pub keybindings: Vec<KeybindingContribution>,
    #[serde(default)]
    pub views: Vec<ViewContribution>,
    #[serde(default)]
    pub themes: Vec<ThemeContribution>,
    #[serde(default)]
    pub settings: Vec<SettingsContribution>,
}

// ─── Contribution types ──────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandContribution {
    pub id: String,
    pub label: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeybindingContribution {
    pub key: String,
    pub command: String,
    #[serde(default)]
    pub when: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewContribution {
    pub id: String,
    pub label: String,
    /// Where the view appears: "sidebar", "panel", "statusbar".
    pub location: String,
    /// Icon name from lucide set.
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeContribution {
    pub id: String,
    pub label: String,
    pub ui_theme: String, // "vs-dark" | "vs-light"
    pub path: String,     // relative to plugin root, points to a .json theme file
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsContribution {
    /// Dotted path, e.g. `"editor.fontSize"`.
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub ty: String, // "string" | "number" | "boolean" | "enum"
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub description: Option<String>,
}

// ─── Plugin trait (for native Rust plugins) ──────────

/// A native Rust plugin.
///
/// When a plugin is loaded, the registry calls `activate()`.
/// The plugin receives a `PluginContext` through which it can
/// register commands, subscribe to events, etc.
pub trait Plugin: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;

    /// Called when the plugin is activated.
    fn activate(&mut self, _ctx: &dyn PluginContext) -> Result<(), String> {
        Ok(())
    }

    /// Called when the plugin is deactivated.
    fn deactivate(&mut self) {}

    /// Returns the manifest for discoverability.
    fn manifest(&self) -> PluginManifest;
}

/// Context passed to plugins on activation so they can interact with the host.
pub trait PluginContext {
    fn register_command(&self, id: &str, handler: Box<dyn Fn() + Send + Sync>);
    fn subscribe_event(&self, event: &str, handler: Box<dyn Fn(serde_json::Value) + Send + Sync>);
}

// ─── Plugin Registry ─────────────────────────────────

/// Central registry that holds all plugins and their state.
pub struct PluginRegistry {
    plugins: HashMap<String, Box<dyn Plugin>>,
    /// Which plugins are currently active.
    active: HashMap<String, bool>,
    /// Accumulated contributions from all active plugins.
    merged: Contributions,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
            active: HashMap::new(),
            merged: Contributions::default(),
        }
    }

    /// Register a plugin (does not activate it yet).
    pub fn register(&mut self, plugin: Box<dyn Plugin>) {
        let name = plugin.name().to_string();
        self.plugins.insert(name.clone(), plugin);
        self.active.insert(name, false);
    }

    /// Activate a plugin by name.
    pub fn activate(&mut self, name: &str, ctx: &dyn PluginContext) -> Result<(), String> {
        let manifest = {
            let plugin = self.plugins.get_mut(name).ok_or("plugin not found")?;
            plugin.activate(ctx)?;
            plugin.manifest()
        };
        self.active.insert(name.to_string(), true);
        self.merge_contributions(manifest);
        tracing::info!(name, "plugin activated");
        Ok(())
    }

    /// Deactivate a plugin by name.
    pub fn deactivate(&mut self, name: &str) {
        if let Some(plugin) = self.plugins.get_mut(name) {
            plugin.deactivate();
        }
        self.active.insert(name.to_string(), false);
        self.rebuild_contributions();
        tracing::info!(name, "plugin deactivated");
    }

    /// Return the merged contributions of all active plugins.
    pub fn contributions(&self) -> &Contributions {
        &self.merged
    }

    /// List all registered plugins with their active state.
    pub fn list(&self) -> Vec<PluginInfo> {
        self.plugins
            .iter()
            .map(|(name, plugin)| PluginInfo {
                name: name.clone(),
                version: plugin.version().to_string(),
                display_name: plugin.manifest().display_name.clone(),
                active: *self.active.get(name).unwrap_or(&false),
            })
            .collect()
    }

    pub fn get_manifest(&self, name: &str) -> Option<&PluginManifest> {
        // Store manifests separately when implemented.
        // For now only active plugins are accessible via contributions().
        tracing::warn!(name, "get_manifest not yet implemented — contribution-based queries available via contributions()");
        None
    }

    // ─── internal ─────────────────────────────────────

    fn merge_contributions(&mut self, manifest: PluginManifest) {
        let c = manifest.contributes;
        self.merged.commands.extend(c.commands);
        self.merged.keybindings.extend(c.keybindings);
        self.merged.views.extend(c.views);
        self.merged.themes.extend(c.themes);
        self.merged.settings.extend(c.settings);
    }

    fn rebuild_contributions(&mut self) {
        self.merged = Contributions::default();
        let active_names: Vec<String> = self.active
            .iter()
            .filter(|(_, a)| **a)
            .map(|(n, _)| n.clone())
            .collect();
        for name in &active_names {
            if let Some(plugin) = self.plugins.get(name) {
                let c = plugin.manifest().contributes;
                self.merged.commands.extend(c.commands);
                self.merged.keybindings.extend(c.keybindings);
                self.merged.views.extend(c.views);
                self.merged.themes.extend(c.themes);
                self.merged.settings.extend(c.settings);
            }
        }
    }
}

// ─── Public-facing types ─────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub display_name: String,
    pub active: bool,
}

// ─── Module init ─────────────────────────────────────

pub fn init() {
    tracing::info!("oceanix-plugin initialized");
}
