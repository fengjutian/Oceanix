//! oceanix-ai: Thin MCP bridge layer.
//! Spawns the Python AI sidecar as a child process,
//! forwards messages between frontend and Python via MCP stdio.
//! Zero AI logic — all intelligence lives in `oceanix-ai-server`.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tokio::sync::mpsc;

/// AI bridge state — manages the Python sidecar process
pub struct AiBridge {
    process: Option<Child>,
    ready: bool,
}

/// Response from the AI sidecar
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiResponse {
    pub id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl AiBridge {
    /// Create a new AI bridge (doesn't start the sidecar yet)
    pub fn new() -> Self {
        Self {
            process: None,
            ready: false,
        }
    }

    /// Start the Python sidecar process
    pub fn start(&mut self) -> Result<(), String> {
        let child = Command::new("oceanix-ai")
            .or_else(|_| Command::new("python"))
            .or_else(|_| Command::new("python3"))
            .arg("-m")
            .arg("oceanix_ai_server.server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start AI sidecar: {e}"))?;

        self.process = Some(child);
        self.ready = true;
        tracing::info!("Python AI sidecar started");
        Ok(())
    }

    /// Check if the sidecar is running
    pub fn is_ready(&self) -> bool {
        self.ready
    }

    /// Send a JSON-RPC request to the sidecar and get the response
    pub fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<AiResponse, String> {
        if !self.ready {
            return Err("AI sidecar not running".into());
        }

        let id = req_id();
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        let process = self.process.as_mut().ok_or("No process")?;
        let stdin = process.stdin.as_mut().ok_or("No stdin")?;

        let request_str = serde_json::to_string(&request).map_err(|e| format!("Serialize: {e}"))?;
        writeln!(stdin, "{request_str}").map_err(|e| format!("Write error: {e}"))?;
        stdin.flush().map_err(|e| format!("Flush error: {e}"))?;

        let stdout = process.stdout.as_mut().ok_or("No stdout")?;
        let reader = BufReader::new(stdout);

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Read error: {e}"))?;
            if line.trim().is_empty() {
                continue;
            }

            let response: AiResponse = serde_json::from_str(&line)
                .map_err(|e| format!("Parse error: {e} ({line})"))?;

            if response.id == id {
                return Ok(response);
            }
        }

        Err("No response from AI sidecar".into())
    }

    /// Kill the sidecar process
    pub fn stop(&mut self) {
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
    _tx: mpsc::UnboundedSender<()>,
}

impl SharedAiBridge {
    pub fn new(_tx: mpsc::UnboundedSender<()>) -> Self {
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
