//! Auto Sync native layer.
//!
//! See `plans/pending-auto_sync-med-hard.md`. The hidden repository is the
//! foundation everything else stands on: version history, the merge base, and
//! the repository git sync pushes from are all the same repo, and it lives in
//! OS app-data rather than the vault so that no sync daemon ever sees it.

pub mod hidden_repo;
pub mod snapshot;
