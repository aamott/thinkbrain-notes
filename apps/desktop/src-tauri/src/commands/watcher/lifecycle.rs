//! Starts, shares, and stops per-workspace watchers.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};
use tauri::{Emitter, Manager};

use crate::commands::workspace::resolve_workspace_root;
use crate::commands::workspace_session;
use crate::error::NativeError;

use super::{
    Changes, WORKSPACE_CHANGED_EVENT, WorkspaceChangedPayload, announce_conflicts, collect_changes,
};

/// How long to let a burst settle before reporting it.
///
/// Sync clients and Git checkouts rewrite many files at once; reporting each
/// one separately would reindex the vault a file at a time.
const DEBOUNCE_WINDOW: Duration = Duration::from_millis(400);

pub type WorkspaceDebouncer = Debouncer<RecommendedWatcher, RecommendedCache>;

/// Tracks who wants which workspace watched.
///
/// Counted rather than merely recorded, because a window can hold more than one
/// outstanding request at a time: React tears an effect down and sets it up
/// again, and the teardown of the first can land after the setup of the second.
/// A set of window labels would treat that second request as a duplicate and
/// then let the late release stop a watcher somebody still wanted.
#[derive(Default)]
pub struct WatchInterest {
    /// Workspace root -> window label -> outstanding requests from that window.
    holders: HashMap<String, HashMap<String, u32>>,
}

impl WatchInterest {
    /// Whether anybody is already watching `root`.
    pub fn is_watched(&self, root: &str) -> bool {
        self.holders.contains_key(root)
    }

    /// Registers one request from `label` to watch `root`.
    pub fn acquire(&mut self, root: &str, label: &str) {
        *self
            .holders
            .entry(root.to_string())
            .or_default()
            .entry(label.to_string())
            .or_insert(0) += 1;
    }

    /// Drops one request, returning whether the last interest just went away.
    pub fn release(&mut self, root: &str, label: &str) -> bool {
        let Some(windows) = self.holders.get_mut(root) else {
            return false;
        };
        if let Some(count) = windows.get_mut(label) {
            *count -= 1;
            if *count == 0 {
                windows.remove(label);
            }
        }
        if windows.is_empty() {
            self.holders.remove(root);
            return true;
        }
        false
    }

    /// Drops everything `label` held, naming the roots nobody wants any more.
    ///
    /// A window destroyed by the OS never runs its teardown, so without this its
    /// watchers would be held until the process exits.
    pub fn release_window(&mut self, label: &str) -> Vec<String> {
        let mut released = Vec::new();
        self.holders.retain(|root, windows| {
            if windows.remove(label).is_none() {
                return true;
            }
            if windows.is_empty() {
                released.push(root.clone());
                return false;
            }
            true
        });
        released
    }

    /// Drops every window's interest in `root` at once, naming each window
    /// that held it and how many requests it had outstanding.
    pub fn release_root(&mut self, root: &str) -> HashMap<String, u32> {
        self.holders.remove(root).unwrap_or_default()
    }
}

/// Starts watching `root_path` on behalf of the calling window.
///
/// Watchers are shared per workspace: two windows on one vault watch it once
/// and both receive the event, because the payload names the root and each
/// window decides whether it is theirs.
///
/// Returns the canonical root the events will be tagged with. The caller's own
/// spelling of the path may differ — through a symlink, a trailing separator,
/// or a relative segment — and a window comparing the two would quietly ignore
/// every event it was sent.
#[tauri::command]
pub fn watch_workspace(
    app: tauri::AppHandle,
    window: tauri::Window,
    root_path: String,
) -> Result<String, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    let label = window.label().to_string();

    workspace_session::watch(&key, &label, || {
        spawn_debouncer(app.clone(), root.clone(), key.clone())
    })?;

    // Auto Sync shares this lifecycle exactly: one engine per workspace, held
    // by window interest, released with the last window. Failing to record is
    // not a reason to refuse to open a workspace, so a failure here is reported
    // and the workspace opens regardless.
    //
    // Bootstrapping walks and hashes every note in the vault, and on a large
    // vault that takes long enough to stall the Windows message pump and trigger
    // an AppHang. Running it on a background thread keeps the main thread free
    // to pump messages while the hidden repository is set up. Changes that
    // arrive before the engine is attached are simply not recorded — the same
    // gap as any other brief startup window.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        // Before attaching, so the sweeper this may start can already reach the
        // windows it will have news for.
        crate::commands::watcher::remember_reach(&app);
        let app_data_dir = app_data_dir.to_path_buf();
        let root_for_sync = root.clone();
        let key_for_sync = key.clone();
        let label_for_sync = label.clone();
        std::thread::Builder::new()
            .name("thinkbrain-sync-bootstrap".into())
            .spawn(move || {
                if let Err(error) = crate::commands::sync::registry::attach(
                    &app_data_dir,
                    &root_for_sync,
                    &key_for_sync,
                    &label_for_sync,
                ) {
                    eprintln!("[sync] could not start recording {key_for_sync}: {error:?}");
                }
            })
            .map_err(|error| {
                NativeError::with_details(
                    "sync.bootstrap_thread_failed",
                    "Could not start the sync history thread.",
                    error,
                )
            })?;
    }

    Ok(key)
}

/// Releases one of the calling window's requests to watch `root_path`.
///
/// Takes the canonical root returned by {@link watch_workspace} rather than the
/// caller's own spelling: this runs when a workspace closes, which includes the
/// case where the folder has just been deleted or unmounted and can no longer
/// be canonicalized at all. Re-resolving here would fail exactly then and leak
/// the watcher it was called to release.
#[tauri::command]
pub fn unwatch_workspace(window: tauri::Window, canonical_root: String) -> Result<(), NativeError> {
    workspace_session::release_watch(&canonical_root, window.label());
    Ok(())
}

/// Registers the canonical "what happens when a window dies" cleanup on a
/// window.
///
/// A destroyed window never runs the frontend teardown, so everything it held
/// — watch requests, sync engines, the root it was launched onto — is
/// released from here through the workspace session table, or it outlives
/// the window. The main window declared in `tauri.conf.json` and every
/// workspace window share this one policy.
pub fn attach_window_destroy_cleanup(window: &tauri::WebviewWindow, label: String) {
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            workspace_session::release_window(&label);
        }
    });
}

fn watcher_start_failed(error: impl std::fmt::Display) -> NativeError {
    NativeError::with_details(
        "watcher.start_failed",
        "Could not watch the workspace folder for outside changes.",
        error,
    )
}

fn spawn_debouncer(
    app: tauri::AppHandle,
    root: PathBuf,
    key: String,
) -> Result<WorkspaceDebouncer, NativeError> {
    let handler_root = root.clone();
    let mut debouncer = new_debouncer(DEBOUNCE_WINDOW, None, move |result: DebounceEventResult| {
        let changes = match result {
            Ok(events) => collect_changes(&handler_root, &events),
            // A watcher error means the stream is no longer trustworthy;
            // the only safe report is "rebuild from disk".
            Err(errors) => {
                eprintln!("[watcher] {} error(s) watching workspace", errors.len());
                Changes::rescan()
            }
        };
        if changes.is_empty() {
            return;
        }
        // Auto Sync reads from here rather than from the frontend event:
        // a vault still has to be recorded while its window is busy, or
        // minimised, or has no listener attached yet. It takes the whole
        // list — every file type, and the app's own writes, which are
        // exactly the edits the user most expects to find in their history.
        if crate::commands::sync::registry::note_changes(&key, &handler_root, &changes.all) {
            announce_conflicts(&app, &key);
        }
        // A batch that reached the engine is a batch on its way into history,
        // which is the footer's "saving" state. The sweeper says when it lands.
        crate::commands::watcher::announce_sync_status(&key);

        if changes.notes.is_empty() {
            return;
        }
        let payload = WorkspaceChangedPayload {
            root_path: key.clone(),
            changes: changes.notes,
        };
        if let Err(error) = app.emit(WORKSPACE_CHANGED_EVENT, payload) {
            eprintln!("[watcher] failed to deliver workspace changes: {error}");
        }
    })
    .map_err(watcher_start_failed)?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(watcher_start_failed)?;

    Ok(debouncer)
}
