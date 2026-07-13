//! oceanix-git: Git integration crate.
//! Provides Git operations via libgit2 (git2).
//! Zero Tauri dependency.
//!
//! ## Architecture
//!
//! The crate is organized following patterns from VSCode's Git extension:
//!
//! | Module | Purpose |
//! |--------|---------|
//! | `types` | Public data types (FileStatus, BranchInfo, CommitInfo, etc.) |
//! | `error` | Error types (GitError, GitResult) |
//! | `operations` | Operation kind enum with run-time flags |
//! | `repository` | Core GitRepo struct and lifecycle (open, init, clone) |
//! | `status` | Status, diff, show |
//! | `commit` | Commit, stage, unstage, discard |
//! | `branch` | Branch queries and mutations |
//! | `log` | Commit history and commit detail |
//! | `stash` | Stash save, list, pop, apply, drop |
//! | `remote` | Fetch, push, pull, remote management |
//! | `merge` | Merge, rebase, cherry-pick, revert, reset |
//! | `tags` | Tag list, create, delete |
//! | `blame` | Blame |
//! | `config` | Git config get/set |
//! | `conflicts` | Merge conflict detection and resolution |

// Internal modules — each adds methods to GitRepo via `impl GitRepo { ... }`
mod blame;
mod branch;
mod commit;
mod config;
mod conflicts;
pub mod error;
mod log;
mod merge;
pub mod operations;
mod remote;
mod repository;
mod stash;
mod status;
mod tags;
pub mod types;

// Re-export the core struct and public modules
pub use repository::GitRepo;
pub use error::{GitError, GitResult};
pub use operations::OperationKind;
// Types are re-exported through the types module
pub use types::*;

// ---------------------------------------------------------------------------
// Module init (called once at startup)
// ---------------------------------------------------------------------------

pub fn init() {
    tracing::info!("oceanix-git initialized");
}
