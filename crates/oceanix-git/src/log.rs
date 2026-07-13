//! Commit history / log operations.

use std::path::Path;
use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::CommitInfo;

impl GitRepo {
    /// Return the last `count` commits from HEAD.
    #[instrument(skip(self))]
    pub fn log(&self, count: usize) -> GitResult<Vec<CommitInfo>> {
        let mut revwalk = self.inner.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(git2::Sort::TIME)?;

        let mut result = Vec::with_capacity(count);
        for (i, oid) in revwalk.enumerate() {
            if i >= count {
                break;
            }
            let oid = oid?;
            let commit = self.inner.find_commit(oid)?;
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
    pub fn log_file(&self, path: &str, count: usize) -> GitResult<Vec<CommitInfo>> {
        let mut revwalk = self.inner.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(git2::Sort::TIME)?;

        let mut result = Vec::new();
        for oid_result in revwalk {
            if result.len() >= count {
                break;
            }
            let oid = oid_result?;
            let commit = self.inner.find_commit(oid)?;

            if commit.parent_count() == 0 {
                let tree = commit.tree()?;
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
                let tree = commit.tree()?;
                for parent_idx in 0..commit.parent_count() {
                    let parent = commit.parent(parent_idx)?;
                    let parent_tree = parent.tree()?;
                    let diff = self.inner.diff_tree_to_tree(
                        Some(&parent_tree),
                        Some(&tree),
                        Some(&mut {
                            let mut opts = git2::DiffOptions::new();
                            opts.pathspec(path);
                            opts
                        }),
                    )?;
                    if diff.deltas().len() > 0 {
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
        debug!(count = result.len(), path, "log_file collected");
        Ok(result)
    }

    /// Full details for a single commit, including its diff.
    #[instrument(skip(self))]
    pub fn commit_detail(&self, oid: &str) -> GitResult<CommitInfo> {
        let oid = git2::Oid::from_str(oid)?;
        let commit = self.inner.find_commit(oid)?;
        let author = commit.author();
        Ok(CommitInfo {
            oid: oid.to_string(),
            short_oid: oid.to_string()[..7].to_string(),
            message: commit.message().unwrap_or("").to_owned(),
            author: author.name().unwrap_or("unknown").to_owned(),
            email: author.email().unwrap_or("").to_owned(),
            time: commit.time().seconds(),
            time_offset: commit.time().offset_minutes() * 60,
        })
    }
}
