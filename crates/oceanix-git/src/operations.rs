//! Operation system — models every Git operation with run-time flags,
//! inspired by VSCode's `operation.ts`.

/// Kinds of Git operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationKind {
    // Read-only local
    Status,
    Diff,
    DiffStaged,
    Show,
    BranchName,
    Branches,
    Log,
    LogFile,
    CommitDetail,
    StashList,
    TagList,
    RemoteList,
    Blame,
    ConfigGet,
    HasConflicts,
    ConflictFiles,
    MergeAnalysis,

    // Read-only remote
    Fetch,
    Pull,

    // Mutating local
    Commit,
    Stage,
    Unstage,
    Discard,
    StashSave,
    StashPop,
    StashApply,
    StashDrop,
    CreateBranch,
    SwitchBranch,
    DeleteBranch,
    TagCreate,
    TagDelete,
    ConfigSet,
    ResolveConflict,
    Reset,
    Revert,
    CherryPick,
    Merge,
    Rebase,

    // Mutating remote
    Push,
    RemoteAdd,
    RemoteRemove,

    // Repository lifecycle
    Init,
    Clone,
}

impl OperationKind {
    /// Whether this operation blocks other operations on the same repo.
    pub fn is_blocking(self) -> bool {
        matches!(
            self,
            Self::Commit
                | Self::Merge
                | Self::Rebase
                | Self::CherryPick
                | Self::Revert
                | Self::Reset
                | Self::Pull
                | Self::Push
                | Self::Fetch
                | Self::StashSave
                | Self::StashPop
                | Self::StashApply
                | Self::SwitchBranch
                | Self::DeleteBranch
                | Self::Clone
        )
    }

    /// Whether this operation only reads data.
    pub fn is_read_only(self) -> bool {
        !self.is_blocking()
            && !matches!(
                self,
                Self::Stage
                    | Self::Unstage
                    | Self::Discard
                    | Self::CreateBranch
                    | Self::TagCreate
                    | Self::TagDelete
                    | Self::ConfigSet
                    | Self::ResolveConflict
                    | Self::RemoteAdd
                    | Self::RemoteRemove
                    | Self::Init
            )
    }

    /// Whether this operation contacts a remote.
    pub fn is_remote(self) -> bool {
        matches!(self, Self::Fetch | Self::Pull | Self::Push | Self::Clone)
    }
}
