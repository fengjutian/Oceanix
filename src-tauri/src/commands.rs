/// Thin delegation layer: each #[tauri::command] delegates to a workspace crate.
/// Zero business logic here.

use tauri::State;
use std::sync::Mutex;
use serde::Serialize;

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

/// Read a file and return its contents as a base64-encoded string.
/// Used for binary files such as images.
#[tauri::command]
pub fn file_read_base64(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(&path).map_err(|e| format!("Open error: {e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("Read error: {e}"))?;
    Ok(base64_encode(&buf))
}

/// Simple base64 encoder (no external crate needed).
fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
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

    let user_settings = if config_dir.exists() {
        let content = std::fs::read_to_string(&config_dir)
            .map_err(|e| format!("Read settings: {e}"))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Try to load workspace settings from <cwd>/.oceanix/settings.json
    let workspace_settings = std::env::current_dir()
        .ok()
        .map(|cwd| cwd.join(".oceanix").join("settings.json"))
        .filter(|p| p.exists())
        .and_then(|p| {
            std::fs::read_to_string(&p).ok().and_then(|content| {
                serde_json::from_str::<serde_json::Value>(&content).ok()
            })
        });

    Ok(serde_json::json!({
        "user": user_settings,
        "workspace": workspace_settings,
    }))
}

#[tauri::command]
pub fn settings_save(target: String, settings: serde_json::Value) -> Result<(), String> {
    let settings_obj = settings.as_object().ok_or("settings must be a JSON object")?;

    match target.as_str() {
        "user" => {
            let config_dir = dirs::config_dir()
                .ok_or("No config dir")?
                .join("oceanix");
            std::fs::create_dir_all(&config_dir).map_err(|e| format!("CreateDir: {e}"))?;
            let settings_path = config_dir.join("settings.json");

            // Read-merge-write: load existing, merge partial, write back
            let mut existing = if settings_path.exists() {
                let content = std::fs::read_to_string(&settings_path)
                    .map_err(|e| format!("Read settings: {e}"))?;
                serde_json::from_str::<serde_json::Value>(&content)
                    .unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };

            if let Some(existing_obj) = existing.as_object_mut() {
                for (k, v) in settings_obj {
                    existing_obj.insert(k.clone(), v.clone());
                }
            }

            let content = serde_json::to_string_pretty(&existing).unwrap();
            std::fs::write(&settings_path, content)
                .map_err(|e| format!("Write settings: {e}"))
        }
        "workspace" => {
            let cwd = std::env::current_dir()
                .map_err(|e| format!("Get cwd: {e}"))?;
            let oceanix_dir = cwd.join(".oceanix");
            std::fs::create_dir_all(&oceanix_dir).map_err(|e| format!("CreateDir: {e}"))?;
            let settings_path = oceanix_dir.join("settings.json");

            // Read-merge-write for workspace too
            let mut existing = if settings_path.exists() {
                let content = std::fs::read_to_string(&settings_path)
                    .map_err(|e| format!("Read settings: {e}"))?;
                serde_json::from_str::<serde_json::Value>(&content)
                    .unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };

            if let Some(existing_obj) = existing.as_object_mut() {
                for (k, v) in settings_obj {
                    existing_obj.insert(k.clone(), v.clone());
                }
            }

            let content = serde_json::to_string_pretty(&existing).unwrap();
            std::fs::write(&settings_path, content)
                .map_err(|e| format!("Write settings: {e}"))
        }
        other => Err(format!("Unknown settings target: {other} (must be 'user' or 'workspace')")),
    }
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

/// Ensure the AI sidecar is running. No-op if already started.
/// Call this before any direct HTTP API call to port 11435.
#[tauri::command]
pub fn ai_ensure_running(ai_state: State<AiState>) -> Result<bool, String> {
    let mut bridge = ai_state.bridge.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if !bridge.is_ready() {
        bridge.start().map_err(|e| format!("Failed to start AI sidecar: {e}"))?;
    }
    Ok(true)
}

#[tauri::command]
pub fn ai_agent_execute(params: serde_json::Value, ai_state: State<AiState>) -> Result<serde_json::Value, String> {
    let mut bridge = ai_state.bridge.lock().map_err(|e| format!("Lock poisoned: {e}"))?;
    if !bridge.is_ready() {
        bridge.start().map_err(|e| format!("Failed to start AI sidecar: {e}"))?;
    }
    // Agent execution can take a while — use a 5-minute timeout
    use std::time::Duration;
    bridge.send_request_with_timeout("agent_execute", params, Duration::from_secs(300))
        .map(|r| {
            match oceanix_ai::flatten_mcp_result(&r.result) {
                // FastMCP serializes dict returns as a JSON string inside the MCP content
                Some(serde_json::Value::String(s)) => {
                    serde_json::from_str(&s).unwrap_or(serde_json::Value::String(s))
                }
                Some(v) => v,
                None => serde_json::Value::Null,
            }
        })
}

// ─── Search ───────────────────────────────────────────

#[tauri::command]
pub fn search_files(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let query = params["query"].as_str().unwrap_or("");
    let path = params["path"].as_str().unwrap_or(".");
    let max = params.get("max_results").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
    let ctx = params.get("surrounding_context").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

    let search_params = oceanix_search::SearchParams {
        query: query.to_string(),
        include: params["include"].as_str().map(String::from),
        exclude: params["exclude"].as_str().map(String::from),
        case_sensitive: params.get("case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false),
        whole_word: params.get("whole_word").and_then(|v| v.as_bool()).unwrap_or(false),
        max_results: max,
        surrounding_context: ctx,
    };

    let engine = oceanix_search::SearchEngine::new(path);
    let result = engine.search(&search_params);

    let matches: Vec<serde_json::Value> = result.matches.into_iter().map(|m| {
        let ctx_before: Vec<serde_json::Value> = m.context_before.into_iter().map(|(ln, txt)| {
            serde_json::json!([ln, txt])
        }).collect();
        let ctx_after: Vec<serde_json::Value> = m.context_after.into_iter().map(|(ln, txt)| {
            serde_json::json!([ln, txt])
        }).collect();
        serde_json::json!({
            "file": m.file_path,
            "line": m.line_number,
            "column": m.column,
            "text": m.line_text,
            "match_start": m.match_start,
            "match_end": m.match_end,
            "context_before": ctx_before,
            "context_after": ctx_after,
        })
    }).collect();

    Ok(serde_json::json!({
        "matches": matches,
        "limit_hit": result.limit_hit,
    }))
}

// ─── Terminal ────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TerminalCreateResult {
    id: String,
    pid: u32,
}

#[tauri::command]
pub async fn terminal_create(shell: Option<String>, state: tauri::State<'_, crate::PtyState>) -> Result<TerminalCreateResult, String> {
    let pty = state.pty.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let session = pty.lock().map_err(|e| format!("lock: {e}"))?;
        session.spawn(shell.as_deref())
    }).await.map_err(|e| format!("spawn_blocking: {e}"))??;

    Ok(TerminalCreateResult { id: result.id, pid: result.pid })
}

#[tauri::command]
pub async fn terminal_write(id: String, data: String, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let pty = state.pty.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = pty.lock().map_err(|e| format!("lock: {e}"))?;
        session.write(&id, data.as_bytes())
    }).await.map_err(|e| format!("spawn_blocking: {e}"))?
}

#[tauri::command]
pub async fn terminal_read(id: String, state: tauri::State<'_, crate::PtyState>) -> Result<String, String> {
    let pty = state.pty.clone();
    let data = tauri::async_runtime::spawn_blocking(move || {
        let session = pty.lock().map_err(|e| format!("lock: {e}"))?;
        session.read(&id)
    }).await.map_err(|e| format!("spawn_blocking: {e}"))??;
    Ok(String::from_utf8_lossy(&data).to_string())
}

#[tauri::command]
pub async fn terminal_resize(id: String, cols: u16, rows: u16, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let pty = state.pty.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = pty.lock().map_err(|e| format!("lock: {e}"))?;
        session.resize(&id, cols, rows)
    }).await.map_err(|e| format!("spawn_blocking: {e}"))?
}

#[tauri::command]
pub async fn terminal_kill(id: String, state: tauri::State<'_, crate::PtyState>) -> Result<(), String> {
    let pty = state.pty.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = pty.lock().map_err(|e| format!("lock: {e}"))?;
        session.kill(&id)
    }).await.map_err(|e| format!("spawn_blocking: {e}"))?
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
    staged: bool,
}

#[derive(serde::Serialize)]
pub struct GitBranchEntry {
    name: String,
    #[serde(rename = "isHead")]
    is_head: bool,
}

#[derive(serde::Serialize)]
pub struct GitCommitEntry {
    oid: String,
    #[serde(rename = "shortOid")]
    short_oid: String,
    message: String,
    author: String,
    email: String,
    time: i64,
    #[serde(rename = "timeOffset")]
    time_offset: i32,
}

#[derive(serde::Serialize)]
pub struct GitStashEntry {
    index: usize,
    message: String,
    oid: String,
}

#[derive(serde::Serialize)]
pub struct GitTagEntry {
    name: String,
    oid: String,
}

#[derive(serde::Serialize)]
pub struct GitRemoteEntry {
    name: String,
    url: String,
}

#[derive(serde::Serialize)]
pub struct GitBlameEntry {
    line: u32,
    #[serde(rename = "commitOid")]
    commit_oid: String,
    #[serde(rename = "commitShort")]
    commit_short: String,
    author: String,
    time: i64,
    summary: String,
}

fn repo_from_state(state: &tauri::State<'_, crate::GitState>) -> Result<GitRepo, String> {
    let guard = state.project_root.lock().map_err(|e| format!("lock: {e}"))?;
    let root = guard.as_ref().ok_or_else(|| "No project root".to_string())?;
    GitRepo::open(root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitStatusEntry>, String> {
    let repo = repo_from_state(&state)?;
    let files = repo.status()?;
    tracing::info!("git_status: {} files", files.len());
    Ok(files
        .into_iter()
        .map(|f| GitStatusEntry {
            path: f.path,
            status: match f.status {
                oceanix_git::StatusKind::Modified => "modified".into(),
                oceanix_git::StatusKind::Added => "added".into(),
                oceanix_git::StatusKind::Deleted => "deleted".into(),
                oceanix_git::StatusKind::Untracked => "untracked".into(),
            oceanix_git::StatusKind::Conflicted => "conflicted".into(),
            },
            staged: f.staged,
        })
        .collect())
}

#[derive(serde::Serialize)]
pub(crate) struct GitStatusGrouped {
    staged: Vec<GitStatusEntry>,
    changes: Vec<GitStatusEntry>,
    merge: Vec<GitStatusEntry>,
    untracked: Vec<GitStatusEntry>,
}

#[tauri::command]
pub fn git_status_grouped(state: tauri::State<'_, crate::GitState>) -> Result<GitStatusGrouped, String> {
    let repo = repo_from_state(&state)?;
    let groups = repo.status_grouped()?;
    let map = |v: Vec<oceanix_git::FileStatus>| -> Vec<GitStatusEntry> {
        v.into_iter().map(|f| GitStatusEntry {
            path: f.path,
            status: match f.status {
                oceanix_git::StatusKind::Modified => "modified".into(),
                oceanix_git::StatusKind::Added => "added".into(),
                oceanix_git::StatusKind::Deleted => "deleted".into(),
                oceanix_git::StatusKind::Untracked => "untracked".into(),
                oceanix_git::StatusKind::Conflicted => "conflicted".into(),
            },
            staged: f.staged,
        }).collect()
    };
    Ok(GitStatusGrouped {
        staged: map(groups.staged),
        changes: map(groups.changes),
        merge: map(groups.merge),
        untracked: map(groups.untracked),
    })
}

#[tauri::command]
pub fn git_diff(path: Option<String>, staged: Option<bool>, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    if staged.unwrap_or(false) {
        Ok(repo.diff_staged()?)
    } else {
        Ok(repo.diff(path.as_deref())?)
    }
}

/// Return the HEAD version of a file (for use as diff original).
#[tauri::command]
pub fn git_show(path: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.show(&path)?)
}

#[tauri::command]
pub fn git_commit(message: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.commit(&message)?)
}

#[tauri::command]
pub fn git_branch_name(state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.branch_name()?)
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
pub fn git_stage(path: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.stage(&path)?)
}

#[tauri::command]
pub fn git_unstage(path: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.unstage(&path)?)
}

#[tauri::command]
pub fn git_push(branch: String, remote: Option<String>, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.push(remote.as_deref().unwrap_or("origin"), &branch)?)
}

#[tauri::command]
pub fn git_pull(branch: String, remote: Option<String>, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.pull(remote.as_deref().unwrap_or("origin"), &branch)?)
}

#[tauri::command]
pub fn git_create_branch(name: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.create_branch(&name)?)
}

#[tauri::command]
pub fn git_switch_branch(name: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.switch_branch(&name)?)
}

#[tauri::command]
pub fn git_delete_branch(name: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.delete_branch(&name)?)
}

// ─── New: Log ──────────────────────────────────────

#[tauri::command]
pub fn git_log(count: usize, state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitCommitEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .log(count)?
        .into_iter()
        .map(|c| GitCommitEntry {
            oid: c.oid,
            short_oid: c.short_oid,
            message: c.message,
            author: c.author,
            email: c.email,
            time: c.time,
            time_offset: c.time_offset,
        })
        .collect())
}

#[tauri::command]
pub fn git_log_file(path: String, count: usize, state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitCommitEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .log_file(&path, count)?
        .into_iter()
        .map(|c| GitCommitEntry {
            oid: c.oid,
            short_oid: c.short_oid,
            message: c.message,
            author: c.author,
            email: c.email,
            time: c.time,
            time_offset: c.time_offset,
        })
        .collect())
}

#[tauri::command]
pub fn git_commit_detail(oid: String, state: tauri::State<'_, crate::GitState>) -> Result<serde_json::Value, String> {
    let repo = repo_from_state(&state)?;
    let info = repo.commit_detail(&oid)?;
    Ok(serde_json::json!({
        "info": {
            "oid": info.oid,
            "shortOid": info.short_oid,
            "message": info.message,
            "author": info.author,
            "email": info.email,
            "time": info.time,
            "timeOffset": info.time_offset,
        },
        "diff": "",
    }))
}

// ─── New: Stash ────────────────────────────────────

#[tauri::command]
pub fn git_stash_save(message: Option<String>, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let mut repo = repo_from_state(&state)?;
    repo.stash_save(message.as_deref())?;
    Ok(())
}

#[tauri::command]
pub fn git_stash_list(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitStashEntry>, String> {
    let mut repo = repo_from_state(&state)?;
    Ok(repo
        .stash_list()?
        .into_iter()
        .map(|s| GitStashEntry { index: s.index, message: s.message, oid: s.oid })
        .collect())
}

#[tauri::command]
pub fn git_stash_pop(index: usize, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let mut repo = repo_from_state(&state)?;
    Ok(repo.stash_pop(index)?)
}

#[tauri::command]
pub fn git_stash_apply(index: usize, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let mut repo = repo_from_state(&state)?;
    Ok(repo.stash_apply(index)?)
}

#[tauri::command]
pub fn git_stash_drop(index: usize, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let mut repo = repo_from_state(&state)?;
    Ok(repo.stash_drop(index)?)
}

// ─── New: Fetch ────────────────────────────────────

#[tauri::command]
pub fn git_fetch(remote: Option<String>, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.fetch(remote.as_deref().unwrap_or("origin"))?)
}

// ─── New: Discard ──────────────────────────────────

#[tauri::command]
pub fn git_discard(path: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.discard(&path)?)
}

// ─── New: Reset ────────────────────────────────────

#[tauri::command]
pub fn git_reset(oid: String, mode: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.reset(&oid, &mode)?)
}

// ─── New: Revert ───────────────────────────────────

#[tauri::command]
pub fn git_revert(oid: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.revert(&oid).map(|_| format!("Reverted {oid}"))?)
}

// ─── New: Cherry-pick ──────────────────────────────

#[tauri::command]
pub fn git_cherry_pick(oid: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.cherry_pick(&oid).map(|_| format!("Cherry-picked {oid}"))?)
}

// ─── New: Merge ────────────────────────────────────

#[tauri::command]
pub fn git_merge_branch(branch: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.merge_branch(&branch)?)
}

// ─── New: Rebase ───────────────────────────────────

#[tauri::command]
pub fn git_rebase(onto: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.rebase(&onto)?)
}

// ─── New: Tags ─────────────────────────────────────

#[tauri::command]
pub fn git_tag_list(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitTagEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .tag_list()?
        .into_iter()
        .map(|t| GitTagEntry { name: t.name, oid: t.oid })
        .collect())
}

#[tauri::command]
pub fn git_tag_create(name: String, message: Option<String>, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.tag_create(&name, message.as_deref())?)
}

#[tauri::command]
pub fn git_tag_delete(name: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.tag_delete(&name)?)
}

// ─── New: Remote management ────────────────────────

#[tauri::command]
pub fn git_remote_list(state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitRemoteEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .remote_list()?
        .into_iter()
        .map(|r| GitRemoteEntry { name: r.name, url: r.url })
        .collect())
}

#[tauri::command]
pub fn git_remote_add(name: String, url: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.remote_add(&name, &url)?)
}

#[tauri::command]
pub fn git_remote_remove(name: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.remote_remove(&name)?)
}

// ─── New: Blame ────────────────────────────────────

#[tauri::command]
pub fn git_blame(path: String, state: tauri::State<'_, crate::GitState>) -> Result<Vec<GitBlameEntry>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo
        .blame(&path)?
        .into_iter()
        .map(|b| GitBlameEntry {
            line: b.line,
            commit_oid: b.commit_oid,
            commit_short: b.commit_short,
            author: b.author,
            time: b.time,
            summary: b.summary,
        })
        .collect())
}

// ─── New: Init / Clone ─────────────────────────────

#[tauri::command]
pub fn git_init(path: String) -> Result<String, String> {
    let _repo = GitRepo::init(&path).map_err(|e| e.to_string())?;
    Ok(format!("Initialized empty Git repository in {}", path))
}

#[tauri::command]
pub fn git_clone(url: String, path: String) -> Result<String, String> {
    let _repo = GitRepo::clone(&url, &path).map_err(|e| e.to_string())?;
    Ok(format!("Cloned {} into {}", url, path))
}

// ─── New: Config ───────────────────────────────────

#[tauri::command]
pub fn git_config_get(key: String, state: tauri::State<'_, crate::GitState>) -> Result<String, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.config_get(&key)?)
}

#[tauri::command]
pub fn git_config_set(key: String, value: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.config_set(&key, &value)?)
}

// ─── New: Conflicts ────────────────────────────────

#[tauri::command]
pub fn git_has_conflicts(state: tauri::State<'_, crate::GitState>) -> Result<bool, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.has_conflicts()?)
}

#[tauri::command]
pub fn git_conflict_files(state: tauri::State<'_, crate::GitState>) -> Result<Vec<String>, String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.conflict_files()?)
}

#[tauri::command]
pub fn git_resolve_conflict(path: String, state: tauri::State<'_, crate::GitState>) -> Result<(), String> {
    let repo = repo_from_state(&state)?;
    Ok(repo.resolve_conflict(&path)?)
}

#[tauri::command]
pub fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current dir: {e}"))
}

#[tauri::command]
pub fn set_cwd(path: String) -> Result<String, String> {
    std::env::set_current_dir(&path)
        .map_err(|e| format!("Failed to set current dir: {e}"))?;
    Ok(path)
}

/// Spawn a new Oceanix IDE window with the given folder as the project root.
/// The new process starts with its working directory set to `path`,
/// so it auto-detects the project root on startup.
#[tauri::command]
pub fn open_new_window(path: String) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {e}"))?;
    std::process::Command::new(exe)
        .current_dir(&path)
        .spawn()
        .map_err(|e| format!("Failed to spawn new window: {e}"))?;
    Ok(())
}

/// Run a shell command and return its stdout + stderr.
#[tauri::command]
pub fn task_run(command: String, cwd: Option<String>) -> Result<String, String> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg(&command);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.arg("-c").arg(&command);
        c
    };
    if let Some(dir) = cwd {
        cmd.current_dir(&dir);
    }
    let output = cmd.output().map_err(|e| format!("Task failed: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(format!("{stdout}{stderr}"))
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
        "rust" => {
            // Try rust-analyzer (standalone) first, then rustup proxy
            if which_exists("rust-analyzer") {
                Some(("rust-analyzer", &[] as &[&str]))
            } else {
                // Fallback: rustup has a proxy if the component is installed
                tracing::warn!("rust-analyzer not found in PATH. Install with: rustup component add rust-analyzer");
                None
            }
        }
        "python" => Some(("pyright-langserver", &["--stdio"] as &[&str])),
        "typescript" | "typescriptreact" | "javascript" => Some(("typescript-language-server", &["--stdio"] as &[&str])),
        _ => None,
    }
}

#[cfg(not(windows))]
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("where")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
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

#[tauri::command]
pub fn lsp_rename(language_id: String, path: String, line: u32, character: u32, new_name: String, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspLocationEdit>, String> {
    let mut guard = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = guard.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = uri_from_path(&path);
    let edits = client.rename(&uri, line, character, &new_name)?;
    Ok(edits.unwrap_or_default().into_iter().map(|e| LspLocationEdit {
        uri: e.uri,
        range_start_line: e.range.start.line,
        range_start_char: e.range.start.character,
        range_end_line: e.range.end.line,
        range_end_char: e.range.end.character,
        new_text: e.new_text,
    }).collect())
}

#[derive(serde::Serialize)]
pub struct LspLocationEdit {
    uri: String,
    range_start_line: u32,
    range_start_char: u32,
    range_end_line: u32,
    range_end_char: u32,
    new_text: String,
}

#[derive(Serialize)]
pub struct LspCompletionItem {
    label: String,
    detail: Option<String>,
    insert_text: Option<String>,
    kind: Option<u32>,
}

#[tauri::command]
pub fn lsp_completion(language_id: String, path: String, line: u32, character: u32, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspCompletionItem>, String> {
    let mut clients = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = clients.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = format!("file://{}", path.replace('\\', "/"));
    let list = client.completion(&uri, line, character)?;
    Ok(list.items.into_iter().map(|i| LspCompletionItem {
        label: i.label,
        detail: i.detail,
        insert_text: i.insert_text,
        kind: i.kind,
    }).collect())
}

#[tauri::command]
pub fn lsp_references(language_id: String, path: String, line: u32, character: u32, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspLocation>, String> {
    let mut clients = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = clients.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = format!("file://{}", path.replace('\\', "/"));
    let locs = client.references(&uri, line, character, true)?;
    Ok(locs.into_iter().map(|l| LspLocation {
        uri: l.uri,
        range_start_line: l.range.start.line,
        range_start_char: l.range.start.character,
        range_end_line: l.range.end.line,
        range_end_char: l.range.end.character,
    }).collect())
}

#[tauri::command]
pub fn lsp_formatting(language_id: String, path: String, tab_size: u32, insert_spaces: bool, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspLocationEdit>, String> {
    let mut clients = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = clients.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = format!("file://{}", path.replace('\\', "/"));
    let edits = client.formatting(&uri, tab_size, insert_spaces)?;
    Ok(edits.into_iter().map(|e| LspLocationEdit {
        uri: e.uri,
        range_start_line: e.range.start.line,
        range_start_char: e.range.start.character,
        range_end_line: e.range.end.line,
        range_end_char: e.range.end.character,
        new_text: e.new_text,
    }).collect())
}

#[derive(Serialize)]
pub struct LspSymbol {
    name: String,
    kind: u32,
    line: u32,
    column: u32,
    children: Vec<LspSymbol>,
}

fn flatten_symbols(symbols: Vec<oceanix_lsp::SymbolInfo>) -> Vec<LspSymbol> {
    symbols.into_iter().map(|s| {
        let children = flatten_symbols(s.children.unwrap_or_default());
        let line = s.range.as_ref().map(|r| r.start.line)
            .or_else(|| s.selection_range.as_ref().map(|r| r.start.line))
            .or_else(|| s.location.as_ref().map(|l| l.range.start.line))
            .unwrap_or(0);
        let column = s.range.as_ref().map(|r| r.start.character)
            .or_else(|| s.selection_range.as_ref().map(|r| r.start.character))
            .or_else(|| s.location.as_ref().map(|l| l.range.start.character))
            .unwrap_or(0);
        LspSymbol { name: s.name, kind: s.kind, line, column, children }
    }).collect()
}

#[tauri::command]
pub fn lsp_document_symbol(language_id: String, path: String, state: tauri::State<'_, crate::LspState>) -> Result<Vec<LspSymbol>, String> {
    let mut clients = state.clients.lock().map_err(|e| format!("lock: {e}"))?;
    let client = clients.get_mut(&language_id).ok_or("LSP not started")?;
    let uri = format!("file://{}", path.replace('\\', "/"));
    let symbols = client.document_symbol(&uri)?;
    Ok(flatten_symbols(symbols))
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
