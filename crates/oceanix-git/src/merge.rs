//! Merge, rebase, cherry-pick, revert, and reset operations.

use tracing::{debug, instrument};

use crate::error::GitResult;
use crate::repository::GitRepo;
use crate::types::MergeAnalysis;

impl GitRepo {
    // -----------------------------------------------------------------------
    // Merge analysis
    // -----------------------------------------------------------------------

    /// Analyze the merge state between HEAD and another branch.
    #[instrument(skip(self))]
    pub fn merge_analysis(&self, branch: &str) -> GitResult<MergeAnalysis> {
        let branch_ref = format!("refs/heads/{branch}");
        let _branch_obj = self.inner.revparse_single(&branch_ref)?;
        let annotated = self.inner.reference_to_annotated_commit(
            &self.inner.find_reference(&branch_ref)?,
        )?;

        let (analysis, _pref) = self.inner.merge_analysis(&[&annotated])?;

        if analysis.is_up_to_date() {
            Ok(MergeAnalysis::UpToDate)
        } else if analysis.is_fast_forward() {
            Ok(MergeAnalysis::FastForward)
        } else {
            Ok(MergeAnalysis::Normal)
        }
    }

    // -----------------------------------------------------------------------
    // Merge
    // -----------------------------------------------------------------------

    /// Merge another branch into the current branch.
    #[instrument(skip(self))]
    pub fn merge_branch(&self, branch: &str) -> GitResult<String> {
        let branch_ref = format!("refs/heads/{branch}");
        let branch_obj = self.inner.revparse_single(&branch_ref)?;
        let annotated = self.inner.reference_to_annotated_commit(
            &self.inner.find_reference(&branch_ref)?,
        )?;

        let (analysis, _pref) = self.inner.merge_analysis(&[&annotated])?;

        if analysis.is_up_to_date() {
            return Ok("Already up to date.".to_owned());
        }

        if analysis.is_fast_forward() {
            let head_ref = self.inner.head()?;
            let mut head_ref_obj = self.inner.find_reference(head_ref.name().unwrap_or(""))?;
            let branch_commit = branch_obj.peel_to_commit()?;
            head_ref_obj.set_target(branch_commit.id(), "merge: Fast-forward")?;

            let obj = self.inner.revparse_single("HEAD")?;
            self.inner.checkout_tree(&obj, None)?;
            return Ok("Fast-forward.".to_owned());
        }

        if analysis.is_normal() {
            let branch_commit = branch_obj.peel_to_commit()?;
            let head = self.inner.head()?;
            let head_commit = head.peel_to_commit()?;

            let mut index = self.inner.index()?;
            let base_oid = self.inner.merge_base(
                head_commit.id(),
                branch_commit.id(),
            )?;
            let base = self.inner.find_commit(base_oid)?;
            let base_tree = base.tree()?;
            let head_tree = head_commit.tree()?;
            let branch_tree = branch_commit.tree()?;

            let mut merge_opts = git2::MergeOptions::new();
            let _ = self.inner.merge_trees(
                &base_tree,
                &head_tree,
                &branch_tree,
                Some(&mut merge_opts),
            );

            if index.has_conflicts() {
                self.inner.cleanup_state()?;
                return Err("Merge conflicts detected. Resolve them and commit.".into());
            }

            let tree_oid = index.write_tree()?;
            let tree = self.inner.find_tree(tree_oid)?;
            let sig = self.inner.signature()?;

            let oid = self.inner.commit(
                Some("HEAD"),
                &sig,
                &sig,
                &format!("Merge branch '{branch}'"),
                &tree,
                &[&head_commit, &branch_commit],
            )?;

            self.inner.cleanup_state()?;
            return Ok(format!("Merged: {}", oid));
        }

        Ok("Nothing to merge.".to_owned())
    }

    // -----------------------------------------------------------------------
    // Rebase
    // -----------------------------------------------------------------------

    /// Rebase current branch onto another branch.
    #[instrument(skip(self))]
    pub fn rebase(&self, onto_branch: &str) -> GitResult<()> {
        let onto_ref = format!("refs/heads/{onto_branch}");
        let _onto_obj = self.inner.revparse_single(&onto_ref)?;
        let onto_annotated = self.inner.reference_to_annotated_commit(
            &self.inner.find_reference(&onto_ref)?,
        )?;

        let head = self.inner.head()?;
        let head_annotated = self.inner.reference_to_annotated_commit(&head)?;

        let _upstream = self.inner.merge_base(
            onto_annotated.id(),
            head_annotated.id(),
        )?;

        let mut rebase = self.inner.rebase(
            Some(&head_annotated),
            Some(&onto_annotated),
            None,
            None,
        )?;

        let sig = self.inner.signature()?;

        while let Some(op) = rebase.next() {
            let _op = op?;
            let index = self.inner.index()?;
            if index.has_conflicts() {
                rebase.abort()?;
                return Err("Rebase conflicts. Rebase aborted.".into());
            }

            rebase.commit(Some(&sig), &sig, None)?;
        }

        rebase.finish(None)?;
        debug!("rebase complete");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Cherry-pick
    // -----------------------------------------------------------------------

    /// Cherry-pick a commit by its OID.
    #[instrument(skip(self))]
    pub fn cherry_pick(&self, oid: &str) -> GitResult<()> {
        let oid = git2::Oid::from_str(oid)?;
        let commit = self.inner.find_commit(oid)?;
        let our_commit = self.inner.head()?.peel_to_commit()?;

        let parent = if commit.parent_count() > 0 {
            commit.parent(0)?
        } else {
            return Err("Cannot cherry-pick root commit".into());
        };

        let mut index = self.inner.index()?;
        let mut merge_opts = git2::MergeOptions::new();
        self.inner.merge_trees(
            &parent.tree()?,
            &our_commit.tree()?,
            &commit.tree()?,
            Some(&mut merge_opts),
        )?;

        if index.has_conflicts() {
            return Err("Cherry-pick conflicts. Resolve and commit manually.".into());
        }

        let tree_oid = index.write_tree()?;
        let tree = self.inner.find_tree(tree_oid)?;
        let sig = self.inner.signature()?;
        self.inner.commit(
            Some("HEAD"),
            &sig,
            &sig,
            commit.message().unwrap_or(""),
            &tree,
            &[&our_commit],
        )?;

        debug!(%oid, "cherry-picked");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Revert
    // -----------------------------------------------------------------------

    /// Revert a commit by its OID.
    #[instrument(skip(self))]
    pub fn revert(&self, oid: &str) -> GitResult<()> {
        let oid = git2::Oid::from_str(oid)?;
        let commit = self.inner.find_commit(oid)?;
        let our_commit = self.inner.head()?.peel_to_commit()?;

        let parent = if commit.parent_count() > 0 {
            commit.parent(0)?
        } else {
            return Err("Cannot revert root commit".into());
        };

        let mut index = self.inner.index()?;
        let mut merge_opts = git2::MergeOptions::new();
        self.inner.merge_trees(
            &commit.tree()?,
            &our_commit.tree()?,
            &parent.tree()?,
            Some(&mut merge_opts),
        )?;

        if index.has_conflicts() {
            return Err("Revert conflicts. Resolve and commit manually.".into());
        }

        let tree_oid = index.write_tree()?;
        let tree = self.inner.find_tree(tree_oid)?;
        let sig = self.inner.signature()?;
        self.inner.commit(
            Some("HEAD"),
            &sig,
            &sig,
            &format!("Revert \"{}\"", commit.message().unwrap_or("")),
            &tree,
            &[&our_commit],
        )?;

        debug!(%oid, "reverted");
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------

    /// Reset HEAD to a commit (soft, mixed, or hard).
    #[instrument(skip(self))]
    pub fn reset(&self, oid: &str, mode: &str) -> GitResult<()> {
        let oid = git2::Oid::from_str(oid)?;
        let obj = self.inner.find_object(oid, None)?;

        let reset_kind = match mode {
            "soft" => git2::ResetType::Soft,
            "hard" => git2::ResetType::Hard,
            _ => git2::ResetType::Mixed,
        };

        self.inner.reset(&obj, reset_kind, None)?;
        debug!(%oid, mode, "reset");
        Ok(())
    }
}
