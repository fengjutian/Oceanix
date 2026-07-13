//! Remote operations (fetch, push, pull) and remote management.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::RemoteInfo;

impl GitRepo {
    /// Fetch from a remote.
    #[instrument(skip(self))]
    pub fn fetch(&self, remote: &str) -> GitResult<()> {
        let mut remote = self.inner.find_remote(remote)?;
        let mut cb = git2::RemoteCallbacks::new();
        cb.credentials(|_url, username, _allowed| {
            git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
        });
        let mut fetch_opts = git2::FetchOptions::new();
        fetch_opts.remote_callbacks(cb);
        remote.fetch(&["refs/heads/*:refs/remotes/origin/*"], Some(&mut fetch_opts), None)?;
        debug!("fetch completed");
        Ok(())
    }

    /// Push current branch to remote.
    #[instrument(skip(self))]
    pub fn push(&self, remote: &str, branch: &str) -> GitResult<()> {
        let mut remote = self.inner.find_remote(remote)?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let mut cb = git2::RemoteCallbacks::new();
        cb.credentials(|_url, username, _allowed| {
            git2::Cred::ssh_key_from_agent(username.unwrap_or("git"))
        });
        let mut push_opts = git2::PushOptions::new();
        push_opts.remote_callbacks(cb);
        remote.push(&[&refspec], Some(&mut push_opts))?;
        debug!(branch, "push completed");
        Ok(())
    }

    /// Pull from a remote (fetch + merge).
    #[instrument(skip(self))]
    pub fn pull(&self, remote: &str, branch: &str) -> GitResult<()> {
        self.fetch(remote)?;

        let remote_branch = format!("refs/remotes/{remote}/{branch}");
        let fetch_head = self.inner.find_reference(&remote_branch)?;
        let fetch_commit = fetch_head.peel_to_commit()?;
        let annotated = self.inner.reference_to_annotated_commit(&fetch_head)?;

        let (analysis, _pref) = self.inner.merge_analysis(&[&annotated])?;

        if analysis.is_up_to_date() {
            debug!("pull: already up-to-date");
            return Ok(());
        }

        if analysis.is_fast_forward() {
            let head_ref_name = format!("refs/heads/{branch}");
            let mut head_ref = self.inner.find_reference(&head_ref_name)?;
            head_ref.set_target(fetch_commit.id(), "pull: Fast-forward")?;
            let obj = self.inner.revparse_single("HEAD")?;
            self.inner.checkout_tree(&obj, None)?;
            self.inner.set_head(&head_ref_name)?;
            debug!("pull: fast-forwarded");
            return Ok(());
        }

        if analysis.is_normal() {
            let mut merge_opts = git2::MergeOptions::new();
            self.inner.merge(
                &[&annotated],
                Some(&mut merge_opts),
                None,
            )?;
            self.inner.cleanup_state()?;
            debug!("pull: merged");
            return Ok(());
        }

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Remote management
    // -----------------------------------------------------------------------

    /// List all remotes.
    #[instrument(skip(self))]
    pub fn remote_list(&self) -> GitResult<Vec<RemoteInfo>> {
        let remotes = self.inner.remotes()?;
        let mut result = Vec::new();
        for name in remotes.iter().flatten() {
            let url = self
                .inner
                .find_remote(name)
                .ok()
                .and_then(|r| r.url().map(String::from))
                .unwrap_or_default();
            result.push(RemoteInfo {
                name: name.to_owned(),
                url,
            });
        }
        Ok(result)
    }

    /// Add a new remote.
    #[instrument(skip(self))]
    pub fn remote_add(&self, name: &str, url: &str) -> GitResult<()> {
        self.inner.remote(name, url)?;
        debug!(name, url, "remote added");
        Ok(())
    }

    /// Remove a remote.
    #[instrument(skip(self))]
    pub fn remote_remove(&self, name: &str) -> GitResult<()> {
        self.inner.remote_delete(name)?;
        debug!(name, "remote removed");
        Ok(())
    }
}
