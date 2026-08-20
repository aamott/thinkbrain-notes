//! Auto Sync native layer.
//!
//! See `plans/pending-auto_sync-med-hard.md`. The hidden repository is the
//! foundation everything else stands on: version history, the merge base, and
//! the repository git sync pushes from are all the same repo, and it lives in
//! OS app-data rather than the vault so that no sync daemon ever sees it.

use crate::NativeError;

pub(super) fn failed(
    code: &'static str,
    message: &'static str,
    error: impl std::fmt::Display,
) -> NativeError {
    NativeError::with_details(code, message, error.to_string())
}

pub(super) fn remote_unreachable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.remote_unreachable",
        "Could not reach the place these notes sync to.",
        error,
    )
}

pub mod bootstrap;
pub mod conflict;
pub mod credentials;
pub mod engine;
pub mod hidden_repo;
pub mod history;
pub mod merge;
pub mod pending;
pub mod push;
pub mod registry;
pub mod round;
pub mod resolve;
pub mod settle;
pub mod snapshot;
pub mod status;
