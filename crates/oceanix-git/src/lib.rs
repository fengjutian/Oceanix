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
    /// Whether this change is staged (index vs HEAD) or unstaged (worktree vs index).
    pub staged: bool,
}

/// Lightweight branch info.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
}

/// A single commit in the log.
#[derive(Debug, Clone)]
pub struct CommitInfo {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub time_offset: i32,
}

/// A stash entry.
#[derive(Debug, Clone)]
pub struct StashInfo {
    pub index: usize,
    pub message: String,
    pub oid: String,
}

/// A tag entry.
#[derive(Debug, Clone)]
pub struct TagInfo {
    pub name: String,
    pub oid: String,
}

/// A remote entry.
#[derive(Debug, Clone)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

/// Blame hunk for a single file line.
#[derive(Debug, Clone)]
pub struct BlameHunk {
    pub line: u32,
    pub commit_oid: String,
    pub commit_short: String,
    pub author: String,
    pub time: i64,
    pub summary: String,
}

/// Result of a merge analysis.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeAnalysis {
    UpToDate,
    FastForward,
    Normal,
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

    /// Return status of all changed files. A file may appear twice:
    /// once with `staged: true` (index vs HEAD) and once with `staged: false`
    /// (worktree vs index) if it has both staged and unstaged changes.
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

            // Conflicted — treat as unstaged Modified
            if flags.is_conflicted() {
                result.push(FileStatus { path: path.clone(), status: StatusKind::Modified, staged: false });
            }
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
    /// Returns "(detached)" when HEAD is not a branch.
    #[instrument(skip(self))]
    pub fn branch_name(&self) -> Result<String, String> {
        match self.inner.head() {
            Ok(head) => {
                if let Some(name) = head.shorthand() {
                    Ok(name.to_owned())
                } else {
                    Ok("(detached)".to_owned())
                }
            }
            Err(e) => {
                // Repo may have no commits yet
                debug!("HEAD not found: {e}");
                Ok("(no commits)".to_owned())
            }
        }
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

    // -----------------------------------------------------------------------
    // Log — commit history
    // -----------------------------------------------------------------------

    /// Return the last `count` commits from HEAD.
    #[instrument(skip(self))]
    pub fn log(&self, count: usize) -> Result<Vec<CommitInfo>, String> {
        let mut revwalk = self
            .inner
            .revwalk()
            .map_err(|e| format!("revwalk: {e}"))?;
        revwalk.push_head().map_err(|e| format!("push HEAD: {e}"))?;
        revwalk.set_sorting(git2::Sort::TIME).map_err(|e| format!("set sorting: {e}"))?;

        let mut result = Vec::with_capacity(count);
        for (i, oid) in revwalk.enumerate() {
            if i >= count {
                break;
            }
            let oid = oid.map_err(|e| format!("revwalk oid: {e}"))?;
            let commit = self
                .inner
                .find_commit(oid)
                .map_err(|e| format!("find commit: {e}"))?;
            let author = commit.author();
            result.push(CommitInfo {
                oid: oid.to_string(),
                short_oid: oid.to_string()[..7].to_string(),
                message: commit
                    .message()
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned(),
                author: author.name().unwrap_or("unknown").to_owned(),
                email: author.email().unwrap_or("").to_owned(),
                time: commit.time().seconds(),
                time_offset: commit.time().offset_minutes() * 60,
            });
        }
        debug!(count = result.len(), "log collected");
        Ok(result)
    }

    /// Commit history for a specific file.
    #[instrument(skip(self))]
    pub fn log_file(&self, path: &str, count: usize) -> Result<Vec<CommitInfo>, String> {
        let mut revwalk = self
            .inner
            .revwalk()
            .map_err(|e| format!("revwalk: {e}"))?;
        revwalk.push_head().map_err(|e| format!("push HEAD: {e}"))?;
        revwalk.set_sorting(git2::Sort::TIME).map_err(|e| format!("set sorting: {e}"))?;

        let mut result = Vec::new();
        for oid_result in revwalk {
            if result.len() >= count {
                break;
            }
            let oid = oid_result.map_err(|e| format!("revwalk oid: {e}"))?;
            let commit = self
                .inner
                .find_commit(oid)
                .map_err(|e| format!("find commit: {e}"))?;

            // Check if this commit touched the file
            if commit.parent_count() == 0 {
                let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
                if tree.get_path(Path::new(path)).is_ok() {
                    let author = commit.author();
                    result.push(CommitInfo {
                        oid: oid.to_string(),
                        short_oid: oid.to_string()[..7].to_string(),
                        message: commit.message().unwrap_or("").lines().next().unwrap_or("").to_owned(),
                        author: author.name().unwrap_or("unknown").to_owned(),
                        email: author.email().unwrap_or("").to_owned(),
                        time: commit.time().seconds(),
                        time_offset: commit.time().offset_minutes() * 60,
                    });
                }
            } else {
                let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
                for parent_idx in 0..commit.parent_count() {
                    let parent = commit.parent(parent_idx).map_err(|e| format!("parent: {e}"))?;
                    let parent_tree = parent.tree().map_err(|e| format!("parent tree: {e}"))?;
                    let diff = self
                        .inner
                        .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                        .map_err(|e| format!("diff: {e}"))?;
                    let mut found = false;
                    diff.foreach(
                        &mut |delta, _| {
                            if delta.new_file().path() == Some(Path::new(path))
                                || delta.old_file().path() == Some(Path::new(path))
                            {
                                found = true;
                                false
                            } else {
                                true
                            }
                        },
                        None,
                        None,
                        None,
                    )
                    .map_err(|e| format!("diff foreach: {e}"))?;
                    if found {
                        let author = commit.author();
                        result.push(CommitInfo {
                            oid: oid.to_string(),
                            short_oid: oid.to_string()[..7].to_string(),
                            message: commit.message().unwrap_or("").lines().next().unwrap_or("").to_owned(),
                            author: author.name().unwrap_or("unknown").to_owned(),
                            email: author.email().unwrap_or("").to_owned(),
                            time: commit.time().seconds(),
                            time_offset: commit.time().offset_minutes() * 60,
                        });
                        break;
                    }
                }
            }
        }
        debug!(count = result.len(), path, "file log collected");
        Ok(result)
    }

    /// Get a single commit detail (with full diff).
    #[instrument(skip(self))]
    pub fn commit_detail(&self, oid_str: &str) -> Result<(CommitInfo, String), String> {
        let oid = git2::Oid::from_str(oid_str)
            .map_err(|e| format!("invalid oid: {e}"))?;
        let commit = self
            .inner
            .find_commit(oid)
            .map_err(|e| format!("find commit: {e}"))?;
        let author = commit.author();

        let info = CommitInfo {
            oid: oid.to_string(),
            short_oid: oid.to_string()[..7].to_string(),
            message: commit.message().unwrap_or("").to_owned(),
            author: author.name().unwrap_or("unknown").to_owned(),
            email: author.email().unwrap_or("").to_owned(),
            time: commit.time().seconds(),
            time_offset: commit.time().offset_minutes() * 60,
        };

        let diff = if commit.parent_count() > 0 {
            let parent = commit.parent(0).map_err(|e| format!("parent: {e}"))?;
            let parent_tree = parent.tree().map_err(|e| format!("tree: {e}"))?;
            let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
            let d = self
                .inner
                .diff_tree_to_tree(Some(&parent_tree), Some(&tree), None)
                .map_err(|e| format!("diff: {e}"))?;
            self.render_diff(&d)?
        } else {
            let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
            let d = self
                .inner
                .diff_tree_to_tree(None, Some(&tree), None)
                .map_err(|e| format!("diff: {e}"))?;
            self.render_diff(&d)?
        };

        Ok((info, diff))
    }

    // -----------------------------------------------------------------------
    // Stage / Unstage
    // -----------------------------------------------------------------------

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
    pub fn unstage(&self, path: &str) -> Result<(), String> {
        let head = self
            .inner
            .head()
            .map_err(|e| format!("failed to get HEAD: {e}"))?;
        let head_obj = head
            .peel(git2::ObjectType::Commit)
            .map_err(|e| format!("failed to peel HEAD: {e}"))?;
        self.inner
            .reset_default(Some(&head_obj), &[path])
            .map_err(|e| format!("failed to unstage {path}: {e}"))?;
        debug!(path, "unstaged");
        Ok(())
    }

    /// Discard changes to a file (git restore / git checkout -- <file>).
    #[instrument(skip(self))]
    pub fn discard(&self, path: &str) -> Result<(), String> {
        // Checkout the file from HEAD to working directory
        let head = self
            .inner
            .head()
            .map_err(|e| format!("failed to get HEAD: {e}"))?;
        let head_obj = head
            .peel(git2::ObjectType::Commit)
            .map_err(|e| format!("failed to peel HEAD: {e}"))?;
        let mut opts = git2::build::CheckoutBuilder::new();
        opts.force();
        opts.path(Path::new(path));
        self.inner
            .checkout_tree(&head_obj, Some(&mut opts))
            .map_err(|e| format!("failed to discard {path}: {e}"))?;
        debug!(path, "discarded");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Stash
    // -----------------------------------------------------------------------

    /// Stash working directory changes (git stash push).
    #[instrument(skip(self))]
    pub fn stash_save(&mut self, message: Option<&str>) -> Result<(), String> {
        let sig = self
            .inner
            .signature()
            .map_err(|e| format!("signature: {e}"))?;
        let msg = message.unwrap_or("WIP on stash");
        self.inner
            .stash_save(&sig, msg, None)
            .map_err(|e| format!("stash save: {e}"))?;
        debug!("stash saved");
        Ok(())
    }

    /// List all stashes.
    #[instrument(skip(self))]
    pub fn stash_list(&mut self) -> Result<Vec<StashInfo>, String> {
        let mut result = Vec::new();
        self.inner
            .stash_foreach(|index, message, &oid| {
                result.push(StashInfo {
                    index,
                    message: message.to_owned(),
                    oid: oid.to_string(),
                });
                true
            })
            .map_err(|e| format!("stash foreach: {e}"))?;
        debug!(count = result.len(), "stash list");
        Ok(result)
    }

    /// Apply a stash without removing it (git stash apply).
    #[instrument(skip(self))]
    pub fn stash_apply(&mut self, index: usize) -> Result<(), String> {
        self.inner
            .stash_apply(index, None)
            .map_err(|e| format!("stash apply: {e}"))?;
        debug!(index, "stash applied");
        Ok(())
    }

    /// Pop a stash (apply + drop) (git stash pop).
    #[instrument(skip(self))]
    pub fn stash_pop(&mut self, index: usize) -> Result<(), String> {
        self.inner
            .stash_pop(index, None)
            .map_err(|e| format!("stash pop: {e}"))?;
        debug!(index, "stash popped");
        Ok(())
    }

    /// Drop a stash without applying it.
    #[instrument(skip(self))]
    pub fn stash_drop(&mut self, index: usize) -> Result<(), String> {
        self.inner
            .stash_drop(index)
            .map_err(|e| format!("stash drop: {e}"))?;
        debug!(index, "stash dropped");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Fetch
    // -----------------------------------------------------------------------

    /// Fetch from a remote without merging (git fetch).
    #[instrument(skip(self))]
    pub fn fetch(&self, remote: &str) -> Result<(), String> {
        let mut remote = self
            .inner
            .find_remote(remote)
            .map_err(|e| format!("remote '{remote}' not found: {e}"))?;
        let mut fetch_opts = git2::FetchOptions::new();
        remote
            .fetch(&[] as &[&str], Some(&mut fetch_opts), None)
            .map_err(|e| format!("fetch failed: {e}"))?;
        debug!("fetched");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Push / Pull
    // -----------------------------------------------------------------------

    /// Push to a remote.
    #[instrument(skip(self))]
    pub fn push(&self, remote: &str, branch: &str) -> Result<(), String> {
        let mut remote = self
            .inner
            .find_remote(remote)
            .map_err(|e| format!("remote '{remote}' not found: {e}"))?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let mut opts = git2::PushOptions::new();
        remote
            .push(&[&refspec], Some(&mut opts))
            .map_err(|e| format!("push failed: {e}"))?;
        debug!(branch, "pushed");
        Ok(())
    }

    /// Pull from a remote (fetch + merge using merge analysis).
    #[instrument(skip(self))]
    pub fn pull(&self, remote: &str, branch: &str) -> Result<(), String> {
        // Fetch the remote branch
        let mut remote_obj = self
            .inner
            .find_remote(remote)
            .map_err(|e| format!("remote '{remote}' not found: {e}"))?;
        let _refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let mut fetch_opts = git2::FetchOptions::new();
        remote_obj
            .fetch(&[&branch], Some(&mut fetch_opts), None)
            .map_err(|e| format!("fetch failed: {e}"))?;

        // Get FETCH_HEAD commit
        let fetch_head = self
            .inner
            .find_reference("FETCH_HEAD")
            .map_err(|e| format!("FETCH_HEAD not found: {e}"))?;
        let fetch_commit = self
            .inner
            .reference_to_annotated_commit(&fetch_head)
            .map_err(|e| format!("annotate fetch: {e}"))?;

        // Use merge analysis to find the right strategy
        let (analysis, _preference) = self
            .inner
            .merge_analysis(&[&fetch_commit])
            .map_err(|e| format!("merge analysis: {e}"))?;

        if analysis.is_up_to_date() {
            debug!("already up to date");
            return Ok(());
        }

        if analysis.is_fast_forward() {
            // Fast-forward: just move the ref
            let fetch_ref = self
                .inner
                .find_reference("FETCH_HEAD")
                .map_err(|e| format!("FETCH_HEAD: {e}"))?;
            let target = fetch_ref
                .peel_to_commit()
                .map_err(|e| format!("peel FETCH_HEAD: {e}"))?;
            // Update current branch to point to the fetched commit
            let head_ref = self
                .inner
                .head()
                .map_err(|e| format!("HEAD: {e}"))?;
            let head_name = head_ref
                .name()
                .ok_or_else(|| "HEAD has no name".to_owned())?;
            self.inner
                .reference(head_name, target.id(), true, "pull: fast-forward")
                .map_err(|e| format!("fast-forward ref update: {e}"))?;
            // Checkout the new tree
            let tree = target.tree().map_err(|e| format!("tree: {e}"))?;
            self.inner
                .checkout_tree(tree.as_object(), None)
                .map_err(|e| format!("checkout: {e}"))?;
            self.inner
                .set_head(head_name)
                .map_err(|e| format!("set_head: {e}"))?;
            debug!(branch, "fast-forward merged");
            return Ok(());
        }

        if analysis.is_normal() {
            // Normal merge
            self.inner
                .merge(&[&fetch_commit], None, None)
                .map_err(|e| format!("merge failed: {e}"))?;

            // Check for conflicts
            let mut index = self.inner.index().map_err(|e| format!("index: {e}"))?;
            if index.has_conflicts() {
                debug!("merge has conflicts — requires manual resolution");
                return Err("Merge conflicts detected. Please resolve them manually.".to_owned());
            }

            // Write merge result
            let tree_oid = index
                .write_tree_to(&self.inner)
                .map_err(|e| format!("write tree: {e}"))?;
            let tree = self
                .inner
                .find_tree(tree_oid)
                .map_err(|e| format!("find tree: {e}"))?;

            let sig = self
                .inner
                .signature()
                .map_err(|e| format!("signature: {e}"))?;
            let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
            let parent = head
                .peel_to_commit()
                .map_err(|e| format!("parent: {e}"))?;
            let fetch_commit_obj = self.inner
                .find_commit(fetch_commit.id())
                .map_err(|e| format!("peel fetch commit: {e}"))?;

            self.inner
                .commit(
                    Some("HEAD"),
                    &sig,
                    &sig,
                    &format!("Merge branch '{branch}' of {remote}"),
                    &tree,
                    &[&parent, &fetch_commit_obj],
                )
                .map_err(|e| format!("merge commit: {e}"))?;

            // Clean up merge state
            self.inner.cleanup_state().ok();
            debug!(branch, "merged");
            return Ok(());
        }

        debug!("no merge needed");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------

    /// Reset HEAD to a commit (soft/mixed/hard).
    #[instrument(skip(self))]
    pub fn reset(&self, oid_str: &str, mode: &str) -> Result<(), String> {
        let oid = git2::Oid::from_str(oid_str)
            .map_err(|e| format!("invalid oid: {e}"))?;
        let obj = self
            .inner
            .find_object(oid, None)
            .map_err(|e| format!("find object: {e}"))?;

        let kind = match mode {
            "soft" => git2::ResetType::Soft,
            "mixed" => git2::ResetType::Mixed,
            "hard" => git2::ResetType::Hard,
            _ => return Err(format!("unknown reset mode: {mode}")),
        };

        self.inner
            .reset(&obj, kind, None)
            .map_err(|e| format!("reset: {e}"))?;
        debug!(%oid, mode, "reset");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Revert
    // -----------------------------------------------------------------------

    /// Revert a commit by oid.
    #[instrument(skip(self))]
    pub fn revert(&self, oid_str: &str) -> Result<String, String> {
        let oid = git2::Oid::from_str(oid_str)
            .map_err(|e| format!("invalid oid: {e}"))?;
        let commit = self
            .inner
            .find_commit(oid)
            .map_err(|e| format!("find commit: {e}"))?;

        let mut index = self.inner.index().map_err(|e| format!("index: {e}"))?;
        let mut revert_opts = git2::RevertOptions::new();
        revert_opts.mainline(0);

        self.inner
            .revert(&commit, Some(&mut revert_opts))
            .map_err(|e| format!("revert: {e}"))?;

        let tree_oid = index
            .write_tree_to(&self.inner)
            .map_err(|e| format!("write tree: {e}"))?;
        let tree = self
            .inner
            .find_tree(tree_oid)
            .map_err(|e| format!("find tree: {e}"))?;

        let sig = self
            .inner
            .signature()
            .map_err(|e| format!("signature: {e}"))?;
        let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
        let parent = head
            .peel_to_commit()
            .map_err(|e| format!("parent: {e}"))?;

        let msg = format!(
            "Revert \"{}\"\n\nThis reverts commit {}.",
            commit.message().unwrap_or(""),
            oid_str
        );

        let new_oid = self
            .inner
            .commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])
            .map_err(|e| format!("revert commit: {e}"))?;

        debug!(%new_oid, "reverted");
        Ok(new_oid.to_string())
    }

    // -----------------------------------------------------------------------
    // Cherry-pick
    // -----------------------------------------------------------------------

    /// Cherry-pick a commit by oid.
    #[instrument(skip(self))]
    pub fn cherry_pick(&self, oid_str: &str) -> Result<String, String> {
        let oid = git2::Oid::from_str(oid_str)
            .map_err(|e| format!("invalid oid: {e}"))?;
        let commit = self
            .inner
            .find_commit(oid)
            .map_err(|e| format!("find commit: {e}"))?;

        let mut cherrypick_opts = git2::CherrypickOptions::new();
        cherrypick_opts.mainline(0);

        self.inner
            .cherrypick(&commit, Some(&mut cherrypick_opts))
            .map_err(|e| format!("cherry-pick: {e}"))?;

        let mut index = self.inner.index().map_err(|e| format!("index: {e}"))?;
        if index.has_conflicts() {
            return Err("Cherry-pick conflicts detected. Please resolve them manually.".to_owned());
        }

        let tree_oid = index
            .write_tree_to(&self.inner)
            .map_err(|e| format!("write tree: {e}"))?;
        let tree = self
            .inner
            .find_tree(tree_oid)
            .map_err(|e| format!("find tree: {e}"))?;

        let sig = self
            .inner
            .signature()
            .map_err(|e| format!("signature: {e}"))?;
        let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
        let parent = head
            .peel_to_commit()
            .map_err(|e| format!("parent: {e}"))?;

        let msg = commit.message().unwrap_or("").to_owned();

        let new_oid = self
            .inner
            .commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent])
            .map_err(|e| format!("cherry-pick commit: {e}"))?;

        self.inner.cleanup_state().ok();
        debug!(%new_oid, "cherry-picked");
        Ok(new_oid.to_string())
    }

    // -----------------------------------------------------------------------
    // Merge
    // -----------------------------------------------------------------------

    /// Merge a branch into current branch.
    #[instrument(skip(self))]
    pub fn merge_branch(&self, branch_name: &str) -> Result<String, String> {
        let branch_ref = format!("refs/heads/{branch_name}");
        let _branch_obj = self
            .inner
            .revparse_single(&branch_ref)
            .map_err(|e| format!("branch '{branch_name}' not found: {e}"))?;
        let annotated = self
            .inner
            .reference_to_annotated_commit(
                &self.inner.find_reference(&branch_ref)
                    .map_err(|e| format!("find ref: {e}"))?,
            )
            .map_err(|e| format!("annotated commit: {e}"))?;

        // Analyze
        let (analysis, _pref) = self
            .inner
            .merge_analysis(&[&annotated])
            .map_err(|e| format!("merge analysis: {e}"))?;

        if analysis.is_up_to_date() {
            return Ok("Already up to date.".to_owned());
        }

        if analysis.is_fast_forward() {
            // Fast-forward
            let target = self.inner.find_commit(annotated.id()).map_err(|e| format!("peel: {e}"))?;
            let head_ref = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
            let head_name = head_ref.name().ok_or("no HEAD name")?;
            self.inner
                .reference(head_name, target.id(), true, "merge: fast-forward")
                .map_err(|e| format!("ff: {e}"))?;
            let tree = target.tree().map_err(|e| format!("tree: {e}"))?;
            self.inner
                .checkout_tree(tree.as_object(), None)
                .map_err(|e| format!("checkout: {e}"))?;
            self.inner.set_head(head_name).map_err(|e| format!("set_head: {e}"))?;
            return Ok("Fast-forward merge.".to_owned());
        }

        if analysis.is_normal() {
            self.inner
                .merge(&[&annotated], None, None)
                .map_err(|e| format!("merge: {e}"))?;

            let mut index = self.inner.index().map_err(|e| format!("index: {e}"))?;
            if index.has_conflicts() {
                return Err("Merge conflicts detected. Please resolve them manually.".to_owned());
            }

            let tree_oid = index
                .write_tree_to(&self.inner)
                .map_err(|e| format!("write tree: {e}"))?;
            let tree = self.inner.find_tree(tree_oid).map_err(|e| format!("find tree: {e}"))?;

            let sig = self.inner.signature().map_err(|e| format!("sig: {e}"))?;
            let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
            let parent1 = head.peel_to_commit().map_err(|e| format!("parent: {e}"))?;
            let parent2 = self.inner.find_commit(annotated.id()).map_err(|e| format!("parent2: {e}"))?;

            let msg = format!("Merge branch '{}'", branch_name);
            let oid = self
                .inner
                .commit(Some("HEAD"), &sig, &sig, &msg, &tree, &[&parent1, &parent2])
                .map_err(|e| format!("merge commit: {e}"))?;

            self.inner.cleanup_state().ok();
            return Ok(format!("Merged: {}", oid));
        }

        Ok("Nothing to merge.".to_owned())
    }

    // -----------------------------------------------------------------------
    // Rebase
    // -----------------------------------------------------------------------

    /// Rebase current branch onto another branch.
    #[instrument(skip(self))]
    pub fn rebase(&self, onto_branch: &str) -> Result<(), String> {
        let onto_ref = format!("refs/heads/{onto_branch}");
        let _onto_obj = self
            .inner
            .revparse_single(&onto_ref)
            .map_err(|e| format!("branch '{onto_branch}' not found: {e}"))?;
        let onto_annotated = self
            .inner
            .reference_to_annotated_commit(
                &self.inner
                    .find_reference(&onto_ref)
                    .map_err(|e| format!("find ref: {e}"))?,
            )
            .map_err(|e| format!("annotated: {e}"))?;

        let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
        let head_annotated = self
            .inner
            .reference_to_annotated_commit(&head)
            .map_err(|e| format!("head annotated: {e}"))?;

        let _upstream = self
            .inner
            .merge_base(
                onto_annotated.id(),
                head_annotated.id(),
            )
            .map_err(|e| format!("merge base: {e}"))?;

        let mut rebase = self
            .inner
            .rebase(
                Some(&head_annotated),
                Some(&onto_annotated),
                None,
                None,
            )
            .map_err(|e| format!("rebase init: {e}"))?;

        let sig = self.inner.signature().map_err(|e| format!("sig: {e}"))?;

        while let Some(op) = rebase.next() {
            let _op = op.map_err(|e| format!("rebase op: {e}"))?;
            // Check for conflicts by examining the index
            let index = self
                .inner
                .index()
                .map_err(|e| format!("index: {e}"))?;
            if index.has_conflicts() {
                rebase.abort().map_err(|e| format!("abort: {e}"))?;
                return Err("Rebase conflicts. Rebase aborted.".to_owned());
            }

            rebase
                .commit(Some(&sig), &sig, None)
                .map_err(|e| format!("rebase commit: {e}"))?;
        }

        rebase.finish(None).map_err(|e| format!("rebase finish: {e}"))?;
        debug!("rebase complete");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Tags
    // -----------------------------------------------------------------------

    /// List all tags.
    #[instrument(skip(self))]
    pub fn tag_list(&self) -> Result<Vec<TagInfo>, String> {
        let tags = self
            .inner
            .tag_names(None)
            .map_err(|e| format!("tag names: {e}"))?;

        let mut result = Vec::new();
        for name in tags.iter().flatten() {
            let obj = self
                .inner
                .revparse_single(&format!("refs/tags/{name}"))
                .ok();
            result.push(TagInfo {
                name: name.to_owned(),
                oid: obj.map(|o| o.id().to_string()).unwrap_or_default(),
            });
        }
        Ok(result)
    }

    /// Create a lightweight or annotated tag.
    #[instrument(skip(self))]
    pub fn tag_create(&self, name: &str, message: Option<&str>) -> Result<String, String> {
        let head = self.inner.head().map_err(|e| format!("HEAD: {e}"))?;
        let head_obj = head.peel(git2::ObjectType::Commit).map_err(|e| format!("peel: {e}"))?;

        let oid = if let Some(msg) = message {
            let sig = self.inner.signature().map_err(|e| format!("sig: {e}"))?;
            self.inner
                .tag(name, &head_obj, &sig, msg, false)
                .map_err(|e| format!("tag create: {e}"))?
        } else {
            self.inner
                .tag_lightweight(name, &head_obj, false)
                .map_err(|e| format!("tag lightweight: {e}"))?
        };

        debug!(name, "tag created");
        Ok(oid.to_string())
    }

    /// Delete a tag.
    #[instrument(skip(self))]
    pub fn tag_delete(&self, name: &str) -> Result<(), String> {
        self.inner
            .tag_delete(name)
            .map_err(|e| format!("tag delete: {e}"))?;
        debug!(name, "tag deleted");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Remote management
    // -----------------------------------------------------------------------

    /// List all remotes.
    #[instrument(skip(self))]
    pub fn remote_list(&self) -> Result<Vec<RemoteInfo>, String> {
        let remotes = self
            .inner
            .remotes()
            .map_err(|e| format!("remotes: {e}"))?;
        let mut result = Vec::new();
        for name in remotes.iter().flatten() {
            let url = self
                .inner
                .find_remote(name)
                .ok()
                .and_then(|r| r.url().map(String::from))
                .unwrap_or_default();
            result.push(RemoteInfo {
                name: name.to_owned(),
                url,
            });
        }
        Ok(result)
    }

    /// Add a new remote.
    #[instrument(skip(self))]
    pub fn remote_add(&self, name: &str, url: &str) -> Result<(), String> {
        self.inner
            .remote(name, url)
            .map_err(|e| format!("remote add: {e}"))?;
        debug!(name, url, "remote added");
        Ok(())
    }

    /// Remove a remote.
    #[instrument(skip(self))]
    pub fn remote_remove(&self, name: &str) -> Result<(), String> {
        self.inner
            .remote_delete(name)
            .map_err(|e| format!("remote remove: {e}"))?;
        debug!(name, "remote removed");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Branch management
    // -----------------------------------------------------------------------

    /// Create a new branch from HEAD.
    #[instrument(skip(self))]
    pub fn create_branch(&self, name: &str) -> Result<(), String> {
        let head = self
            .inner
            .head()
            .map_err(|e| format!("failed to get HEAD: {e}"))?;
        let head_commit = head
            .peel_to_commit()
            .map_err(|e| format!("peel HEAD: {e}"))?;
        self.inner
            .branch(name, &head_commit, false)
            .map_err(|e| format!("create branch: {e}"))?;
        debug!(name, "branch created");
        Ok(())
    }

    /// Switch to a different branch.
    #[instrument(skip(self))]
    pub fn switch_branch(&self, name: &str) -> Result<(), String> {
        let branch_ref = format!("refs/heads/{name}");
        let obj = self
            .inner
            .revparse_single(&branch_ref)
            .map_err(|e| format!("branch '{name}' not found: {e}"))?;
        self.inner
            .checkout_tree(&obj, None)
            .map_err(|e| format!("checkout: {e}"))?;
        self.inner
            .set_head(&branch_ref)
            .map_err(|e| format!("set HEAD: {e}"))?;
        debug!(name, "switched branch");
        Ok(())
    }

    /// Delete a branch.
    #[instrument(skip(self))]
    pub fn delete_branch(&self, name: &str) -> Result<(), String> {
        let mut branch = self
            .inner
            .find_branch(name, git2::BranchType::Local)
            .map_err(|e| format!("branch '{name}' not found: {e}"))?;
        branch
            .delete()
            .map_err(|e| format!("delete branch: {e}"))?;
        debug!(name, "branch deleted");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Blame
    // -----------------------------------------------------------------------

    /// Blame a file (git blame).
    #[instrument(skip(self))]
    pub fn blame(&self, path: &str) -> Result<Vec<BlameHunk>, String> {
        let blame = self
            .inner
            .blame_file(Path::new(path), None)
            .map_err(|e| format!("blame: {e}"))?;

        let mut result = Vec::new();
        for hunk in blame.iter() {
            let commit = self
                .inner
                .find_commit(hunk.final_commit_id())
                .ok();
            let author = commit.as_ref().map(|c| c.author());
            result.push(BlameHunk {
                line: hunk.final_start_line() as u32 + 1, // 1-based
                commit_oid: hunk.final_commit_id().to_string(),
                commit_short: hunk.final_commit_id().to_string()[..7].to_string(),
                author: author
                    .as_ref()
                    .and_then(|a| a.name())
                    .unwrap_or("unknown")
                    .to_owned(),
                time: commit.as_ref().map(|c| c.time().seconds()).unwrap_or(0),
                summary: commit
                    .as_ref()
                    .and_then(|c| c.message())
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_owned(),
            });
        }
        debug!(count = result.len(), path, "blame collected");
        Ok(result)
    }

    // -----------------------------------------------------------------------
    // Init / Clone
    // -----------------------------------------------------------------------

    /// Initialize a new git repository at the given path.
    #[instrument(skip(path))]
    pub fn init(path: impl AsRef<Path>) -> Result<Self, String> {
        let repo = git2::Repository::init(path.as_ref())
            .map_err(|e| format!("init: {e}"))?;
        debug!("repo initialized");
        Ok(Self { inner: repo })
    }

    /// Clone a remote repository.
    #[instrument(skip(path))]
    pub fn clone(url: &str, path: impl AsRef<Path>) -> Result<Self, String> {
        let mut builder = git2::build::RepoBuilder::new();
        let repo = builder
            .clone(url, path.as_ref())
            .map_err(|e| format!("clone: {e}"))?;
        debug!(url, "cloned");
        Ok(Self { inner: repo })
    }

    // -----------------------------------------------------------------------
    // Config
    // -----------------------------------------------------------------------

    /// Get a git config value.
    #[instrument(skip(self))]
    pub fn config_get(&self, key: &str) -> Result<String, String> {
        let config = self
            .inner
            .config()
            .map_err(|e| format!("config: {e}"))?;
        config
            .get_string(key)
            .map_err(|e| format!("config get {key}: {e}"))
    }

    /// Set a git config value.
    #[instrument(skip(self))]
    pub fn config_set(&self, key: &str, value: &str) -> Result<(), String> {
        let mut config = self
            .inner
            .config()
            .map_err(|e| format!("config: {e}"))?;
        config
            .set_str(key, value)
            .map_err(|e| format!("config set {key}: {e}"))?;
        debug!(key, value, "config set");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Conflicts
    // -----------------------------------------------------------------------

    /// Check if the index has merge conflicts.
    pub fn has_conflicts(&self) -> Result<bool, String> {
        let index = self.inner.index().map_err(|e| format!("index: {e}"))?;
        Ok(index.has_conflicts())
    }

    /// List conflicted files.
    pub fn conflict_files(&self) -> Result<Vec<String>, String> {
        let index = self.inner.index().map_err(|e| format!("index: {e}"))?;
        let mut files = Vec::new();
        if index.has_conflicts() {
            if let Ok(conflicts) = index.conflicts() {
                for conflict in conflicts.flatten() {
                    if let Some(entry) = conflict.our.or(conflict.their).or(conflict.ancestor) {
                        files.push(String::from_utf8_lossy(&entry.path).to_string());
                    }
                }
            }
        }
        Ok(files)
    }

    /// Mark a conflicted file as resolved (stage it).
    pub fn resolve_conflict(&self, path: &str) -> Result<(), String> {
        self.stage(path)
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
