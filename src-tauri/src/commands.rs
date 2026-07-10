/// Thin delegation layer: each #[tauri::command] delegates to a workspace crate.
/// Zero business logic here.

use tauri::State;
use std::sync::Mutex;

// ─── AI Bridge State ────────────────────────────────

pub struct AiState {
    pub bridge: Mutex<oceanix_ai::AiBridge>,
}

// ─── Greet (smoke test) ─────────────────────────────

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! Welcome to Oceanix.")
}

// ─── File I/O ────────────────────────────────────────

#[tauri::command]
pub fn file_read(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))
}

#[tauri::command]
pub fn file_write(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
pub fn file_read_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = std::fs::read_dir(&path).map_err(|e| format!("ReadDir error: {e}"))?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Entry error: {e}"))?;
        let path = entry.path();
        result.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn file_create(path: String) -> Result<(), String> {
    std::fs::write(&path, "").map_err(|e| format!("Create error: {e}"))
}

#[tauri::command]
pub fn file_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("CreateDir error: {e}"))
}

#[tauri::command]
pub fn file_delete(path: String) -> Result<(), String> {
    if std::path::Path::new(&path).is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| format!("RemoveDir error: {e}"))
    } else {
        std::fs::remove_file(&path).map_err(|e| format!("RemoveFile error: {e}"))
    }
}

#[tauri::command]
pub fn file_rename(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Rename error: {e}"))
}

// ─── Settings ────────────────────────────────────────

#[tauri::command]
pub fn settings_load() -> Result<serde_json::Value, String> {
    let config_dir = dirs::config_dir()
        .ok_or("No config dir")?
        .join("oceanix")
        .join("settings.json");

    if config_dir.exists() {
        let content = std::fs::read_to_string(&config_dir)
            .map_err(|e| format!("Read settings: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Parse settings: {e}"))
    } else {
        Ok(serde_json::json!({
            "theme": "vs-dark",
            "fontSize": 14,
            "fontFamily": "'Cascadia Code', 'Fira Code', monospace",
            "tabSize": 2,
            "insertSpaces": true,
            "wordWrap": "off",
            "minimap": true,
            "autoSave": "off",
            "autoSaveDelay": 1000
        }))
    }
}

#[tauri::command]
pub fn settings_save(settings: serde_json::Value) -> Result<(), String> {
    let config_dir = dirs::config_dir()
        .ok_or("No config dir")?
        .join("oceanix");
    std::fs::create_dir_all(&config_dir).map_err(|e| format!("CreateDir: {e}"))?;
    let content = serde_json::to_string_pretty(&settings).unwrap();
    std::fs::write(config_dir.join("settings.json"), content)
        .map_err(|e| format!("Write settings: {e}"))
}

// ─── Session ─────────────────────────────────────────

#[tauri::command]
pub fn session_save(state: serde_json::Value) -> Result<(), String> {
    let session_dir = dirs::data_dir()
        .ok_or("No data dir")?
        .join("oceanix");
    std::fs::create_dir_all(&session_dir).map_err(|e| format!("CreateDir: {e}"))?;
    let content = serde_json::to_string_pretty(&state).unwrap();
    std::fs::write(session_dir.join("session.json"), content)
        .map_err(|e| format!("Write session: {e}"))
}

#[tauri::command]
pub fn session_load() -> Result<Option<serde_json::Value>, String> {
    let session_file = dirs::data_dir()
        .ok_or("No data dir")?
        .join("oceanix")
        .join("session.json");
    if session_file.exists() {
        let content = std::fs::read_to_string(&session_file)
            .map_err(|e| format!("Read session: {e}"))?;
        serde_json::from_str(&content)
            .map(Some)
            .map_err(|e| format!("Parse session: {e}"))
    } else {
        Ok(None)
    }
}

// ─── AI ──────────────────────────────────────────────

#[tauri::command]
pub fn ai_complete(params: serde_json::Value, ai_state: State<AiState>) -> Result<Option<serde_json::Value>, String> {
    let mut bridge = ai_state.bridge.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if !bridge.is_ready() {
        // Try to start the sidecar
        bridge.start().ok();
    }
    if !bridge.is_ready() {
        return Ok(None); // Sidecar not available — silently return
    }
    match bridge.send_request("completion", params) {
        Ok(response) => Ok(oceanix_ai::flatten_mcp_result(&response.result)),
        Err(e) => {
            tracing::warn!("AI completion failed: {e}");
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn ai_chat(params: serde_json::Value, ai_state: State<AiState>) -> Result<String, String> {
    let mut bridge = ai_state.bridge.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if !bridge.is_ready() {
        bridge.start().ok();
    }
    bridge
        .send_request("chat", params)
        .map(|r| {
            match oceanix_ai::flatten_mcp_result(&r.result) {
                Some(serde_json::Value::String(s)) => s,
                Some(v) => v.to_string(),
                None => String::new(),
            }
        })
}

#[tauri::command]
pub fn ai_status(ai_state: State<AiState>) -> Result<bool, String> {
    Ok(ai_state.bridge.lock().map_err(|e| format!("Lock poisoned: {e}"))?.is_ready())
}

// ─── Search ───────────────────────────────────────────

#[tauri::command]
pub fn search_files(params: serde_json::Value) -> Result<Vec<serde_json::Value>, String> {
    let query = params["query"].as_str().unwrap_or("");
    let path = params["path"].as_str().unwrap_or(".");
    let max = params.get("max_results").and_then(|v| v.as_u64()).unwrap_or(50) as usize;

    let search_params = oceanix_search::SearchParams {
        query: query.to_string(),
        include: params["include"].as_str().map(String::from),
        exclude: params["exclude"].as_str().map(String::from),
        case_sensitive: params.get("case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false),
        max_results: max,
    };

    let engine = oceanix_search::SearchEngine::new(path);
    let results = engine.search(&search_params);

    Ok(results.into_iter().map(|m| serde_json::json!({
        "file": m.file_path,
        "line": m.line_number,
        "column": m.column,
        "text": m.line_text,
    })).collect())
}

// ─── Terminal ────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TerminalCreateResult {
    id: String,
    pid: u32,
}

#[tauri::command]
pub fn terminal_create(shell: Option<String>, state: tauri::State<'_, crate::PtyState>) -> Result<TerminalCreateResult, String> {
    let session = state.pty.lock().map_err(|e| format!("lock: {e}"))?;
    let result = session.spawn(shell.as_deref())?;
    Ok(TerminalCreateResult { id: result.id, pid: result.pid })
}

#[tauri::command]
pub fn terminal_write(id: String, data: String, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let session = state.pty.lock().map_err(|e| format!("lock: {e}"))?;
    session.write(&id, data.as_bytes())
}

#[tauri::command]
pub fn terminal_read(id: String, state: tauri::State<'_, crate::PtyState>) -> Result<String, String> {
    let session = state.pty.lock().map_err(|e| format!("lock: {e}"))?;
    let data = session.read(&id)?;
    Ok(String::from_utf8_lossy(&data).to_string())
}

#[tauri::command]
pub fn terminal_resize(id: String, cols: u16, rows: u16, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let session = state.pty.lock().map_err(|e| format!("lock: {e}"))?;
    session.resize(&id, cols, rows)
}

#[tauri::command]
pub fn terminal_kill(id: String, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let session = state.pty.lock().map_err(|e| format!("lock: {e}"))?;
    session.kill(&id)
}

// ─── Recent Projects ──────────────────────────────────

#[tauri::command]
pub fn recent_projects() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

// ─── Git ────────────────────────────────────────────

use oceanix_git::GitRepo;

#[derive(serde::Serialize)]
pub struct GitStatusEntry {
    path: String,
    status: String,
}

#[derive(serde::Serialize)]
pub struct GitBranchEntry {
    name: String,
    #[serde(rename = "isHead")]
    is_head: bool,
}

fn repo_from_state(state: &tauri::State<'_, crate::GitState>) -> Result<GitRepo, String> {
    let guard = state.project_root.lock().map_err(|e| format!("lock: {e}"))?;
    let root = guard.as_ref().ok_or_else(|| "No project root".to_string())?;
    GitRepo::open(root)
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitStatusEntry>, String> {
    let repo = repo_from_state(&state)?;
    let files = repo.status()?;
    Ok(files
        .into_iter()
        .map(|f| GitStatusEntry {
            path: f.path,
            status: match f.status {
                oceanix_git::StatusKind::Modified => "modified".into(),
                oceanix_git::StatusKind::Added => "added".into(),
                oceanix_git::StatusKind::Deleted => "deleted".into(),
                oceanix_git::StatusKind::Untracked => "untracked".into(),
            },
        })
        .collect())
}

#[tauri::command]
pub fn git_diff(path: Option<String>, staged: Option<bool>, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    if staged.unwrap_or(false) {
        repo.diff_staged()
    } else {
        repo.diff(path.as_deref())
    }
}

#[tauri::command]
pub fn git_commit(message: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    repo.commit(&message)
}

#[tauri::command]
pub fn git_branch_name(state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    repo.branch_name()
}

#[tauri::command]
pub fn git_branches(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitBranchEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .branches()?
        .into_iter()
        .map(|b| GitBranchEntry { name: b.name, is_head: b.is_head })
        .collect())
}

#[tauri::command]
pub fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current dir: {e}"))
}

// ─── LSP ────────────────────────────────────────────

use oceanix_lsp::LspClient;

#[derive(serde::Serialize)]
pub struct LspLocation {
    uri: String,
    range_start_line: u32,
    range_start_char: u32,
    range_end_line: u32,
    range_end_char: u32,
}

#[derive(serde::Serialize)]
pub struct LspHover {
    contents: String, // markdown
}

#[derive(serde::Serialize)]
pub struct LspDiagnostic {
    file: String,
    line: u32,
    column: u32,
    end_line: u32,
    end_column: u32,
    severity: u32,
    message: String,
    source: String,
}

/// Map of language_id → server command + args
fn lsp_server_config(lang: &str) -> Option<(&'static str, &'static [&'static str])> {
    match lang {
        "rust" => Some(("rust-analyzer", &[] as &[&str])),
        "python" => Some(("pyright-langserver", &["--stdio"] as &[&str])),
        "typescript" | "typescriptreact" | "javascript" => Some(("typescript-language-server", &["--stdio"] as &[&str])),
        _ => None,
    }
}

fn uri_from_path(path: &str) -> String {
    format!("file://{}", path.replace('\\', "/"))
}

#[tauri::command]
pub fn lsp_start(language_id: String, root_path: String, state: tauri::State<'_, crate::LspState>) -> Result<String, String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    if guard.contains_key(&language_id) {
        return Ok(format!("LSP already running for {language_id}"));
    }
    let (cmd, args) = lsp_server_config(&language_id)
        .ok_or_else(|| format!("No LSP server configured for language: {language_id}"))?;
    let client = LspClient::start(cmd, args, &root_path)?;
    guard.insert(language_id.clone(), client);
    Ok(format!("LSP started for {language_id}"))
}

#[tauri::command]
pub fn lsp_did_open(language_id: String, path: String, text: String, state: tauri::State<'_, crate::LspState>) -> Result<(), String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = uri_from_path(&path);
    client.did_open(&uri, &language_id, &text)
}

#[tauri::command]
pub fn lsp_did_change(language_id: String, path: String, version: u32, text: String, state: tauri::State<'_, crate::LspState>) -> Result<(), String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = uri_from_path(&path);
    client.did_change(&uri, version, &text)
}

#[tauri::command]
pub fn lsp_hover(language_id: String, path: String, line: u32, character: u32, state: tauri::State<'_, crate::LspState>) -> Result<Option<LspHover>, String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = uri_from_path(&path);
    let result = client.hover(&uri, line, character)?;
    Ok(result.map(|h| {
        let text = match &h.contents {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Object(m) => m.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            _ => format!("{:#}", h.contents),
        };
        LspHover { contents: text }
    }))
}

#[tauri::command]
pub fn lsp_definition(language_id: String, path: String, line: u32, character: u32, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspLocation>, String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = uri_from_path(&path);
    let locs = client.definition(&uri, line, character)?;
    Ok(locs.into_iter().map(|l| LspLocation {
        uri: l.uri,
        range_start_line: l.range.start.line,
        range_start_char: l.range.start.character,
        range_end_line: l.range.end.line,
        range_end_char: l.range.end.character,
    }).collect())
}

#[tauri::command]
pub fn lsp_diagnostics(language_id: String, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspDiagnostic>, String> {
    let guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get(&language_id).ok_or("LSP not started")?;
    Ok(client.take_diagnostics().into_iter().map(|d| LspDiagnostic {
        file: d.file,
        line: d.line,
        column: d.column,
        end_line: d.end_line,
        end_column: d.end_column,
        severity: d.severity,
        message: d.message,
        source: d.source,
    }).collect())
}

// ─── Plugin Registry ────────────────────────────────

#[tauri::command]
pub fn plugin_list(state: tauri::State<'_, crate::PluginState>) -> Result<Vec<oceanix_plugin::PluginInfo>, String> {
    let registry = state.registry.lock().map_err(|e| format!("lock: {e}"))?;
    Ok(registry.list())
}

#[tauri::command]
pub fn plugin_contributions(state: tauri::State<'_, crate::PluginState>) -> Result<oceanix_plugin::Contributions, String> {
    let registry = state.registry.lock().map_err(|e| format!("lock: {e}"))?;
    Ok(registry.contributions().clone())
}

// ─── Types ───────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct FileEntry {
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub name: String,
    pub path: String,
}
