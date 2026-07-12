mod commands;

use tauri::{Emitter, Manager};
use commands::AiState;
use std::sync::Mutex;
use std::sync::Arc;
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
    pub pty: Arc<Mutex<PtySession>>,
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

    let ai_state = AiState {
        bridge: Mutex::new(oceanix_ai::AiBridge::new()),
    };

    let git_state = GitState {
        project_root: Mutex::new(
            std::env::current_dir()
                .ok()
                .map(|p| {
                    // Tauri runs in src-tauri/, search upward for the git repo root
                    let mut path = p;
                    while !path.join(".git").exists() {
                        if let Some(parent) = path.parent() {
                            path = parent.to_path_buf();
                        } else {
                            break;
                        }
                    }
                    path.to_string_lossy().to_string()
                })
        ),
    };

    let pty_state = PtyState {
        pty: Arc::new(Mutex::new(PtySession::new())),
    };

    let lsp_state = LspState {
        clients: Mutex::new(HashMap::new()),
    };

    let plugin_state = PluginState {
        registry: Mutex::new(PluginRegistry::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            commands::git_stage,
            commands::git_unstage,
            commands::git_push,
            commands::git_pull,
            commands::git_create_branch,
            commands::git_switch_branch,
            commands::lsp_start,
            commands::lsp_hover,
            commands::lsp_definition,
            commands::lsp_did_open,
            commands::lsp_did_change,
            commands::lsp_diagnostics,
            commands::lsp_rename,
            commands::plugin_list,
            commands::plugin_contributions,
            commands::get_cwd,
            commands::set_cwd,
        ])
        .setup(|app| {
            // File system watcher — emits 'file-changed' event when project files change
            use notify::Watcher;
            if let Ok(cwd) = std::env::current_dir() {
                let handle = app.handle().clone();
                let (tx, rx) = std::sync::mpsc::channel();
                let mut watcher = notify::recommended_watcher(move |res| {
                    if let Ok(_event) = res {
                        let _ = tx.send(());
                    }
                }).ok();
                if let Some(ref mut w) = watcher {
                    let _ = w.watch(&cwd, notify::RecursiveMode::Recursive);
                }
                std::thread::spawn(move || {
                    for () in rx {
                        let _ = handle.emit("file-changed", ());
                    }
                });
            }
            // Enable dark title bar on Windows 10/11
            #[cfg(target_os = "windows")]
            {
                use std::ffi::c_void;
                extern "system" {
                    fn DwmSetWindowAttribute(
                        hwnd: *mut c_void,
                        dw_attribute: u32,
                        pv_attribute: *const c_void,
                        cb_attribute: u32,
                    ) -> i32;
                }
                const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        let use_dark: u32 = 1;
                        unsafe {
                            let hwnd: *mut c_void = std::mem::transmute(hwnd);
                            let _ = DwmSetWindowAttribute(
                                hwnd,
                                DWMWA_USE_IMMERSIVE_DARK_MODE,
                                &use_dark as *const _ as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Oceanix");
}
