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

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::event::{EventKind, ModifyKind, RemoveKind, RenameMode};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::Emitter;

use crate::commands::markdown::is_markdown_path;
use crate::commands::workspace::{resolve_workspace_root, IGNORED_FOLDERS};
use crate::error::NativeError;

/// How long an unclaimed self-write record keeps suppressing.
///
/// Comfortably longer than the debounce window, so a real echo is always still
/// expected when it arrives, and short enough that a missing echo stops
/// mattering quickly.
pub const SELF_WRITE_TTL: Duration = Duration::from_secs(5);

/// How long to let a burst settle before reporting it.
///
/// Sync clients and Git checkouts rewrite many files at once; reporting each
/// one separately would reindex the vault a file at a time.
const DEBOUNCE_WINDOW: Duration = Duration::from_millis(400);

/// The frontend event carrying a settled batch of changes.
pub const WORKSPACE_CHANGED_EVENT: &str = "workspace://changed";

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
    fn at(kind: WorkspaceChangeKind, path: String) -> Self {
        Self {
            kind,
            path,
            old_path: None,
        }
    }

    fn rescan() -> Self {
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

/// Expresses `path` relative to `root`, or `None` when it is not inside it.
///
/// Separators are normalised to forward slashes because that is what the
/// frontend uses for every relative path it holds.
pub fn workspace_relative_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts: Vec<&str> = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_str()?),
            // `..`, a root, or a prefix cannot appear in a path we own.
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

/// Whether a change to `path` is one the note caches care about.
///
/// Reuses the workspace listing's own definitions of "a note" and "not worth
/// walking", so the watcher cannot come to a different answer than the listing
/// that built the index in the first place.
pub fn is_watchable_path(root: &Path, path: &Path) -> bool {
    is_markdown_path(path) && is_in_watched_area(root, path)
}

/// Whether `path` sits somewhere in the vault that could hold notes at all.
///
/// Separate from [`is_watchable_path`] because a *directory* is worth reacting
/// to without being Markdown itself. Both the note filter and the rescan
/// escalation route through here, so an ignored area cannot be reachable by one
/// and not the other — which is how `.git` churn once rebuilt the whole index.
pub fn is_in_watched_area(root: &Path, path: &Path) -> bool {
    let Some(relative) = workspace_relative_path(root, path) else {
        return false;
    };
    relative
        .split('/')
        .all(|part| !is_hidden(part) && !IGNORED_FOLDERS.contains(&part))
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Whether a vanished path in a watched area was probably a directory.
///
/// A deleted directory is gone by the time we hear about it, so it cannot be
/// stat'd and its notes cannot be enumerated. Extension-less is the only signal
/// left, and guessing wrong only costs a rebuild — but only inside an area we
/// would have indexed, or Git's own bookkeeping files (`.git/ORIG_HEAD`,
/// `.git/index`) would each look like a vanished folder.
fn looks_like_watched_directory(root: &Path, path: &Path) -> bool {
    path.extension().is_none() && is_in_watched_area(root, path)
}

/// Turns one OS event into the changes worth reporting.
///
/// Returns an empty vector for anything the caches do not track — reads,
/// attribute touches, non-Markdown files, ignored folders.
pub fn classify_event(root: &Path, kind: &EventKind, paths: &[PathBuf]) -> Vec<WorkspaceChange> {
    match kind {
        EventKind::Create(_) => single(root, paths, WorkspaceChangeKind::Created),

        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => classify_rename(root, paths),
        // Some platforms report the two halves of a rename separately, with no
        // way to pair them. Each half is complete on its own.
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
            removal(root, paths)
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            single(root, paths, WorkspaceChangeKind::Created)
        }
        EventKind::Modify(ModifyKind::Name(_)) => classify_rename(root, paths),

        EventKind::Modify(_) => single(root, paths, WorkspaceChangeKind::Modified),

        EventKind::Remove(RemoveKind::Folder) => {
            if paths.iter().any(|path| is_in_watched_area(root, path)) {
                vec![WorkspaceChange::rescan()]
            } else {
                Vec::new()
            }
        }
        EventKind::Remove(_) => removal(root, paths),

        // Reads and access events say nothing about content.
        EventKind::Access(_) => Vec::new(),
        EventKind::Any | EventKind::Other => Vec::new(),
    }
}

fn single(root: &Path, paths: &[PathBuf], kind: WorkspaceChangeKind) -> Vec<WorkspaceChange> {
    paths
        .iter()
        .filter(|path| is_watchable_path(root, path))
        .filter_map(|path| workspace_relative_path(root, path))
        .map(|relative| WorkspaceChange::at(kind, relative))
        .collect()
}

/// A removal, which may be a note or a folder full of them.
fn removal(root: &Path, paths: &[PathBuf]) -> Vec<WorkspaceChange> {
    let mut changes = Vec::new();
    for path in paths {
        if is_watchable_path(root, path) {
            if let Some(relative) = workspace_relative_path(root, path) {
                changes.push(WorkspaceChange::at(WorkspaceChangeKind::Deleted, relative));
            }
        } else if looks_like_watched_directory(root, path) {
            changes.push(WorkspaceChange::rescan());
        }
    }
    changes
}

/// A rename, which the caches can only follow when both ends are notes.
///
/// Renaming a note out of the vault (or to a non-Markdown name) is a deletion
/// as far as the index is concerned; renaming a plain file *into* a note is a
/// creation. Only note-to-note keeps the entry and moves it.
fn classify_rename(root: &Path, paths: &[PathBuf]) -> Vec<WorkspaceChange> {
    let [from, to] = match paths {
        [from, to] => [from, to],
        // Not a pair we can interpret; treat each half on its own terms.
        _ => return removal(root, paths),
    };

    let from_watchable = is_watchable_path(root, from);
    let to_watchable = is_watchable_path(root, to);

    match (from_watchable, to_watchable) {
        (true, true) => {
            match (
                workspace_relative_path(root, from),
                workspace_relative_path(root, to),
            ) {
                (Some(old), Some(new)) => vec![WorkspaceChange {
                    kind: WorkspaceChangeKind::Renamed,
                    path: new,
                    old_path: Some(old),
                }],
                _ => vec![WorkspaceChange::rescan()],
            }
        }
        (true, false) => single(root, &[from.clone()], WorkspaceChangeKind::Deleted),
        (false, true) => single(root, &[to.clone()], WorkspaceChangeKind::Created),
        // Neither end is a note. A renamed folder moves notes we cannot name.
        (false, false) => {
            if looks_like_watched_directory(root, from) || looks_like_watched_directory(root, to) {
                vec![WorkspaceChange::rescan()]
            } else {
                Vec::new()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Self-write suppression
// ---------------------------------------------------------------------------

/// Records the disk writes this app performed, so their echoes can be ignored.
pub struct SelfWriteLog {
    expected: Mutex<Option<HashMap<PathBuf, Vec<Instant>>>>,
}

impl SelfWriteLog {
    pub const fn new() -> Self {
        Self {
            expected: Mutex::new(None),
        }
    }

    /// Notes that the app just wrote `path` and expects one echo for it.
    pub fn record_at(&self, path: &Path, at: Instant) {
        let mut guard = self.expected.lock().unwrap_or_else(|error| error.into_inner());
        let entries = guard.get_or_insert_with(HashMap::new);
        entries.entry(path.to_path_buf()).or_default().push(at);
    }

    /// Claims the outstanding echoes for `path`, returning whether any were ours.
    ///
    /// One arriving event settles *every* write we are still expecting for that
    /// path, because the debouncer has already coalesced the burst: two rapid
    /// saves reach us as one event. Claiming them one at a time would strand a
    /// record, and a stranded record swallows the next edit — which is exactly
    /// the external change this feature exists to catch. Erring the other way
    /// costs at most one redundant reindex when the OS does *not* coalesce.
    ///
    /// Expired records are dropped rather than claimed, so a write whose echo
    /// never arrived cannot silently swallow a later external edit either.
    pub fn take_at(&self, path: &Path, now: Instant) -> bool {
        let mut guard = self.expected.lock().unwrap_or_else(|error| error.into_inner());
        let Some(entries) = guard.as_mut() else {
            return false;
        };
        let Some(times) = entries.get_mut(path) else {
            return false;
        };
        times.retain(|recorded| now.duration_since(*recorded) <= SELF_WRITE_TTL);
        let claimed = !times.is_empty();
        entries.remove(path);
        claimed
    }
}

impl Default for SelfWriteLog {
    fn default() -> Self {
        Self::new()
    }
}

static SELF_WRITES: SelfWriteLog = SelfWriteLog::new();

/// Records that the app itself just wrote `path`.
///
/// Called by every command that changes a file on disk. A path the app never
/// wrote is never suppressed, so forgetting a call site costs a redundant
/// reindex, never a missed external edit.
pub fn record_self_write(path: &Path) {
    SELF_WRITES.record_at(path, Instant::now());
}

fn take_self_write(path: &Path) -> bool {
    SELF_WRITES.take_at(path, Instant::now())
}

// ---------------------------------------------------------------------------
// Watch lifecycle
// ---------------------------------------------------------------------------

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
        let debouncer = spawn_debouncer(app, root.clone(), key.clone())?;
        state.debouncers.insert(key.clone(), debouncer);
    }
    state.interest.acquire(&key, &label);
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
    let mut guard = WATCHERS.lock().unwrap_or_else(|error| error.into_inner());
    let Some(state) = guard.as_mut() else {
        return Ok(());
    };
    if state.interest.release(&canonical_root, window.label()) {
        // Dropping the debouncer stops its thread and releases the OS handle.
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
    let mut guard = WATCHERS.lock().unwrap_or_else(|error| error.into_inner());
    let Some(state) = guard.as_mut() else {
        return;
    };
    for root in state.interest.release_window(label) {
        state.debouncers.remove(&root);
    }
}

fn spawn_debouncer(
    app: tauri::AppHandle,
    root: PathBuf,
    key: String,
) -> Result<WorkspaceDebouncer, NativeError> {
    let handler_root = root.clone();
    let mut debouncer = new_debouncer(
        DEBOUNCE_WINDOW,
        None,
        move |result: DebounceEventResult| {
            let changes = match result {
                Ok(events) => collect_changes(&handler_root, &events),
                // A watcher error means the stream is no longer trustworthy;
                // the only safe report is "rebuild from disk".
                Err(errors) => {
                    eprintln!("[watcher] {} error(s) watching workspace", errors.len());
                    vec![WorkspaceChange::rescan()]
                }
            };
            if changes.is_empty() {
                return;
            }
            let payload = WorkspaceChangedPayload {
                root_path: key.clone(),
                changes,
            };
            if let Err(error) = app.emit(WORKSPACE_CHANGED_EVENT, payload) {
                eprintln!("[watcher] failed to deliver workspace changes: {error}");
            }
        },
    )
    .map_err(|error| {
        NativeError::with_details(
            "watcher.start_failed",
            "Could not watch the workspace folder for outside changes.",
            error.to_string(),
        )
    })?;

    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| {
            NativeError::with_details(
                "watcher.start_failed",
                "Could not watch the workspace folder for outside changes.",
                error.to_string(),
            )
        })?;

    Ok(debouncer)
}

/// Reduces a settled batch of OS events to the changes worth sending up.
///
/// Self-write echoes are dropped here rather than in `classify_event` so that
/// classification stays a pure function of the event.
pub(crate) fn collect_changes(
    root: &Path,
    events: &[notify_debouncer_full::DebouncedEvent],
) -> Vec<WorkspaceChange> {
    let mut changes: Vec<WorkspaceChange> = Vec::new();

    for event in events {
        if event.need_rescan() {
            return vec![WorkspaceChange::rescan()];
        }
        for change in classify_event(root, &event.kind, &event.paths) {
            if change.kind == WorkspaceChangeKind::Rescan {
                return vec![WorkspaceChange::rescan()];
            }
            if is_own_echo(root, &change) {
                continue;
            }
            if !changes.contains(&change) {
                changes.push(change);
            }
        }
    }

    changes
}

/// Whether this change is the echo of a write the app just made.
fn is_own_echo(root: &Path, change: &WorkspaceChange) -> bool {
    let absolute = root.join(change.path.replace('/', std::path::MAIN_SEPARATOR_STR));
    take_self_write(&absolute)
}
