//! oceanix-lsp: LSP client crate.
//! Manages Language Server processes and JSON-RPC communication over stdio.
//! Zero Tauri dependency.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tracing::{debug, error, info};

// ─── JSON-RPC wire types ─────────────────────────────

#[derive(Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    params: Value,
}

#[derive(Deserialize, Debug, Clone)]
pub struct JsonRpcResponse {
    #[allow(dead_code)]
    pub jsonrpc: Option<String>,
    pub id: Option<u64>,
    pub result: Option<Value>,
    pub error: Option<Value>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct JsonRpcNotification {
    #[allow(dead_code)]
    pub jsonrpc: Option<String>,
    pub method: String,
    pub params: Option<Value>,
}

// ─── LSP protocol types ──────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Location {
    pub uri: String,
    pub range: Range,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Diagnostic {
    pub range: Range,
    pub severity: Option<u32>,
    pub message: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HoverResult {
    pub contents: Value,
    #[serde(default)]
    pub range: Option<Range>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompletionItem {
    pub label: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub insert_text: Option<String>,
    #[serde(default)]
    pub kind: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompletionList {
    pub is_incomplete: bool,
    pub items: Vec<CompletionItem>,
}

/// Document symbol (outline entry).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SymbolInfo {
    pub name: String,
    pub kind: u32,
    #[serde(default)]
    pub location: Option<Location>,
    #[serde(default)]
    pub children: Option<Vec<SymbolInfo>>,
}

/// Flat text edit for rename results.
#[derive(Debug, Clone, Serialize)]
pub struct TextEdit {
    pub uri: String,
    pub range: Range,
    pub new_text: String,
}

#[derive(Deserialize, Debug, Clone)]
struct RawTextEdit {
    range: Range,
    new_text: String,
}

/// Flat diagnostic for crossing FFI / Tauri boundary.
#[derive(Debug, Clone, Serialize)]
pub struct FlatDiagnostic {
    pub file: String,
    pub line: u32,
    pub column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub severity: u32,
    pub message: String,
    pub source: String,
}

impl FlatDiagnostic {
    fn from_lsp(uri: &str, d: &Diagnostic) -> Self {
        // Strip file:// prefix
        let file = uri.strip_prefix("file://").unwrap_or(uri).to_string();
        Self {
            file,
            line: d.range.start.line,
            column: d.range.start.character,
            end_line: d.range.end.line,
            end_column: d.range.end.character,
            severity: d.severity.unwrap_or(2), // 1=error, 2=warning, 3=info
            message: d.message.clone(),
            source: d.source.clone().unwrap_or_default(),
        }
    }
}

// ─── LSP Client ──────────────────────────────────────

pub struct LspClient {
    #[allow(dead_code)]
    process: Child,
    stdin: Box<dyn Write + Send>,
    reader: BufReader<Box<dyn Read + Send>>,
    next_id: AtomicU64,
    diagnostics: Mutex<Vec<FlatDiagnostic>>,
    root_uri: String,
}

impl LspClient {
    /// Start a language server process and send the `initialize` request.
    pub fn start(command: &str, args: &[&str], root_path: &str) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to spawn LSP server '{command}': {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "No stdin".to_string())?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "No stdout".to_string())?;

        let root_uri = format!(
            "file://{}",
            std::fs::canonicalize(root_path)
                .unwrap_or_else(|_| root_path.into())
                .to_string_lossy()
                .replace('\\', "/")
        );

        let mut client = Self {
            process: child,
            stdin: Box::new(stdin),
            reader: BufReader::new(Box::new(stdout)),
            next_id: AtomicU64::new(1),
            diagnostics: Mutex::new(Vec::new()),
            root_uri,
        };

        // Send initialize request
        let init_params = serde_json::json!({
            "processId": std::process::id(),
            "rootUri": client.root_uri,
            "capabilities": {
                "textDocument": {
                    "hover": { "contentFormat": ["markdown", "plaintext"] },
                    "definition": { "linkSupport": true },
                    "references": {},
                    "completion": { "completionItem": { "snippetSupport": true } }
                }
            },
            "workspaceFolders": [{ "uri": client.root_uri, "name": "root" }]
        });
        client.send_request("initialize", init_params)?;
        let _resp = client.read_response()?;

        // Send initialized notification
        client.send_notification("initialized", serde_json::json!({}))?;

        info!("LSP server '{command}' initialized at {}", client.root_uri);
        Ok(client)
    }

    /// Notify the server that a document was opened.
    pub fn did_open(
        &mut self,
        uri: &str,
        language_id: &str,
        text: &str,
    ) -> Result<(), String> {
        let params = serde_json::json!({
            "textDocument": {
                "uri": uri,
                "languageId": language_id,
                "version": 1,
                "text": text,
            }
        });
        self.send_notification("textDocument/didOpen", params)
    }

    /// Notify the server that a document changed.
    pub fn did_change(
        &mut self,
        uri: &str,
        version: u32,
        text: &str,
    ) -> Result<(), String> {
        let params = serde_json::json!({
            "textDocument": {
                "uri": uri,
                "version": version,
            },
            "contentChanges": [{ "text": text }]
        });
        self.send_notification("textDocument/didChange", params)
    }

    /// Request hover information at a position.
    pub fn hover(&mut self, uri: &str, line: u32, character: u32) -> Result<Option<HoverResult>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });
        let resp = self.send_request("textDocument/hover", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(None);
            }
            Ok(Some(serde_json::from_value(result).map_err(|e| format!("parse hover: {e}"))?))
        } else {
            Ok(None)
        }
    }

    /// Request definition location(s).
    pub fn definition(&mut self, uri: &str, line: u32, character: u32) -> Result<Vec<Location>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });
        let resp = self.send_request("textDocument/definition", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(vec![]);
            }
            if let Ok(loc) = serde_json::from_value::<Location>(result.clone()) {
                Ok(vec![loc])
            } else if let Ok(locs) = serde_json::from_value::<Vec<Location>>(result) {
                Ok(locs)
            } else {
                Ok(vec![])
            }
        } else {
            Ok(vec![])
        }
    }

    /// Request rename at a position, returns workspace edits.
    pub fn rename(
        &mut self,
        uri: &str,
        line: u32,
        character: u32,
        new_name: &str,
    ) -> Result<Option<Vec<TextEdit>>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "newName": new_name,
        });
        let resp = self.send_request("textDocument/rename", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(None);
            }
            // Parse WorkspaceEdit → extract text edits
            if let Some(changes) = result.get("changes") {
                let edits: Vec<TextEdit> = changes
                    .as_object()
                    .map(|obj| {
                        obj.iter().flat_map(|(uri_str, edits_val)| {
                            let uri = uri_str.clone();
                            serde_json::from_value::<Vec<RawTextEdit>>(edits_val.clone())
                                .unwrap_or_default()
                                .into_iter()
                                .map(move |e| TextEdit {
                                    uri: uri.clone(),
                                    range: e.range,
                                    new_text: e.new_text,
                                })
                                .collect::<Vec<_>>()
                        }).collect()
                    })
                    .unwrap_or_default();
                Ok(Some(edits))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    /// Drain accumulated diagnostics.
    pub fn take_diagnostics(&self) -> Vec<FlatDiagnostic> {
        let mut guard = self.diagnostics.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *guard)
    }

    /// Request completion items at a position.
    pub fn completion(&mut self, uri: &str, line: u32, character: u32) -> Result<CompletionList, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character }
        });
        let resp = self.send_request("textDocument/completion", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(CompletionList { is_incomplete: false, items: vec![] });
            }
            serde_json::from_value(result).map_err(|e| format!("parse completion: {e}"))
        } else {
            Ok(CompletionList { is_incomplete: false, items: vec![] })
        }
    }

    /// Request references to the symbol at a position.
    pub fn references(&mut self, uri: &str, line: u32, character: u32, include_declaration: bool) -> Result<Vec<Location>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "position": { "line": line, "character": character },
            "context": { "includeDeclaration": include_declaration }
        });
        let resp = self.send_request("textDocument/references", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(vec![]);
            }
            serde_json::from_value::<Vec<Location>>(result).map_err(|e| format!("parse references: {e}"))
        } else {
            Ok(vec![])
        }
    }

    /// Request document formatting.
    pub fn formatting(&mut self, uri: &str, tab_size: u32, insert_spaces: bool) -> Result<Vec<TextEdit>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri },
            "options": { "tabSize": tab_size, "insertSpaces": insert_spaces }
        });
        let resp = self.send_request("textDocument/formatting", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(vec![]);
            }
            serde_json::from_value::<Vec<RawTextEdit>>(result)
                .map(|edits| {
                    edits.into_iter().map(|e| TextEdit {
                        uri: uri.to_string(),
                        range: e.range,
                        new_text: e.new_text,
                    }).collect()
                })
                .map_err(|e| format!("parse formatting: {e}"))
        } else {
            Ok(vec![])
        }
    }

    /// Request document symbols (outline).
    pub fn document_symbol(&mut self, uri: &str) -> Result<Vec<SymbolInfo>, String> {
        let params = serde_json::json!({
            "textDocument": { "uri": uri }
        });
        let resp = self.send_request("textDocument/documentSymbol", params)?;
        if let Some(result) = resp.result {
            if result.is_null() {
                return Ok(vec![]);
            }
            serde_json::from_value::<Vec<SymbolInfo>>(result)
                .map_err(|e| format!("parse symbols: {e}"))
        } else {
            Ok(vec![])
        }
    }

    /// Poll for incoming messages (notifications) — call this regularly.
    pub fn poll(&self) -> Result<(), String> {
        // Notifications are now handled inline during read_response.
        // poll() is a no-op retained for API compatibility.
        Ok(())
    }

    // ─── internals ────────────────────────────────────

    fn send_request(&mut self, method: &str, params: Value) -> Result<JsonRpcResponse, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };
        let payload = serde_json::to_string(&req).map_err(|e| format!("serialize: {e}"))?;
        let header = format!("Content-Length: {}\r\n\r\n", payload.len());
        self.stdin
            .write_all(header.as_bytes())
            .and_then(|_| self.stdin.write_all(payload.as_bytes()))
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("write request: {e}"))?;

        // Read responses until we match the id
        loop {
            let resp = self.read_response()?;
            // Skip notifications (no id) — keep reading
            if resp.id.is_none() {
                continue;
            }
            if resp.id == Some(id) {
                return Ok(resp);
            }
        }
    }

    fn send_notification(&mut self, method: &str, params: Value) -> Result<(), String> {
        let notif = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        let payload = serde_json::to_string(&notif).map_err(|e| format!("serialize: {e}"))?;
        let header = format!("Content-Length: {}\r\n\r\n", payload.len());
        self.stdin
            .write_all(header.as_bytes())
            .and_then(|_| self.stdin.write_all(payload.as_bytes()))
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("write notification: {e}"))?;
        Ok(())
    }

    fn read_response(&mut self) -> Result<JsonRpcResponse, String> {
        // Read Content-Length header
        let mut header = String::new();
        loop {
            let mut line = String::new();
            self.reader
                .read_line(&mut line)
                .map_err(|e| format!("read header: {e}"))?;
            if line == "\r\n" || line == "\n" || line.is_empty() {
                break;
            }
            header.push_str(&line);
        }

        let content_len = header
            .lines()
            .find_map(|l| {
                l.to_lowercase()
                    .strip_prefix("content-length:")
                    .map(|s| s.trim().parse::<usize>().ok())
                    .flatten()
            })
            .ok_or_else(|| format!("missing Content-Length header: {header:?}"))?;

        let mut body = vec![0u8; content_len];
        self.reader
            .read_exact(&mut body)
            .map_err(|e| format!("read body ({content_len} bytes): {e}"))?;

        let text = String::from_utf8_lossy(&body);

        // Parse as generic JSON first to detect notifications (no `id`)
        let value: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| {
                error!(?text, "JSON parse error");
                format!("parse response: {e}")
            })?;

        // Notifications have a `method` field and no `id`
        if value.get("id").is_none() {
            if let Some(method) = value.get("method").and_then(|m| m.as_str()) {
                self.handle_notification(method, value.get("params"));
            }
            // Return a dummy response to keep the request loop going
            return Ok(JsonRpcResponse {
                jsonrpc: None,
                id: None,
                result: None,
                error: None,
            });
        }

        serde_json::from_value(value).map_err(|e| format!("parse response: {e}"))
    }

    fn handle_notification(&self, method: &str, params: Option<&serde_json::Value>) {
        match method {
            "textDocument/publishDiagnostics" => {
                if let Some(params) = params {
                    if let Some(uri) = params.get("uri").and_then(|u| u.as_str()) {
                        if let Some(diags) = params.get("diagnostics").and_then(|d| d.as_array()) {
                            let mut collected = self.diagnostics.lock().unwrap_or_else(|e| e.into_inner());
                            for diag in diags {
                                if let Ok(d) = serde_json::from_value::<Diagnostic>(diag.clone()) {
                                    collected.push(FlatDiagnostic::from_lsp(uri, &d));
                                }
                            }
                        }
                    }
                }
            }
            _ => {
                debug!(method, "unhandled LSP notification");
            }
        }
    }
}

// ─── Module init ─────────────────────────────────────

pub fn init() {
    tracing::info!("oceanix-lsp initialized");
}
