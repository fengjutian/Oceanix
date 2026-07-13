//! Blame operations.

use std::path::Path;
use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::BlameHunk;

impl GitRepo {
    /// Blame a file (git blame).
    #[instrument(skip(self))]
    pub fn blame(&self, path: &str) -> GitResult<Vec<BlameHunk>> {
        let blame = self.inner.blame_file(Path::new(path), None)?;

        let mut result = Vec::new();
        for hunk in blame.iter() {
            let commit = self.inner.find_commit(hunk.final_commit_id()).ok();
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
}
