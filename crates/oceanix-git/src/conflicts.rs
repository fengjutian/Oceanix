//! Merge conflict handling.

use crate::error::GitResult;
use crate::repository::GitRepo;

impl GitRepo {
    /// Check if the index has merge conflicts.
    pub fn has_conflicts(&self) -> GitResult<bool> {
        let index = self.inner.index()?;
        Ok(index.has_conflicts())
    }

    /// List conflicted files.
    pub fn conflict_files(&self) -> GitResult<Vec<String>> {
        let index = self.inner.index()?;
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
    pub fn resolve_conflict(&self, path: &str) -> GitResult<()> {
        self.stage(path)
    }
}
