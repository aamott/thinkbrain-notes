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

use crate::commands::workspace::resolve_workspace_root;
use crate::NativeError;

use super::engine::Engine;
use super::history;

/// What the pill is saying, in order of who needs to act.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum State {
    /// Auto Sync is not keeping history for this workspace.
    Off,
    /// Recording has stopped, and it will not start again on its own.
    Problem,
    /// Two versions of something are waiting on a decision.
    Attention,
    /// Changes are on their way into history.
    Saving,
    /// Everything is recorded.
    Idle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: State,
    /// Milliseconds since the epoch, or `None` if nothing has been recorded.
    pub last_recorded_at: Option<u64>,
    /// Changes seen but not yet written.
    pub waiting: usize,
    /// Conflicts waiting on a decision.
    pub attention: usize,
    /// Why recording stopped, if it has. The window turns the code into a
    /// sentence about what to do next.
    pub problem: Option<NativeError>,
}

/// Everything the footer needs about one workspace.
pub fn of(engine: Option<&Engine>) -> Result<SyncStatus, NativeError> {
    let Some(engine) = engine else {
        return Ok(SyncStatus {
            state: State::Off,
            last_recorded_at: None,
            waiting: 0,
            attention: 0,
            problem: None,
        });
    };

    let problem = engine.problem();
    let attention = engine.conflicts().len();
    let waiting = engine.waiting();

    Ok(SyncStatus {
        state: if problem.is_some() {
            State::Problem
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
        problem,
    })
}

#[tauri::command]
pub fn sync_status(root_path: String) -> Result<SyncStatus, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    of(super::registry::engine(&root.to_string_lossy()).as_deref())
}

#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
