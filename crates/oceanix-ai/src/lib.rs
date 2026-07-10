//! oceanix-ai: Thin MCP bridge layer.
//! Spawns the Python AI sidecar as a child process,
//! forwards messages between frontend and Python via MCP stdio.
//! Zero AI logic — all intelligence lives in `oceanix-ai-server`.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc as tokio_mpsc;

/// AI bridge state — manages the Python sidecar process
pub struct AiBridge {
    process: Option<Child>,
    ready: bool,
    /// Receives lines from the persistent stdout reader thread
    response_rx: Option<mpsc::Receiver<Result<String, String>>>,
}

/// Response from the AI sidecar (MCP protocol)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiResponse {
    pub id: String,
    /// MCP returns result.content[0].text; we flatten it here
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Parse MCP tool result into a flat JSON value.
/// MCP returns: {"content": [{"type": "text", "text": "..."}]}
/// We extract the text or return the raw result.
pub fn flatten_mcp_result(result: &Option<serde_json::Value>) -> Option<serde_json::Value> {
    let result = result.as_ref()?;
    // Try MCP content format
    if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
        if let Some(first) = content.first() {
            if let Some(text) = first.get("text").and_then(|t| t.as_str()) {
                return Some(serde_json::Value::String(text.to_string()));
            }
        }
    }
    // Fallback: return the raw result
    Some(result.clone())
}

impl AiBridge {
    /// Create a new AI bridge (doesn't start the sidecar yet)
    pub fn new() -> Self {
        Self {
            process: None,
            ready: false,
            response_rx: None,
        }
    }

    /// Start the Python sidecar process
    pub fn start(&mut self) -> Result<(), String> {
        let child = ["oceanix-ai", "python", "python3"]
            .iter()
            .find_map(|bin| {
                Command::new(bin)
                    .arg("-m")
                    .arg("oceanix_ai_server.server")
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::inherit())
                    .spawn()
                    .ok()
            })
            .ok_or_else(|| "Failed to start AI sidecar: no suitable binary found (tried oceanix-ai, python, python3)".to_string())?;

        // Take stdout from the child and spawn a persistent reader thread.
        // This decouples reading from request timing so we can use recv_timeout.
        let stdout = child.stdout.take().ok_or("No stdout")?;
        let (tx, rx) = mpsc::channel::<Result<String, String>>();
        std::thread::Builder::new()
            .name("ai-sidecar-reader".into())
            .spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    let msg = match line {
                        Ok(l) => Ok(l),
                        Err(e) => Err(format!("Read error: {e}")),
                    };
                    if tx.send(msg).is_err() {
                        break; // receiver dropped — bridge shut down
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn reader thread: {e}"))?;

        self.process = Some(child);
        self.response_rx = Some(rx);
        self.ready = true;
        tracing::info!("Python AI sidecar started");
        Ok(())
    }

    /// Check if the sidecar is running
    pub fn is_ready(&self) -> bool {
        self.ready
    }

    /// Send a tool call request to the MCP sidecar
    pub fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<AiResponse, String> {
        if !self.ready {
            return Err("AI sidecar not running".into());
        }

        let id = req_id();
        // MCP protocol: tools/call with {name, arguments}
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": {
                "name": method,
                "arguments": params,
            },
        });

        let process = self.process.as_mut().ok_or("No process")?;
        let stdin = process.stdin.as_mut().ok_or("No stdin")?;

        let request_str = serde_json::to_string(&request).map_err(|e| format!("Serialize: {e}"))?;
        writeln!(stdin, "{request_str}").map_err(|e| format!("Write error: {e}"))?;
        stdin.flush().map_err(|e| format!("Flush error: {e}"))?;

        // Check if the process crashed before we start waiting for a response
        match process.try_wait() {
            Ok(Some(status)) => return Err(format!("Sidecar exited: {status}")),
            Ok(None) => {}
            Err(e) => return Err(format!("Process check error: {e}")),
        }

        let rx = self.response_rx.as_ref().ok_or("No response channel")?;
        let timeout = Duration::from_secs(30);

        loop {
            match rx.recv_timeout(timeout) {
                Ok(Ok(line)) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let response: AiResponse = serde_json::from_str(&line)
                        .map_err(|e| format!("Parse error: {e} ({line})"))?;
                    if response.id == id {
                        return Ok(response);
                    }
                    // Not our response — keep reading (the sidecar may send
                    // notifications or responses to other requests)
                }
                Ok(Err(e)) => return Err(e),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    let _ = process.kill();
                    let _ = process.wait();
                    self.ready = false;
                    return Err("AI sidecar timed out after 30s".into());
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("AI sidecar stdout closed unexpectedly".into());
                }
            }
        }
    }

    /// Kill the sidecar process
    pub fn stop(&mut self) {
        // Drop the receiver first — this unblocks the reader thread
        self.response_rx = None;
        if let Some(ref mut child) = self.process {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.ready = false;
        tracing::info!("Python AI sidecar stopped");
    }
}

impl Drop for AiBridge {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Thread-safe wrapper around AiBridge
pub struct SharedAiBridge {
    inner: Mutex<AiBridge>,
    _tx: tokio_mpsc::UnboundedSender<()>,
}

impl SharedAiBridge {
    pub fn new(_tx: tokio_mpsc::UnboundedSender<()>) -> Self {
        Self {
            inner: Mutex::new(AiBridge::new()),
            _tx,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        self.inner.lock().map_err(|e| format!("Lock: {e}"))?.start()
    }

    pub fn send(&self, method: &str, params: serde_json::Value) -> Result<AiResponse, String> {
        self.inner.lock().map_err(|e| format!("Lock: {e}"))?.send_request(method, params)
    }
}

/// Generate a unique request ID (timestamp-based, not RFC 4122 UUID)
fn req_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("req-{ts:x}")
}
