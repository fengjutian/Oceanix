//! oceanix-git: Git integration crate.
//! Provides Git operations via libgit2 (git2).
//! Zero Tauri dependency.

use std::path::Path;
use tracing::{debug, instrument};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// File status in the working tree or index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatusKind {
    Modified,
    Added,
    Deleted,
    Untracked,
}

/// A file path paired with its git status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStatus {
    pub path: String,
    pub status: StatusKind,
}

/// Lightweight branch info.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
}

// ---------------------------------------------------------------------------
// GitRepo
// ---------------------------------------------------------------------------

/// High-level wrapper around a [`git2::Repository`].
pub struct GitRepo {
    inner: git2::Repository,
}

impl GitRepo {
    /// Open a git repository at `path`. Accepts the repo root or any
    /// subdirectory inside a working tree.
    #[instrument(skip(path))]
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        debug!(?path, "opening git repository");
        let repo = git2::Repository::open(path)
            .map_err(|e| format!("failed to open git repo: {e}"))?;
        debug!("git repository opened");
        Ok(Self { inner: repo })
    }

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    /// Return the working-tree status of every file (unstaged + untracked).
    #[instrument(skip(self))]
    pub fn status(&self) -> Result<Vec<FileStatus>, String> {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true)
            .include_ignored(false)
            .include_unmodified(false);

        let statuses = self
            .inner
            .statuses(Some(&mut opts))
            .map_err(|e| format!("failed to query git status: {e}"))?;

        let mut result = Vec::with_capacity(statuses.len());
        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("<unknown>").to_owned();
            let flags = entry.status();

            let kind = if flags.is_wt_new() && !flags.is_index_new() {
                StatusKind::Untracked
            } else if flags.is_index_new() {
                StatusKind::Added
            } else if flags.is_index_deleted() || flags.is_wt_deleted() {
                StatusKind::Deleted
            } else {
                StatusKind::Modified
            };

            result.push(FileStatus { path, status: kind });
        }

        debug!(count = result.len(), "status collected");
        Ok(result)
    }

    // -----------------------------------------------------------------------
    // Diffs
    // -----------------------------------------------------------------------

    /// Unified diff of unstaged changes (working tree vs index).
    /// When `path` is `Some`, the diff is restricted to that file / directory.
    #[instrument(skip(self))]
    pub fn diff(&self, path: Option<&str>) -> Result<String, String> {
        let mut diff_opts = git2::DiffOptions::new();
        if let Some(p) = path {
            diff_opts.pathspec(p);
        }

        let diff = self
            .inner
            .diff_index_to_workdir(None, Some(&mut diff_opts))
            .map_err(|e| format!("failed to diff workdir: {e}"))?;

        self.render_diff(&diff)
    }

    /// Unified diff of staged changes (index vs HEAD).
    #[instrument(skip(self))]
    pub fn diff_staged(&self) -> Result<String, String> {
        let head_tree = self
            .inner
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok());

        let diff = self
            .inner
            .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut git2::DiffOptions::new()))
            .map_err(|e| format!("failed to diff staged: {e}"))?;

        self.render_diff(&diff)
    }

    // -----------------------------------------------------------------------
    // Commit
    // -----------------------------------------------------------------------

    /// Commit staged changes with `message`. Returns the hex oid of the new
    /// commit.
    #[instrument(skip(self))]
    pub fn commit(&self, message: &str) -> Result<String, String> {
        let repo = &self.inner;

        let sig = repo
            .signature()
            .map_err(|e| format!("failed to get signature: {e}"))?;

        let head = repo.head().map_err(|e| format!("failed to get HEAD: {e}"))?;
        let parent = head
            .peel_to_commit()
            .map_err(|e| format!("failed to peel HEAD to commit: {e}"))?;

        let mut index = repo.index().map_err(|e| format!("failed to get index: {e}"))?;
        let tree_oid = index
            .write_tree()
            .map_err(|e| format!("failed to write tree: {e}"))?;
        let tree = repo
            .find_tree(tree_oid)
            .map_err(|e| format!("failed to find tree: {e}"))?;

        let oid = repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
            .map_err(|e| format!("failed to commit: {e}"))?;

        debug!(%oid, "commit created");
        Ok(oid.to_string())
    }

    // -----------------------------------------------------------------------
    // Branch queries
    // -----------------------------------------------------------------------

    /// Short name of the current branch (e.g. `"main"`).
    #[instrument(skip(self))]
    pub fn branch_name(&self) -> Result<String, String> {
        let head = self
            .inner
            .head()
            .map_err(|e| format!("failed to get HEAD: {e}"))?;

        head.shorthand()
            .map(str::to_owned)
            .ok_or_else(|| "HEAD is detached".to_owned())
    }

    /// All local branches.
    #[instrument(skip(self))]
    pub fn branches(&self) -> Result<Vec<BranchInfo>, String> {
        let head_name = self.branch_name().ok();

        let branches = self
            .inner
            .branches(Some(git2::BranchType::Local))
            .map_err(|e| format!("failed to list branches: {e}"))?;

        let mut result = Vec::new();
        for branch in branches {
            let (branch, _) =
                branch.map_err(|e| format!("failed to read branch: {e}"))?;
            let name = branch
                .name()
                .map_err(|e| format!("failed to get branch name: {e}"))?
                .ok_or_else(|| "invalid UTF-8 branch name".to_owned())?
                .to_owned();

            let is_head = head_name.as_ref() == Some(&name);
            result.push(BranchInfo { name, is_head });
        }

        debug!(count = result.len(), "branches listed");
        Ok(result)
    }

    /// Stage a file (git add).
    #[instrument(skip(self))]
    pub fn stage(&self, path: &str) -> Result<(), String> {
        let mut index = self
            .inner
            .index()
            .map_err(|e| format!("failed to get index: {e}"))?;
        index
            .add_path(std::path::Path::new(path))
            .map_err(|e| format!("failed to stage {path}: {e}"))?;
        index
            .write()
            .map_err(|e| format!("failed to write index: {e}"))?;
        debug!(path, "staged");
        Ok(())
    }

    /// Unstage a file (git reset HEAD -- <path>).
    #[instrument(skip(self))]
    /// Unstage a file (git reset HEAD -- <path>).
    #[instrument(skip(self))]
    pub fn unstage(&self, path: &str) -> Result<(), String> {
        let head = self
            .inner
            .head()
            .map_err(|e| format!("failed to get HEAD: {e}"))?;
        let head_obj = head
            .peel(git2::ObjectType::Commit)
            .map_err(|e| format!("failed to peel HEAD: {e}"))?;
        // git reset HEAD -- <path>
        self.inner
            .reset_default(Some(&head_obj), &[path])
            .map_err(|e| format!("failed to unstage {path}: {e}"))?;
        debug!(path, "unstaged");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn render_diff(&self, diff: &git2::Diff<'_>) -> Result<String, String> {
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
        })
        .map_err(|e| format!("failed to print diff: {e}"))?;
        Ok(buf)
    }
}

// ---------------------------------------------------------------------------
// Module init (called once at startup)
// ---------------------------------------------------------------------------

pub fn init() {
    tracing::info!("oceanix-git initialized");
}
