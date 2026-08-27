//! Watches a workspace for edits the app did not make.
//!
//! The index and the calendar are caches of the notes folder, and until now
//! they only heard about changes the app itself performed. A note edited by
//! another editor, arriving over a sync client, or checked out by Git left both
//! caches confidently wrong until the workspace was reopened.
//!
//! This module is the *only* place that talks to the OS about file changes. It
//! deliberately does not index anything: parsing lives in the frontend so there
//! is one implementation of it (OI-005), so the watcher's whole job is to say
//! which workspace-relative paths changed and how. The frontend turns that into
//! the same `note.*` events an in-app edit produces, and every existing cache
//! updates without knowing a watcher exists.
//!
//! ## Recognising our own echo
//!
//! Every app write lands on disk through a Rust command here, and the watcher
//! sees those writes too. Reporting them would be wrong twice over: the caches
//! already updated through the in-app path, so each save would reindex a second
//! time, and the feature is defined as *external* change detection.
//!
//! So each write records an expected echo, and the arriving event claims it.
//! That is deliberately not a quiet period on the path: if the echo never
//! arrives — the write changed no bytes, the OS dropped it — the record expires
//! instead of going on to swallow somebody else's later edit.
//!
//! One case cannot be resolved and is accepted: when another program writes the
//! same note inside the same debounce window as one of our own writes, the two
//! reach us as a single indistinguishable event and the outside edit is missed
//! until that note changes again. Distinguishing them would mean hashing every
//! written file and re-reading it on every event, which costs more than the
//! rare miss it would fix. Nothing goes wrong permanently: the index is a
//! disposable cache and the next change to that note corrects it.

mod classify;
mod lifecycle;
mod self_write;

#[cfg(test)]
pub(crate) use classify::{Audience, classify_all};
pub(crate) use classify::{Changes, collect_changes};
#[allow(unused_imports)]
pub use classify::{classify_event, is_in_watched_area, workspace_relative_path};
#[allow(unused_imports)]
pub use lifecycle::{
    __cmd__unwatch_workspace, __cmd__watch_workspace, __tauri_command_name_unwatch_workspace,
    __tauri_command_name_watch_workspace, WatchInterest, attach_window_destroy_cleanup,
    release_window_watchers, unwatch_workspace, watch_workspace,
};
pub(crate) use self_write::take_self_write;
#[allow(unused_imports)]
pub use self_write::{SELF_WRITE_TTL, SelfWriteLog, record_self_write};

use serde::Serialize;
use tauri::Emitter;

use crate::error::lock_or_recover;

/// The frontend event carrying a settled batch of changes.
pub const WORKSPACE_CHANGED_EVENT: &str = "workspace://changed";

/// Sent when the set of conflicts awaiting a decision has changed.
///
/// Carries no conflicts of its own — only the workspace they belong to. The
/// list is a command away, and a payload would go stale between the moment it
/// was built and the moment a window read it, in a feature whose whole subject
/// is two versions of the truth.
pub const SYNC_CONFLICTS_EVENT: &str = "sync://conflicts";

/// Tells every window that `root_path`'s conflicts are not what they were.
///
/// Both the watcher noticing a new copy and a window resolving one end here, so
/// a second window showing the same vault updates either way.
pub fn announce_conflicts(app: &tauri::AppHandle, root_path: &str) {
    announce(app, SYNC_CONFLICTS_EVENT, root_path);
}

/// Sent when what the status footer would say about a workspace has changed.
///
/// Carries only the workspace, for the same reason the conflict event does:
/// the answer is one command away, and a status built here would be a claim
/// about a moment that has already passed by the time a window reads it.
pub const SYNC_STATUS_EVENT: &str = "sync://status";

/// A handle for the threads that have none of their own.
///
/// The sweeper is one thread serving every workspace, started long before any
/// particular window asks anything of it, so it cannot be handed a window's
/// handle the way the watcher's debouncer is. It is set once, by the first
/// workspace to be watched, and never replaced — every handle reaches every
/// window, so the first one is as good as any.
static REACH: std::sync::Mutex<Option<tauri::AppHandle>> = std::sync::Mutex::new(None);

/// Remembers a handle for the background threads to announce through.
pub fn remember_reach(app: &tauri::AppHandle) {
    let mut reach = lock_or_recover(&REACH);
    reach.get_or_insert_with(|| app.clone());
}

/// Tells every window that `root_path`'s sync status is not what it was.
///
/// Called from the sweeper, which has no window and no command behind it. A
/// process with no windows yet has nothing to tell, which is silence rather
/// than an error.
pub fn announce_sync_status(root_path: &str) {
    let reach = lock_or_recover(&REACH);
    if let Some(app) = reach.as_ref() {
        announce(app, SYNC_STATUS_EVENT, root_path);
    }
}

/// Sent when a git link sign-in just completed a successful round trip.
pub const SYNC_SETUP_EVENT: &str = "sync://setup";

/// Tells the window the git link just worked, so it can say so once.
pub fn announce_setup_ok(app: &tauri::AppHandle, root_path: &str) {
    announce(app, SYNC_SETUP_EVENT, root_path);
}

/// One shape for every "something about this workspace changed" event.
fn announce(app: &tauri::AppHandle, event: &str, root_path: &str) {
    let payload = WorkspaceNamedPayload {
        root_path: root_path.to_string(),
    };
    if let Err(error) = app.emit(event, payload) {
        eprintln!("[sync] failed to deliver {event}: {error}");
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceNamedPayload {
    root_path: String,
}

/// What happened to one path, in the vocabulary the frontend already speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceChangeKind {
    Created,
    Modified,
    Deleted,
    Renamed,
    /// The change cannot be described path by path; rebuild from disk.
    Rescan,
}

/// One reportable change to the workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    pub kind: WorkspaceChangeKind,
    /// Workspace-relative, forward slashes. Empty for a rescan.
    pub path: String,
    /// Where a renamed note came from.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

impl WorkspaceChange {
    pub(crate) fn at(kind: WorkspaceChangeKind, path: String) -> Self {
        Self {
            kind,
            path,
            old_path: None,
        }
    }

    pub(crate) fn rescan() -> Self {
        Self::at(WorkspaceChangeKind::Rescan, String::new())
    }
}

/// The payload delivered to every window; each filters on `root_path`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangedPayload {
    pub root_path: String,
    pub changes: Vec<WorkspaceChange>,
}
