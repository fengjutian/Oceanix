//! Commit, stage, unstage, and discard operations.

use std::path::Path;
use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;

impl GitRepo {
    /// Commit staged changes with `message`. Returns the hex oid of the new commit.
    #[instrument(skip(self))]
    pub fn commit(&self, message: &str) -> GitResult<String> {
        let repo = &self.inner;

        let sig = repo.signature()?;
        let head = repo.head()?;
        let parent = head.peel_to_commit()?;

        let mut index = repo.index()?;
        let tree_oid = index.write_tree()?;
        let tree = repo.find_tree(tree_oid)?;

        let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])?;

        debug!(%oid, "commit created");
        Ok(oid.to_string())
    }

    /// Stage a file (git add).
    #[instrument(skip(self))]
    pub fn stage(&self, path: &str) -> GitResult<()> {
        let mut index = self.inner.index()?;
        index.add_path(Path::new(path))?;
        index.write()?;
        debug!(path, "staged");
        Ok(())
    }

    /// Unstage a file (git reset HEAD -- <path>).
    #[instrument(skip(self))]
    pub fn unstage(&self, path: &str) -> GitResult<()> {
        let head = self.inner.head()?;
        let head_commit = head.peel_to_commit()?;
        let tree = head_commit.tree()?;

        let mut index = self.inner.index()?;
        // Remove current index entry and re-add the HEAD version
        index.remove_path(Path::new(path))?;
        let entry = tree.get_path(Path::new(path))?;
        // Construct a minimal IndexEntry to add the HEAD version back
        let path_bytes = path.as_bytes().to_vec();
        index.add(&git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: entry.filemode() as u32,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: entry.id(),
            flags: 0,
            flags_extended: 0,
            path: path_bytes,
        })?;
        index.write()?;
        debug!(path, "unstaged");
        Ok(())
    }

    /// Discard changes to a file (git checkout HEAD -- <path>).
    #[instrument(skip(self))]
    pub fn discard(&self, path: &str) -> GitResult<()> {
        let head = self.inner.head()?;
        let head_commit = head.peel_to_commit()?;
        let tree = head_commit.tree()?;

        let entry = tree.get_path(Path::new(path))?;
        let blob = self.inner.find_blob(entry.id())?;

        let mut checkout_builder = git2::build::CheckoutBuilder::new();
        checkout_builder.path(path);
        self.inner
            .checkout_tree(&blob.into_object(), Some(&mut checkout_builder))?;

        debug!(path, "discarded");
        Ok(())
    }
}
