mod commands;

use commands::AiState;
use std::sync::Mutex;
use std::collections::HashMap;
use oceanix_pty::PtySession;
use oceanix_plugin::PluginRegistry;

/// Oceanix: Next-generation code editor.
/// Thin shell — delegates all logic to workspace crates.

// ─── Managed State ─────────────────────────────────

pub struct GitState {
    pub project_root: Mutex<Option<String>>,
}

pub struct PtyState {
    pub pty: Mutex<PtySession>,
}

pub struct LspState {
    pub clients: Mutex<HashMap<String, oceanix_lsp::LspClient>>,
}

pub struct PluginState {
    pub registry: Mutex<PluginRegistry>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
        )
        .json()
        .init();

    // Initialize AI bridge (Python sidecar spawned lazily)
    let ai_state = AiState {
        bridge: Mutex::new(oceanix_ai::AiBridge::new()),
    };

    // Attempt to open git repo at current directory
    let git_state = GitState {
        project_root: Mutex::new(
            std::env::current_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
        ),
    };

    // PTY session manager
    let pty_state = PtyState {
        pty: Mutex::new(PtySession::new()),
    };

    // LSP client registry (lazy — spawned per language on demand)
    let lsp_state = LspState {
        clients: Mutex::new(HashMap::new()),
    };

    // Plugin registry
    let plugin_state = PluginState {
        registry: Mutex::new(PluginRegistry::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ai_state)
        .manage(git_state)
        .manage(pty_state)
        .manage(lsp_state)
        .manage(plugin_state)
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::file_read,
            commands::file_write,
            commands::file_read_dir,
            commands::file_exists,
            commands::file_create,
            commands::file_create_dir,
            commands::file_delete,
            commands::file_rename,
            commands::settings_load,
            commands::settings_save,
            commands::session_save,
            commands::session_load,
            commands::ai_complete,
            commands::ai_chat,
            commands::ai_status,
            commands::search_files,
            commands::terminal_create,
            commands::terminal_read,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_kill,
            commands::recent_projects,
            commands::git_status,
            commands::git_diff,
            commands::git_commit,
            commands::git_branch_name,
            commands::git_branches,
            commands::lsp_start,
            commands::lsp_hover,
            commands::lsp_definition,
            commands::lsp_did_open,
            commands::lsp_did_change,
            commands::lsp_diagnostics,
            commands::plugin_list,
            commands::plugin_contributions,
            commands::get_cwd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oceanix");
}
