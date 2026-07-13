//! Status and diff operations.

use std::path::Path;
use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::{FileStatus, StatusGroups, StatusKind};

impl GitRepo {
    /// Return status of all changed files. A file may appear twice:
    /// once with `staged: true` (index vs HEAD) and once with `staged: false`
    /// (worktree vs index) if it has both staged and unstaged changes.
    #[instrument(skip(self))]
    pub fn status(&self) -> GitResult<Vec<FileStatus>> {
        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true)
            .include_ignored(false)
            .include_unmodified(false);

        let statuses = self.inner.statuses(Some(&mut opts))?;

        let mut result = Vec::new();
        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("<unknown>").to_owned();
            let flags = entry.status();

            // Index changes → staged
            if flags.is_index_new() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Added, staged: true });
            }
            if flags.is_index_modified() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: true });
            }
            if flags.is_index_deleted() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Deleted, staged: true });
            }
            if flags.is_index_renamed() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: true });
            }
            if flags.is_index_typechange() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: true });
            }

            // Worktree changes → unstaged
            if flags.is_wt_new() && !flags.is_index_new() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Untracked, staged: false });
            }
            if flags.is_wt_modified() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: false });
            }
            if flags.is_wt_deleted() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Deleted, staged: false });
            }
            if flags.is_wt_renamed() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: false });
            }
            if flags.is_wt_typechange() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: false });
            }

            // Conflicted
            if flags.is_conflicted() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Conflicted, staged: false });
            }
        }

        debug!(count = result.len(), "status collected");
        Ok(result)
    }

    /// Unified diff of unstaged changes (working tree vs index).
    /// When `path` is `Some`, the diff is restricted to that file / directory.
    #[instrument(skip(self))]
    pub fn diff(&self, path: Option<&str>) -> GitResult<String> {
        let mut diff_opts = git2::DiffOptions::new();
        if let Some(p) = path {
            diff_opts.pathspec(p);
        }

        let diff = self
            .inner
            .diff_index_to_workdir(None, Some(&mut diff_opts))?;

        self.render_diff(&diff)
    }

    /// Unified diff of staged changes (index vs HEAD).
    #[instrument(skip(self))]
    pub fn diff_staged(&self) -> GitResult<String> {
        let head_tree = self
            .inner
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok());

        let diff = self
            .inner
            .diff_tree_to_index(head_tree.as_ref(), None, Some(&mut git2::DiffOptions::new()))?;

        self.render_diff(&diff)
    }

    /// Return status grouped into Staged / Changes / Merge / Untracked.
    /// Matches VSCode's resource group model so the frontend doesn't need
    /// to re-filter the flat list.
    #[instrument(skip(self))]
    pub fn status_grouped(&self) -> GitResult<StatusGroups> {
        let files = self.status()?;
        Ok(StatusGroups {
            staged: files.iter().filter(|f| f.staged).cloned().collect(),
            changes: files.iter().filter(|f| !f.staged && f.status != StatusKind::Untracked && f.status != StatusKind::Conflicted).cloned().collect(),
            merge: files.iter().filter(|f| f.status == StatusKind::Conflicted).cloned().collect(),
            untracked: files.iter().filter(|f| f.status == StatusKind::Untracked).cloned().collect(),
        })
    }
    #[instrument(skip(self))]
    pub fn show(&self, path: &str) -> GitResult<String> {
        let head = self.inner.head()?;
        let commit = head.peel_to_commit()?;
        let tree = commit.tree()?;
        let entry = tree.get_path(Path::new(path))?;
        let blob = self.inner.find_blob(entry.id())?;
        Ok(String::from_utf8_lossy(blob.content()).to_string())
    }
}
