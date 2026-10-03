//! The hidden repository, read back as something a person can act on.
//!
//! Two surfaces come out of one reader. "Sync History" is every recorded
//! change; "previous versions of this note" is the same walk asked a narrower
//! question. Keeping them one function is what stops the two lists from ever
//! disagreeing about what happened.
//!
//! Nothing here speaks git to the caller. A change has a time, a sentence and a
//! list of notes; putting one back takes the note's name and the change to take
//! it from. The commit ids that carry those around are opaque handles, and the
//! surfaces that show them label them as such.

use std::path::Path;

use serde::Serialize;

use crate::NativeError;
use crate::commands::workspace::{acquire_workspace_mutation_lock, resolve_workspace_root};

use super::engine::Engine;
use super::failed;
use super::snapshot::{self, Reason};

/// How far back the local-main diagnostic walks search before giving up.
///
/// These counters are status-surface diagnostics scoped to the workspace's
/// own recorded history only. The version timeline itself has no cap:
/// `history_walk` reads every reachable commit so a paginated list never
/// silently stops early.
const SCAN: usize = 5_000;

/// What happened to one note in one recorded change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NoteChange {
    Added,
    Updated,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedNote {
    /// Vault-relative, forward slashes.
    pub path: String,
    pub change: NoteChange,
}

/// Which history a recorded change belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    /// Recorded by this workspace's own snapshots.
    Local,
    /// Imported from the workspace's Git history.
    Git,
}

/// One change, as the history list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recorded {
    /// The handle to restore from. Opaque to the frontend by design.
    pub id: String,
    /// Milliseconds since the epoch, as the rest of the app reports times.
    /// `None` when the original record's date cannot be represented.
    pub at: Option<u64>,
    /// Exactly as it was recorded — the escape hatch for anyone who would
    /// rather read the record than our rendering of it.
    pub message: String,
    pub notes: Vec<ChangedNote>,
    pub source: Source,
}

/// One page of history plus the opaque handle that continues it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub changes: Vec<Recorded>,
    /// Present exactly when more rows exist — never a promise the walk
    /// stopped early, because it does not.
    pub next_cursor: Option<String>,
}

/// Where a restored version came from and what was held before it landed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Restored {
    pub note: String,
    /// The restore point taken before the note was overwritten, so putting an
    /// old version back is itself undoable.
    pub checkpoint: String,
}

/// How often someone has had to decide between two versions of a note.
///
/// Local only, and never sent anywhere: a diagnostic counter, not a gate --
/// cloud merging is its own work, not something these numbers approve.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rate {
    /// Conflicts the user was asked about.
    pub decisions: usize,
    /// Conflicts that carried nothing to decide and were settled without
    /// asking. Kept apart from `decisions` because the difference is the
    /// number the three-way-merge question actually turns on.
    pub settled: usize,
    pub recorded: usize,
}

/// The most recent changes, newest first -- the first page for existing
/// internal readers.
///
/// `note` narrows the list to the changes that left content for one note —
/// which is exactly the list of versions it can be restored to, and why the
/// change that *deleted* it is left out.
#[allow(
    dead_code,
    reason = "first-page convenience for internal readers and tests"
)]
pub fn read(
    repo: &gix::Repository,
    note: Option<&str>,
    limit: usize,
) -> Result<Vec<Recorded>, NativeError> {
    let roots = super::history_page::current_roots(repo, note.is_some())?;
    Ok(super::history_page::events(repo, &roots, note)?
        .into_iter()
        .take(limit)
        .collect())
}

/// Puts the version of `note` recorded in `change` back into the vault.
///
/// The order is the promise: the earlier version is read, then a restore point
/// holds what is on disk now, and only then is anything written. That is what
/// makes a restore undoable by another restore rather than a one-way door.
///
/// Deliberately not echo-suppressed, for the same reason resolving a conflict
/// is not: the note changed under an editor that is probably open on it, and
/// the watcher's outside-edit path is what refreshes every window showing it.
pub fn restore(engine: &Engine, note: &str, change: &str) -> Result<Restored, NativeError> {
    // The same lock ordinary note writes take, so a save landing in the middle
    // of a restore is not a race this has to reason about.
    let _mutation_lock = acquire_workspace_mutation_lock();

    let repo = engine.repository();
    let vault = repo
        .workdir()
        .ok_or_else(|| {
            NativeError::new("sync.no_worktree", "This sync history has no notes folder.")
        })?
        .to_path_buf();
    let relative = snapshot::vault_relative(&vault, Path::new(note))?;

    let wanted = version_at(&repo, &relative, change)?;

    let checkpoint = engine.checkpoint(std::slice::from_ref(&relative), Reason::VersionRestored)?;

    let absolute = vault.join(&relative);
    crate::commands::workspace::write_file_atomically(&absolute, &wanted).map_err(|error| {
        failed(
            "sync.restore_failed",
            "Could not write the restored note.",
            error,
        )
    })?;

    Ok(Restored {
        note: note.to_string(),
        checkpoint: checkpoint.to_string(),
    })
}

/// How many decisions this vault has asked of its user, against how many
/// changes it has recorded.
pub fn conflict_rate(repo: &gix::Repository) -> Result<Rate, NativeError> {
    let checkpoints = snapshot::checkpoint_head(repo)?;
    Ok(Rate {
        decisions: count(repo, checkpoints, Some(Reason::ConflictResolved.message()))?,
        settled: count(
            repo,
            checkpoints,
            Some(Reason::DuplicateDiscarded.message()),
        )?,
        recorded: count(repo, snapshot::head_commit(repo)?, None)?,
    })
}

/// When the last change was recorded, if any has been.
///
/// Deliberately scoped to this workspace's own history branch only: an
/// imported Git root says when the *source* last moved, not when Auto Sync
/// last recorded this vault, and the status line must not confuse the two.
pub fn last_recorded(repo: &gix::Repository) -> Result<Option<u64>, NativeError> {
    let Some(id) = snapshot::head_commit(repo)? else {
        return Ok(None);
    };
    let commit = repo
        .find_commit(id)
        .map_err(|error| unreadable("Could not read the sync history.", error))?;
    Ok(commit
        .time()
        .ok()
        .and_then(|time| super::history_walk::millis(time.seconds)))
}

/// Whether `note` has ever been recorded with exactly this content.
///
/// Compares the blob ids the trees already hold rather than reading any
/// content back: two files are the same file precisely when git would store
/// them as the same object, and asking that question costs a tree lookup
/// rather than a read.
///
/// This is what makes "that device was simply behind" answerable without a
/// merge base. If the other machine's file is a state ours has already passed
/// through, ours holds everything theirs did.
///
/// The walk is bounded by [`SCAN`]. A `false` answer means "not within the
/// last `SCAN` commits" rather than "never": a note whose matching version is
/// older than that is reported as not recorded. The false negative is safe —
/// it turns a skip into a merge — but it is not a definitive "never".
pub fn has_recorded(
    repo: &gix::Repository,
    note: &Path,
    blob: gix::ObjectId,
) -> Result<bool, NativeError> {
    let mut next = snapshot::head_commit(repo)?;

    for _ in 0..SCAN {
        let Some(id) = next else { break };
        let commit = repo
            .find_commit(id)
            .map_err(|error| unreadable("Could not read the sync history.", error))?;
        next = commit.parent_ids().next().map(|parent| parent.detach());

        let mut tree = commit
            .tree()
            .map_err(|error| unreadable("Could not read the sync history.", error))?;
        let entry = tree
            .peel_to_entry_by_path(note)
            .map_err(|error| unreadable("Could not read the sync history.", error))?;
        if entry.is_some_and(|entry| entry.object_id() == blob) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// The contents `note` had in `change`.
fn version_at(
    repo: &gix::Repository,
    relative: &Path,
    change: &str,
) -> Result<Vec<u8>, NativeError> {
    let missing = || {
        NativeError::new(
            "sync.version_missing",
            "That earlier version of this note is no longer available.",
        )
    };

    let id = gix::ObjectId::from_hex(change.as_bytes()).map_err(|_| missing())?;
    let mut tree = repo
        .find_commit(id)
        .map_err(|_| missing())?
        .tree()
        .map_err(|error| unreadable("Could not read the sync history.", error))?;
    let entry = tree
        .peel_to_entry_by_path(relative)
        .map_err(|error| unreadable("Could not read the sync history.", error))?
        .ok_or_else(missing)?;
    if !entry.mode().is_blob() {
        return Err(missing());
    }
    Ok(entry
        .object()
        .map_err(|error| unreadable("Could not read that earlier version.", error))?
        .data
        .clone())
}

/// Commits reachable from `head`, optionally only those recorded under
/// `message`.
fn count(
    repo: &gix::Repository,
    head: Option<gix::ObjectId>,
    message: Option<&str>,
) -> Result<usize, NativeError> {
    let mut counted = 0;
    let mut next = head;
    for _ in 0..SCAN {
        let Some(id) = next else { break };
        let commit = repo
            .find_commit(id)
            .map_err(|error| unreadable("Could not read the sync history.", error))?;
        if message.is_none_or(|wanted| commit.message_raw_sloppy() == wanted) {
            counted += 1;
        }
        next = commit.parent_ids().next().map(|parent| parent.detach());
    }
    Ok(counted)
}

fn unreadable(message: &'static str, error: impl std::fmt::Display) -> NativeError {
    failed("sync.history_read_failed", message, error)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// The engine keeping history for `root_path`, or nothing.
///
/// `None` means the workspace was never opened under Auto Sync; a vault's own
/// `.git` no longer means that -- it records like any other and imports its
/// history read-only. An empty list is the honest rendering of "Auto Sync is
/// not looking after this", not an error.
fn engine_for(
    root_path: &str,
) -> Result<Option<std::sync::Arc<super::engine::Engine>>, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    Ok(super::registry::engine(&root.to_string_lossy()))
}

#[tauri::command]
pub fn sync_history(
    root_path: String,
    note_path: Option<String>,
    limit: usize,
    cursor: Option<String>,
) -> Result<HistoryPage, NativeError> {
    let Some(engine) = engine_for(&root_path)? else {
        return Ok(HistoryPage {
            changes: Vec::new(),
            next_cursor: None,
        });
    };
    let repo = engine.repository();
    // The cursor pins the canonical workdir the engine actually opened, so a
    // differently-spelled `root_path` cannot borrow another workspace's
    // continuation. A repo without a workdir falls back to the resolved
    // root -- never the raw caller string, which is the alias this is for.
    let workspace = match repo.workdir() {
        Some(workdir) => workdir.to_string_lossy().into_owned(),
        None => resolve_workspace_root(&root_path)?
            .to_string_lossy()
            .into_owned(),
    };
    let limit = limit.clamp(1, 200);
    super::history_page::page(
        &repo,
        &workspace,
        note_path.as_deref(),
        limit,
        cursor.as_deref(),
    )
}

#[tauri::command]
pub fn restore_version(
    root_path: String,
    note_path: String,
    change: String,
) -> Result<(), NativeError> {
    // Without an engine there is no restore point, and without one this write
    // would be the single thing Auto Sync promises never to be: a change to the
    // user's notes that cannot be undone.
    let engine = engine_for(&root_path)?.ok_or_else(|| {
        NativeError::new(
            "sync.not_recorded",
            "Auto Sync is not keeping history for this workspace, so there is nothing to put back.",
        )
    })?;
    restore(&engine, &note_path, &change).map(|_| ())
}

#[tauri::command]
pub fn sync_conflict_rate(root_path: String) -> Result<Rate, NativeError> {
    let Some(engine) = engine_for(&root_path)? else {
        return Ok(Rate {
            decisions: 0,
            settled: 0,
            recorded: 0,
        });
    };
    conflict_rate(&engine.repository())
}

/// One comparison's complete documents: the file as it is now, and the
/// version recorded in the selected change.
///
/// Whole texts, not a diff — the frontend's own differ draws the comparison,
/// so the native side owes it the two ends exactly as they stand. `current` is
/// the open editor's buffer when one was sent, because "the file" is what the
/// user is looking at rather than the last save.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionText {
    pub current: String,
    pub recorded: String,
}

/// One comparison of the current file against a recorded version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionDiff {
    pub kind: super::merge::Kind,
    pub change: String,
    pub note_path: String,
    /// Both complete documents when the pair is text; `None` for binary, where
    /// there is nothing to draw and the choice is between whole files.
    pub text: Option<VersionText>,
}

/// Computes the comparison between the current note and a historical version recorded in `change`.
pub fn diff_version(
    engine: &Engine,
    note: &str,
    change: &str,
    buffer: Option<&str>,
) -> Result<VersionDiff, NativeError> {
    let repo = engine.repository();
    let vault = repo.workdir().ok_or_else(|| {
        NativeError::new("sync.no_worktree", "This sync history has no notes folder.")
    })?;
    let relative = snapshot::vault_relative(&vault, Path::new(note))?;
    let absolute = vault.join(&relative);

    let current_bytes = match buffer {
        Some(b) => b.as_bytes().to_vec(),
        None => std::fs::read(&absolute).map_err(|error| {
            failed(
                "sync.note_read_failed",
                "Could not read the current note.",
                error,
            )
        })?,
    };

    let recorded_bytes = version_at(&repo, &relative, change)?;
    let text =
        super::merge::text_pair(&current_bytes, &recorded_bytes).map(|(current, recorded)| {
            VersionText {
                current: current.to_string(),
                recorded: recorded.to_string(),
            }
        });

    Ok(VersionDiff {
        kind: if text.is_some() {
            super::merge::Kind::Text
        } else {
            super::merge::Kind::Binary
        },
        change: change.to_string(),
        note_path: note.to_string(),
        text,
    })
}

/// Tauri command computing the diff between the current note and a historical version.
#[tauri::command]
pub fn read_version_diff(
    root_path: String,
    note_path: String,
    change: String,
    buffer: Option<String>,
) -> Result<VersionDiff, NativeError> {
    let engine = engine_for(&root_path)?.ok_or_else(|| {
        NativeError::new(
            "sync.not_recorded",
            "Auto Sync is not keeping history for this workspace.",
        )
    })?;
    diff_version(&engine, &note_path, &change, buffer.as_deref())
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "history_page_tests.rs"]
mod page_tests;
