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
        Ok(response) => Ok(response.result),
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
            match r.result {
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

// ─── Terminal (stubs) ─────────────────────────────────

#[tauri::command]
pub fn terminal_create(_shell: Option<String>) -> Result<String, String> {
    Ok(format!("term-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()))
}

#[tauri::command]
pub fn terminal_write(id: String, data: String) -> Result<(), String> {
    tracing::info!("terminal_write id={id} len={}", data.len());
    Ok(())
}

#[tauri::command]
pub fn terminal_resize(id: String, cols: u16, rows: u16) -> Result<(), String> {
    tracing::info!("terminal_resize id={id} {cols}x{rows}");
    Ok(())
}

#[tauri::command]
pub fn terminal_kill(id: String) -> Result<(), String> {
    tracing::info!("terminal_kill id={id}");
    Ok(())
}

// ─── Recent Projects ──────────────────────────────────

#[tauri::command]
pub fn recent_projects() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

// ─── Types ───────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct FileEntry {
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub name: String,
    pub path: String,
}
