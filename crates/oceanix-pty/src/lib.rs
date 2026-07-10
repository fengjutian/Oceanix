//! oceanix-pty: PTY (pseudo-terminal) crate.
//! Manages multiple terminal sessions via `portable-pty`.
//! Zero Tauri dependency.

use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtySystem, ChildKiller};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tracing::{debug, error, info, warn};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Result returned by [`PtySession::spawn`].
#[derive(Debug, Clone)]
pub struct SpawnResult {
    pub id: String,
    pub pid: u32,
}

// ---------------------------------------------------------------------------
// Internal handle – one per session
// ---------------------------------------------------------------------------

struct PtyHandle {
    master: Box<dyn portable_pty::MasterPty + Send>,
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    child_killer: Box<dyn ChildKiller + Send + Sync>,
    #[allow(dead_code)]
    pid: u32,
}

// ---------------------------------------------------------------------------
// PtySession – the public API
// ---------------------------------------------------------------------------

/// Thread-safe manager for multiple PTY terminal sessions.
pub struct PtySession {
    sessions: Mutex<HashMap<String, PtyHandle>>,
    next_id: AtomicU64,
}

impl PtySession {
    /// Create a new, empty session manager.
    pub fn new() -> Self {
        info!("PtySession manager created");
        Self {
            sessions: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }
    }

    /// Spawn a new PTY session.
    ///
    /// When `shell` is `None` the system shell is auto-detected:
    /// - Unix: `$SHELL` → bash → zsh → fish → sh
    /// - Windows: pwsh → powershell → cmd
    ///
    /// Returns the generated session `id` and the child process `pid`.
    #[tracing::instrument(skip(self))]
    pub fn spawn(&self, shell: Option<&str>) -> Result<SpawnResult, String> {
        let shell_cmd = shell.map(String::from).unwrap_or_else(detect_shell);
        debug!(%shell_cmd, "spawning PTY");

        let pty_sys = native_pty_system();
        let size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_sys.openpty(size).map_err(|e| {
            error!("openpty failed: {e}");
            e.to_string()
        })?;

        let cmd = CommandBuilder::new(&shell_cmd);
        let child = pair.slave.spawn_command(cmd).map_err(|e| {
            error!("spawn_command failed: {e}");
            e.to_string()
        })?;

        let pid = child.process_id().unwrap_or(0);

        let reader = pair.master.try_clone_reader().map_err(|e| {
            error!("try_clone_reader failed: {e}");
            e.to_string()
        })?;

        let writer = pair.master.take_writer().map_err(|e| {
            error!("take_writer failed: {e}");
            e.to_string()
        })?;

        let id = format!("pty-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let handle = PtyHandle {
            master: pair.master,
            reader,
            writer,
            child_killer: child.clone_killer(),
            pid,
        };

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(id.clone(), handle);

        info!(%id, pid, "PTY session spawned");
        Ok(SpawnResult { id, pid })
    }

    /// Non-blocking read from a session. Returns available bytes (empty if none).
    #[tracing::instrument(skip(self))]
    pub fn read(&self, id: &str) -> Result<Vec<u8>, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get_mut(id).ok_or_else(|| {
            warn!(%id, "read on unknown session");
            format!("session {id} not found")
        })?;

        let mut buf = [0u8; 8192];
        match handle.reader.read(&mut buf) {
            Ok(n) if n > 0 => Ok(buf[..n].to_vec()),
            Ok(_) => Ok(Vec::new()),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(Vec::new()),
            Err(e) => {
                error!(%id, "read error: {e}");
                Err(e.to_string())
            }
        }
    }

    /// Write data to a session's PTY.
    #[tracing::instrument(skip(self, data))]
    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get_mut(id).ok_or_else(|| {
            warn!(%id, "write on unknown session");
            format!("session {id} not found")
        })?;

        handle.writer.write_all(data).map_err(|e| {
            error!(%id, "write error: {e}");
            e.to_string()
        })?;
        handle.writer.flush().map_err(|e| {
            error!(%id, "flush error: {e}");
            e.to_string()
        })?;

        Ok(())
    }

    /// Resize the PTY window for a session.
    #[tracing::instrument(skip(self))]
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let handle = sessions.get(id).ok_or_else(|| {
            warn!(%id, "resize on unknown session");
            format!("session {id} not found")
        })?;

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        handle.master.resize(size).map_err(|e| {
            error!(%id, "resize error: {e}");
            e.to_string()
        })?;

        debug!(%id, cols, rows, "PTY resized");
        Ok(())
    }

    /// Kill a session's child process and remove it from the manager.
    #[tracing::instrument(skip(self))]
    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let mut handle = sessions.remove(id).ok_or_else(|| {
            warn!(%id, "kill on unknown session");
            format!("session {id} not found")
        })?;

        handle.child_killer.kill().map_err(|e| {
            error!(%id, "kill error: {e}");
            e.to_string()
        })?;

        info!(%id, "PTY session killed");
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Shell detection
// ---------------------------------------------------------------------------

#[cfg(unix)]
fn detect_shell() -> String {
    if let Ok(sh) = std::env::var("SHELL") {
        if !sh.is_empty() && sh != "/bin/nologin" && sh != "/usr/sbin/nologin" {
            debug!(%sh, "shell from $SHELL");
            return sh;
        }
    }
    for candidate in &["/bin/bash", "/bin/zsh", "/usr/bin/fish", "/bin/sh"] {
        if std::path::Path::new(candidate).exists() {
            debug!(candidate, "shell detected");
            return candidate.to_string();
        }
    }
    "/bin/sh".to_string()
}

#[cfg(windows)]
fn detect_shell() -> String {
    for candidate in &["pwsh.exe", "powershell.exe", "cmd.exe"] {
        if which_exists(candidate) {
            debug!(candidate, "shell detected");
            return candidate.to_string();
        }
    }
    "cmd.exe".to_string()
}

#[cfg(windows)]
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("where")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}
