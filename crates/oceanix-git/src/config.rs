//! Git config operations.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;

impl GitRepo {
    /// Get a git config value.
    #[instrument(skip(self))]
    pub fn config_get(&self, key: &str) -> GitResult<String> {
        let config = self.inner.config()?;
        Ok(config.get_string(key)?)
    }

    /// Set a git config value.
    #[instrument(skip(self))]
    pub fn config_set(&self, key: &str, value: &str) -> GitResult<()> {
        let mut config = self.inner.config()?;
        config.set_str(key, value)?;
        debug!(key, value, "config set");
        Ok(())
    }
}
