//! Starts, shares, and stops per-workspace watchers.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use tauri::{Emitter, Manager};

use crate::commands::workspace::resolve_workspace_root;
use crate::error::NativeError;

use super::{
    announce_conflicts, collect_changes, Changes, WorkspaceChangedPayload, WORKSPACE_CHANGED_EVENT,
};

/// How long to let a burst settle before reporting it.
///
/// Sync clients and Git checkouts rewrite many files at once; reporting each
/// one separately would reindex the vault a file at a time.
const DEBOUNCE_WINDOW: Duration = Duration::from_millis(400);

type WorkspaceDebouncer = Debouncer<RecommendedWatcher, RecommendedCache>;

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
}

/// The live watchers and the interest keeping each one alive.
#[derive(Default)]
struct WatchState {
    interest: WatchInterest,
    debouncers: HashMap<String, WorkspaceDebouncer>,
}

static WATCHERS: Mutex<Option<WatchState>> = Mutex::new(None);

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

    let mut guard = WATCHERS.lock().unwrap_or_else(|error| error.into_inner());
    let state = guard.get_or_insert_with(WatchState::default);

    // Start the watcher before registering interest, so a failure to start
    // leaves nothing claiming a watcher that does not exist.
    if !state.interest.is_watched(&key) {
        let debouncer = spawn_debouncer(app.clone(), root.clone(), key.clone())?;
        state.debouncers.insert(key.clone(), debouncer);
    }
    state.interest.acquire(&key, &label);
    drop(guard);

    // Auto Sync shares this lifecycle exactly: one engine per workspace, held
    // by window interest, released with the last window. Failing to record is
    // not a reason to refuse to open a workspace, so a failure here is reported
    // and the workspace opens regardless.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        // Before attaching, so the sweeper this may start can already reach the
        // windows it will have news for.
        crate::commands::watcher::remember_reach(&app);
        if let Err(error) =
            crate::commands::sync::registry::attach(&app_data_dir, &root, &key, &label)
        {
            eprintln!("[sync] could not start recording {key}: {error:?}");
        }
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
    // Flush while the watcher is still live. Dropping the debouncer first
    // would leave a gap where a vault edit is seen by neither the flush
    // nor the watcher.
    crate::commands::sync::registry::detach(&canonical_root, window.label());
    let mut guard = WATCHERS.lock().unwrap_or_else(|error| error.into_inner());
    let Some(state) = guard.as_mut() else {
        return Ok(());
    };
    if state.interest.release(&canonical_root, window.label()) {
        state.debouncers.remove(&canonical_root);
    }
    Ok(())
}

/// Releases every watcher a window held, for windows the OS destroys.
///
/// A destroyed window never runs the frontend teardown that would otherwise
/// call `unwatch_workspace`, so its watchers would be held until the process
/// exits.
pub fn release_window_watchers(label: &str) {
    // Same ordering as unwatch_workspace: flush before the watcher is gone.
    crate::commands::sync::registry::release_window(label);
    let mut guard = WATCHERS.lock().unwrap_or_else(|error| error.into_inner());
    let Some(state) = guard.as_mut() else {
        return;
    };
    for root in state.interest.release_window(label) {
        state.debouncers.remove(&root);
    }
}

/// Registers the canonical "what happens when a window dies" cleanup on a
/// window.
///
/// Every window needs its file watchers released when the OS destroys it
/// (the frontend teardown never runs in that case). Workspace windows *also*
/// need their entry in `WorkspaceWindowRoots` removed; pass an `extra_cleanup`
/// closure for that, or `None` for the main window declared in
/// `tauri.conf.json`, which is never registered as a workspace window.
///
/// Centralizing the policy here means a reader only has to look in one place
/// to know the full cleanup, instead of finding a near-duplicate closure in
/// both `lib.rs` and `workspace.rs`.
pub fn attach_window_destroy_cleanup<F>(
    window: &tauri::WebviewWindow,
    label: String,
    extra_cleanup: Option<F>,
) where
    F: FnOnce() + Send + 'static,
{
    // `on_window_event` requires `Fn` (it may be invoked for many event kinds),
    // but the destroy cleanup is one-shot. Wrap the closure in a `Mutex` so the
    // `Fn` closure can `take()` it on the single `Destroyed` event.
    let extra_cleanup = std::sync::Mutex::new(extra_cleanup);
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(extra) = extra_cleanup.lock().ok().and_then(|mut g| g.take()) {
                extra();
            }
            // A destroyed window never runs the frontend teardown, so its file
            // watchers have to be released from here or they outlive it.
            release_window_watchers(&label);
        }
    });
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
    .map_err(|error| {
        NativeError::with_details(
            "watcher.start_failed",
            "Could not watch the workspace folder for outside changes.",
            error,
        )
    })?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| {
            NativeError::with_details(
                "watcher.start_failed",
                "Could not watch the workspace folder for outside changes.",
                error,
            )
        })?;

    Ok(debouncer)
}
