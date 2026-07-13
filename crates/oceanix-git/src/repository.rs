//! Core repository wrapper around [`git2::Repository`].

use std::path::Path;
use tracing::{debug, instrument};

use crate::error::GitResult;

/// High-level wrapper around a [`git2::Repository`].
pub struct GitRepo {
    pub(crate) inner: git2::Repository,
}

impl GitRepo {
    /// Open a git repository at `path`. Accepts the repo root or any
    /// subdirectory inside a working tree.
    #[instrument(skip(path))]
    pub fn open(path: impl AsRef<Path>) -> GitResult<Self> {
        let path = path.as_ref();
        debug!(?path, "opening git repository");
        let repo = git2::Repository::open(path)?;
        debug!("git repository opened");
        Ok(Self { inner: repo })
    }

    /// Initialize a new git repository at the given path.
    #[instrument(skip(path))]
    pub fn init(path: impl AsRef<Path>) -> GitResult<Self> {
        let repo = git2::Repository::init(path.as_ref())?;
        debug!("repo initialized");
        Ok(Self { inner: repo })
    }

    /// Clone a remote repository.
    #[instrument(skip(path))]
    pub fn clone(url: &str, path: impl AsRef<Path>) -> GitResult<Self> {
        let mut builder = git2::build::RepoBuilder::new();
        let repo = builder.clone(url, path.as_ref())?;
        debug!(url, "cloned");
        Ok(Self { inner: repo })
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl GitRepo {
    /// Render a git2 Diff as unified diff text.
    pub(crate) fn render_diff(&self, diff: &git2::Diff<'_>) -> GitResult<String> {
        let mut buf = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let content = std::str::from_utf8(line.content()).unwrap_or("");
            match line.origin() {
                'F' | 'H' | ' ' => buf.push_str(content),
                '+' | '-' => {
                    buf.push(line.origin());
                    buf.push_str(content);
                }
                _ => {}
            }
            true
        })?;
        Ok(buf)
    }
}
