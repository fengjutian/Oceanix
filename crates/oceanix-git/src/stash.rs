//! Stash operations.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::StashInfo;

impl GitRepo {
    /// Save current changes to a stash.
    #[instrument(skip(self))]
    pub fn stash_save(&mut self, message: Option<&str>) -> GitResult<String> {
        let sig = self.inner.signature()?;
        let message = message.unwrap_or("Untitled stash");
        let oid = self.inner.stash_save2(&sig, Some(message), Some(git2::StashFlags::DEFAULT))?;
        debug!(%oid, "stash saved");
        Ok(oid.to_string())
    }

    /// List all stashes.
    #[instrument(skip(self))]
    pub fn stash_list(&mut self) -> GitResult<Vec<StashInfo>> {
        let mut result = Vec::new();
        self.inner.stash_foreach(|index, message, oid| {
            result.push(StashInfo {
                index,
                message: message.to_owned(),
                oid: oid.to_string(),
            });
            true
        })?;
        debug!(count = result.len(), "stashes listed");
        Ok(result)
    }

    /// Pop (apply + drop) the stash at `index`.
    #[instrument(skip(self))]
    pub fn stash_pop(&mut self, index: usize) -> GitResult<()> {
        self.inner.stash_pop(index, None)?;
        debug!(index, "stash popped");
        Ok(())
    }

    /// Apply the stash at `index`.
    #[instrument(skip(self))]
    pub fn stash_apply(&mut self, index: usize) -> GitResult<()> {
        self.inner.stash_apply(index, None)?;
        debug!(index, "stash applied");
        Ok(())
    }

    /// Drop the stash at `index`.
    #[instrument(skip(self))]
    pub fn stash_drop(&mut self, index: usize) -> GitResult<()> {
        self.inner.stash_drop(index)?;
        debug!(index, "stash dropped");
        Ok(())
    }
}
