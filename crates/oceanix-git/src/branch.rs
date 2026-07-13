//! Branch operations.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::BranchInfo;

impl GitRepo {
    /// Short name of the current branch (e.g. `"main"`).
    /// Returns "(detached)" when HEAD is not a branch.
    #[instrument(skip(self))]
    pub fn branch_name(&self) -> GitResult<String> {
        match self.inner.head() {
            Ok(head) => {
                if let Some(name) = head.shorthand() {
                    Ok(name.to_owned())
                } else {
                    Ok("(detached)".to_owned())
                }
            }
            Err(e) => {
                debug!("HEAD not found: {e}");
                Ok("(no commits)".to_owned())
            }
        }
    }

    /// All local branches.
    #[instrument(skip(self))]
    pub fn branches(&self) -> GitResult<Vec<BranchInfo>> {
        let head_name = self.branch_name().ok();

        let branches = self.inner.branches(Some(git2::BranchType::Local))?;

        let mut result = Vec::new();
        for branch in branches {
            let (branch, _) = branch?;
            let name = branch
                .name()?
                .ok_or_else(|| "invalid UTF-8 branch name".to_owned())?
                .to_owned();

            let is_head = head_name.as_ref() == Some(&name);
            result.push(BranchInfo { name, is_head });
        }

        debug!(count = result.len(), "branches listed");
        Ok(result)
    }

    /// Create a new branch from HEAD.
    #[instrument(skip(self))]
    pub fn create_branch(&self, name: &str) -> GitResult<()> {
        let head = self.inner.head()?;
        let head_commit = head.peel_to_commit()?;
        self.inner.branch(name, &head_commit, false)?;
        debug!(name, "branch created");
        Ok(())
    }

    /// Switch to a different branch.
    #[instrument(skip(self))]
    pub fn switch_branch(&self, name: &str) -> GitResult<()> {
        let branch_ref = format!("refs/heads/{name}");
        let obj = self.inner.revparse_single(&branch_ref)?;
        self.inner.checkout_tree(&obj, None)?;
        self.inner.set_head(&branch_ref)?;
        debug!(name, "switched branch");
        Ok(())
    }

    /// Delete a branch.
    #[instrument(skip(self))]
    pub fn delete_branch(&self, name: &str) -> GitResult<()> {
        let mut branch = self.inner.find_branch(name, git2::BranchType::Local)?;
        branch.delete()?;
        debug!(name, "branch deleted");
        Ok(())
    }
}
