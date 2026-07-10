mod commands;

use commands::AiState;
use std::sync::Mutex;

/// Oceanix: Next-generation code editor.
/// Thin shell — delegates all logic to workspace crates.

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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ai_state)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Oceanix");
}
