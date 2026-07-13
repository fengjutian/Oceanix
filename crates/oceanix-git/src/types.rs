//! Public types for the oceanix-git crate.

/// File status in the working tree or index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatusKind {
    Modified,
    Added,
    Deleted,
    Untracked,
    Conflicted,
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

/// Grouped status — separates files into staged, unstaged (changes),
/// merge conflicts, and untracked, matching VSCode's resource groups.
#[derive(Debug, Clone)]
pub struct StatusGroups {
    /// Files in the index (staged for commit).
    pub staged: Vec<FileStatus>,
    /// Modified/deleted worktree files (unstaged, not conflicted).
    pub changes: Vec<FileStatus>,
    /// Merge conflict files.
    pub merge: Vec<FileStatus>,
    /// Untracked files.
    pub untracked: Vec<FileStatus>,
}
