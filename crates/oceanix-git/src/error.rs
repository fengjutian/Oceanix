//! Error types for oceanix-git.

use thiserror::Error;

/// Git operation error.
#[derive(Error, Debug)]
pub enum GitError {
    #[error("git error: {0}")]
    Git(#[from] git2::Error),

    #[error("{0}")]
    Message(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl From<&str> for GitError {
    fn from(s: &str) -> Self {
        GitError::Message(s.to_owned())
    }
}

impl From<String> for GitError {
    fn from(s: String) -> Self {
        GitError::Message(s)
    }
}

/// Convenience result type.
pub type GitResult<T> = Result<T, GitError>;

impl From<GitError> for String {
    fn from(e: GitError) -> Self {
        e.to_string()
    }
}
