//! Turns OS events into the changes each consumer can act on.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use notify::event::{EventKind, ModifyKind, RemoveKind, RenameMode};

use crate::commands::markdown::is_markdown_path;
use crate::commands::sync::bootstrap::is_never_recorded;
use crate::commands::workspace::is_ignored_entry_name;

use super::{WorkspaceChange, WorkspaceChangeKind, take_self_write};

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

/// Who a batch of changes is being classified for.
///
/// Both reuse the workspace listing's own definition of "not worth walking", so
/// the watcher cannot come to a different answer than the listing that built the
/// index in the first place.
///
/// The note caches track Markdown and nothing else. Auto Sync keeps history for
/// whatever a user puts beside their notes — a diagram, a spreadsheet, the
/// script the note is about — because a restore that cannot bring an image back
/// is not a restore. Both agree about what is not part of the vault at all, so
/// neither walks into `node_modules` or `.git`. History also refuses the junk
/// names the first snapshot already leaves out (`Thumbs.db`, `*.tmp`).
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Audience {
    Notes,
    Everything,
}

impl Audience {
    pub(crate) fn accepts(self, root: &Path, path: &Path) -> bool {
        is_in_watched_area(root, path)
            && match self {
                Audience::Notes => is_markdown_path(path),
                Audience::Everything => {
                    !is_never_recorded_path(path) && !self.must_rescan_for(root, path)
                }
            }
    }

    /// Whether `path` has to become a rescan rather than be named.
    ///
    /// A folder's name stands for everything inside it, so a consumer that
    /// mistakes one for a file does real damage — for history, it would take
    /// every note in the folder out of it. The note caches can afford the old
    /// guess, since being wrong only costs them a rebuild.
    fn must_rescan_for(self, root: &Path, path: &Path) -> bool {
        match self {
            Audience::Notes => looks_like_watched_directory(root, path),
            // Asks the disk where it can — so `Makefile` and `LICENSE` are the
            // files they are — and keeps the extension-less guess only for a
            // path that has already gone, which is the one case nothing can be
            // stat'd.
            Audience::Everything => {
                is_in_watched_area(root, path)
                    && (path.is_dir() || (path.extension().is_none() && !path.exists()))
            }
        }
    }
}

fn is_never_recorded_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(is_never_recorded)
}

/// Whether `path` sits somewhere in the vault that could hold notes at all.
///
/// Separate from [`Audience::accepts`] because a *directory* is worth reacting
/// to without being Markdown itself. Both the note filter and the rescan
/// escalation route through here, so an ignored area cannot be reachable by one
/// and not the other — which is how `.git` churn once rebuilt the whole index.
pub fn is_in_watched_area(root: &Path, path: &Path) -> bool {
    let Some(relative) = workspace_relative_path(root, path) else {
        return false;
    };
    relative.split('/').all(|part| !is_ignored_entry_name(part))
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
    classify(root, kind, paths, Audience::Notes)
}

/// The same event, read for the consumer that keeps history rather than an index.
pub(crate) fn classify_all(
    root: &Path,
    kind: &EventKind,
    paths: &[PathBuf],
) -> Vec<WorkspaceChange> {
    classify(root, kind, paths, Audience::Everything)
}

fn classify(
    root: &Path,
    kind: &EventKind,
    paths: &[PathBuf],
    audience: Audience,
) -> Vec<WorkspaceChange> {
    match kind {
        EventKind::Create(_) => single(root, paths, WorkspaceChangeKind::Created, audience),

        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
            classify_rename(root, paths, audience)
        }
        // Some platforms report the two halves of a rename separately, with no
        // way to pair them. Each half is complete on its own.
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => removal(root, paths, audience),
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            single(root, paths, WorkspaceChangeKind::Created, audience)
        }
        EventKind::Modify(ModifyKind::Name(_)) => classify_unpaired_rename(root, paths, audience),

        EventKind::Modify(_) => single(root, paths, WorkspaceChangeKind::Modified, audience),

        EventKind::Remove(RemoveKind::Folder) => {
            if paths.iter().any(|path| is_in_watched_area(root, path)) {
                vec![WorkspaceChange::rescan()]
            } else {
                Vec::new()
            }
        }
        EventKind::Remove(_) => removal(root, paths, audience),

        // Reads and access events say nothing about content.
        EventKind::Access(_) => Vec::new(),
        EventKind::Any | EventKind::Other => Vec::new(),
    }
}

fn single(
    root: &Path,
    paths: &[PathBuf],
    kind: WorkspaceChangeKind,
    audience: Audience,
) -> Vec<WorkspaceChange> {
    paths
        .iter()
        .filter(|path| audience.accepts(root, path))
        .filter_map(|path| workspace_relative_path(root, path))
        .map(|relative| WorkspaceChange::at(kind, relative))
        .collect()
}

/// A removal, which may be a note or a folder full of them.
///
/// The folder question is asked first: a path either consumer would name is one
/// it has already decided is not a folder, so the order changes nothing for
/// them and keeps the two rules from having to agree twice.
fn removal(root: &Path, paths: &[PathBuf], audience: Audience) -> Vec<WorkspaceChange> {
    let mut changes = Vec::new();
    for path in paths {
        if audience.must_rescan_for(root, path) {
            changes.push(WorkspaceChange::rescan());
        } else if audience.accepts(root, path) {
            if let Some(relative) = workspace_relative_path(root, path) {
                changes.push(WorkspaceChange::at(WorkspaceChangeKind::Deleted, relative));
            }
        }
    }
    changes
}

/// A rename the platform could not pair, carrying just one of its two ends.
///
/// FSEvents cannot correlate the halves of a rename, so macOS reports a single
/// unlabelled event that may name either the old path or the new one. Only the
/// disk can say which: treating every one of them as a removal told the app
/// that a note dragged *into* the vault had been deleted.
fn classify_unpaired_rename(
    root: &Path,
    paths: &[PathBuf],
    audience: Audience,
) -> Vec<WorkspaceChange> {
    if let [only] = paths {
        if audience.accepts(root, only) {
            let kind = if only.exists() {
                WorkspaceChangeKind::Created
            } else {
                WorkspaceChangeKind::Deleted
            };
            return single(root, paths, kind, audience);
        }
    }
    classify_rename(root, paths, audience)
}

/// A rename, which the caches can only follow when both ends are notes.
///
/// Renaming a note out of the vault (or to a non-Markdown name) is a deletion
/// as far as the index is concerned; renaming a plain file *into* a note is a
/// creation. Only note-to-note keeps the entry and moves it.
fn classify_rename(root: &Path, paths: &[PathBuf], audience: Audience) -> Vec<WorkspaceChange> {
    let [from, to] = match paths {
        [from, to] => [from, to],
        // Not a pair we can interpret; treat each half on its own terms.
        _ => return removal(root, paths, audience),
    };

    let from_watchable = audience.accepts(root, from);
    let to_watchable = audience.accepts(root, to);

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
        (true, false) => single(
            root,
            std::slice::from_ref(from),
            WorkspaceChangeKind::Deleted,
            audience,
        ),
        (false, true) => single(
            root,
            std::slice::from_ref(to),
            WorkspaceChangeKind::Created,
            audience,
        ),
        // Neither end is a note. A renamed folder moves notes we cannot name.
        (false, false) => {
            if audience.must_rescan_for(root, from) || audience.must_rescan_for(root, to) {
                vec![WorkspaceChange::rescan()]
            } else {
                Vec::new()
            }
        }
    }
}

/// What a settled batch of OS events means to each of the two consumers.
pub(crate) struct Changes {
    /// The Markdown changes the note caches track, with the app's own writes
    /// removed so the index does not chase its own tail.
    pub(crate) notes: Vec<WorkspaceChange>,
    /// Everything that happened in the vault, the app's own writes included.
    ///
    /// History has to hold the note the user just typed above all else, and in
    /// this app that note was written by the app. Suppressing echoes here would
    /// mean Auto Sync recorded only what *other* programs did to the vault.
    pub(crate) all: Vec<WorkspaceChange>,
}

/// Reduces a settled batch of OS events to the changes worth sending up.
///
/// Self-write echoes are dropped here rather than in `classify_event` so that
/// classification stays a pure function of the event.
///
/// The two consumers are classified separately rather than filtered from one
/// list: they disagree about renames (Markdown → `.txt` is a deletion to the
/// index and a rename to history), and re-deciding that from a path string
/// after the event is gone would get it wrong.
pub(crate) fn collect_changes(
    root: &Path,
    events: &[notify_debouncer_full::DebouncedEvent],
) -> Changes {
    let mut changes: Vec<WorkspaceChange> = Vec::new();
    let mut all: Vec<WorkspaceChange> = Vec::new();
    // Paths already recognised as our own within this batch. One path can
    // appear more than once with different kinds — a delete then a recreate, or
    // on macOS a write reported once for content and again for metadata — and
    // the expected echo covers the write, not each event describing it. Without
    // this, the first event claimed the record and every later one was reported
    // as somebody else's edit.
    let mut claimed: HashSet<String> = HashSet::new();

    for event in events {
        if event.need_rescan() {
            return Changes::rescan();
        }
        for change in classify_all(root, &event.kind, &event.paths) {
            if change.kind == WorkspaceChangeKind::Rescan {
                return Changes::rescan();
            }
            if !all.contains(&change) {
                all.push(change);
            }
        }
        for change in classify_event(root, &event.kind, &event.paths) {
            if change.kind == WorkspaceChangeKind::Rescan {
                return Changes::rescan();
            }
            if claimed.contains(&change.path) {
                continue;
            }
            if is_own_echo(root, &change) {
                claimed.insert(change.path.clone());
                continue;
            }
            if !changes.contains(&change) {
                changes.push(change);
            }
        }
    }

    Changes {
        notes: changes,
        all,
    }
}

impl Changes {
    pub(crate) fn rescan() -> Self {
        Self {
            notes: vec![WorkspaceChange::rescan()],
            all: vec![WorkspaceChange::rescan()],
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.notes.is_empty() && self.all.is_empty()
    }
}

/// Whether this change is the echo of a write the app just made.
fn is_own_echo(root: &Path, change: &WorkspaceChange) -> bool {
    let absolute = root.join(change.path.replace('/', std::path::MAIN_SEPARATOR_STR));
    take_self_write(&absolute)
}
