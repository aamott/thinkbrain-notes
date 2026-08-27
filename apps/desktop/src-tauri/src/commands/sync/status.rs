//! What the status pill says, and why.
//!
//! One read answers the whole footer: whether anything is wrong, whether
//! anything is waiting on the user, whether anything is still being written,
//! and when the last change was saved. Assembling it here rather than in the
//! window means every window says the same thing about the same vault.
//!
//! The last-saved time is read from the history rather than remembered in
//! memory, which is what makes it survive the app being closed — a pill that
//! forgot the moment it launched would be the least trustworthy thing on the
//! screen.

use serde::Serialize;

use crate::NativeError;
use crate::commands::workspace::resolve_workspace_root;

use super::engine::{Engine, StuckNote, SyncHealth, SyncPhase};
use super::history;

/// What the pill is saying, in order of who needs to act.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum State {
    /// Auto Sync is deliberately not keeping history for this workspace.
    Off,
    /// Recording has stopped, and it will not start again on its own.
    Problem,
    /// Two versions of something are waiting on a decision, or a note could
    /// not be written and needs a retry.
    Attention,
    /// A round trip to another device is in flight.
    Syncing,
    /// Changes are on their way into history.
    Saving,
    /// Everything is recorded.
    #[default]
    Idle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: State,
    /// Milliseconds since the epoch, or `None` if nothing has been recorded.
    pub last_recorded_at: Option<u64>,
    /// Changes seen but not yet written.
    pub waiting: usize,
    /// Conflicts waiting on a decision.
    pub attention: usize,
    /// Notes that could not be written or recorded, each with a recovery.
    pub stuck: Vec<StuckNote>,
    /// Why recording stopped, if it has. The window turns the code into a
    /// sentence about what to do next.
    pub problem: Option<NativeError>,
    /// The named step of an in-flight round trip.
    pub phase: Option<SyncPhase>,
    /// Whether a git link has completed a round trip from this device.
    pub health: SyncHealth,
    /// When git sync last succeeded, in milliseconds since the epoch.
    pub last_checked_at: Option<u64>,
    /// Whether this folder is also a git repository of the user's own.
    ///
    /// Two histories are being kept here, and someone should learn that from
    /// the app rather than from noticing it.
    pub alongside_own_git: bool,
    /// A failure to tidy private undo history. Recording ignores it.
    pub maintenance_problem: Option<NativeError>,
}

/// What is keeping history for a workspace, or why nothing is.
///
/// Three cases rather than two, because "nothing is recording this" used to
/// cover both a vault we deliberately left alone and one we failed to set up —
/// and the footer said the reassuring one for both.
pub enum Recording<'a> {
    /// This engine is.
    By(&'a Engine),
    /// Nothing is, and nothing tried: the vault keeps its own history.
    NotOurs,
    /// Nothing is, because setting it up failed.
    Failed(NativeError),
}

/// Everything the footer needs about one workspace.
pub fn of(recording: Recording<'_>) -> Result<SyncStatus, NativeError> {
    let engine = match recording {
        Recording::By(engine) => engine,
        Recording::NotOurs => {
            return Ok(SyncStatus {
                state: State::Off,
                ..Default::default()
            });
        }
        Recording::Failed(problem) => {
            return Ok(SyncStatus {
                state: State::Problem,
                health: SyncHealth::Problem,
                problem: Some(problem),
                ..Default::default()
            });
        }
    };

    let problem = engine.problem().or_else(|| engine.sync_problem());
    let stuck = engine.stuck();
    let attention = engine.conflicts().len() + stuck.len();
    let waiting = engine.waiting();
    let last_checked_at = engine.last_checked_at();
    let health = if problem.is_some() {
        SyncHealth::Problem
    } else if last_checked_at.is_some() {
        SyncHealth::Healthy
    } else {
        SyncHealth::Unknown
    };

    Ok(SyncStatus {
        state: if problem.is_some() {
            State::Problem
        } else if engine.syncing() {
            State::Syncing
        } else if attention > 0 {
            State::Attention
        } else if waiting > 0 {
            State::Saving
        } else {
            State::Idle
        },
        last_recorded_at: history::last_recorded(&engine.repository())?,
        waiting,
        attention,
        stuck,
        problem,
        phase: engine.phase(),
        health,
        last_checked_at,
        alongside_own_git: engine.alongside_own_git(),
        maintenance_problem: engine.maintenance_problem(),
    })
}

#[tauri::command]
pub fn sync_status(root_path: String) -> Result<SyncStatus, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy();
    let engine = super::registry::engine(&key);
    of(match (&engine, super::registry::failure(&key)) {
        (Some(engine), _) => Recording::By(engine),
        (None, Some(problem)) => Recording::Failed(problem),
        (None, None) => Recording::NotOurs,
    })
}

#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
