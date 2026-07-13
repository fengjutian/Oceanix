//! Tag operations.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::TagInfo;

impl GitRepo {
    /// List all tags.
    #[instrument(skip(self))]
    pub fn tag_list(&self) -> GitResult<Vec<TagInfo>> {
        let tags = self.inner.tag_names(None)?;

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
    pub fn tag_create(&self, name: &str, message: Option<&str>) -> GitResult<String> {
        let head = self.inner.head()?;
        let head_obj = head.peel(git2::ObjectType::Commit)?;

        let oid = if let Some(msg) = message {
            let sig = self.inner.signature()?;
            self.inner.tag(name, &head_obj, &sig, msg, false)?
        } else {
            self.inner.tag_lightweight(name, &head_obj, false)?
        };

        debug!(name, "tag created");
        Ok(oid.to_string())
    }

    /// Delete a tag.
    #[instrument(skip(self))]
    pub fn tag_delete(&self, name: &str) -> GitResult<()> {
        self.inner.tag_delete(name)?;
        debug!(name, "tag deleted");
        Ok(())
    }
}
