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

use crate::commands::workspace::{acquire_workspace_mutation_lock, resolve_workspace_root};
use crate::NativeError;

use super::engine::Engine;
use super::failed;
use super::snapshot::{self, Reason};

/// How far back one note's own history is searched before giving up.
///
/// A note edited once a year in a vault edited hourly would otherwise walk the
/// whole history to find nothing, on a panel someone opened by accident. The
/// cap is generous enough that a real note's versions are all found; when a
/// longer history is truncated by it, the reader logs that it stopped rather
/// than returning a list that quietly looks complete.
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

/// One change, as the history list shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recorded {
    /// The handle to restore from. Opaque to the frontend by design.
    pub id: String,
    /// Milliseconds since the epoch, as the rest of the app reports times.
    pub at: Option<u64>,
    /// Exactly as it was recorded — the escape hatch for anyone who would
    /// rather read the record than our rendering of it.
    pub message: String,
    pub notes: Vec<ChangedNote>,
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
/// Local only, and never sent anywhere. It exists so the question "is a
/// three-way merge worth building" is answered with this vault's evidence
/// rather than with an opinion.
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

/// The most recent changes, newest first.
///
/// `note` narrows the list to the changes that left content for one note —
/// which is exactly the list of versions it can be restored to, and why the
/// change that *deleted* it is left out.
pub fn read(
    repo: &gix::Repository,
    note: Option<&str>,
    limit: usize,
) -> Result<Vec<Recorded>, NativeError> {
    let mut found = Vec::new();
    let mut next = snapshot::head_commit(repo)?;
    let mut state = gix::diff::tree::State::default();

    for _ in 0..SCAN {
        let Some(id) = next else { break };
        if found.len() >= limit {
            break;
        }

        let commit = repo
            .find_commit(id)
            .map_err(|error| unreadable("Could not read the sync history.", error))?;
        let parent = commit.parent_ids().next().map(|parent| parent.detach());
        let at = commit
            .time()
            .ok()
            .and_then(|time| u64::try_from(time.seconds).ok())
            .map(|seconds| seconds * 1_000);
        let message = commit.message_raw_sloppy().to_string();
        next = parent;

        let mut notes = touched(repo, &mut state, parent, id)?;
        if let Some(wanted) = note {
            notes.retain(|note| note.path == wanted && note.change != NoteChange::Removed);
        }
        if notes.is_empty() {
            continue;
        }

        found.push(Recorded {
            id: id.to_string(),
            at,
            message,
            notes,
        });
    }

    // The cap was reached without running out of history: older versions may
    // exist beyond it. Say so loudly rather than handing back a list that looks
    // complete. The common case (a real note's versions all live within SCAN)
    // never reaches here.
    if next.is_some() && found.len() < limit {
        eprintln!(
            "[sync] history for {} stopped at the {SCAN}-commit scan cap; older versions may exist",
            note.unwrap_or("the vault")
        );
    }

    Ok(found)
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
/// Read from the history rather than remembered in memory, so the status
/// surface still says "all saved, 9:31" the moment the app is reopened.
pub fn last_recorded(repo: &gix::Repository) -> Result<Option<u64>, NativeError> {
    Ok(read(repo, None, 1)?.first().and_then(|change| change.at))
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

/// The notes one change touched, in the vocabulary the list speaks.
fn touched(
    repo: &gix::Repository,
    state: &mut gix::diff::tree::State,
    parent: Option<gix::ObjectId>,
    commit: gix::ObjectId,
) -> Result<Vec<ChangedNote>, NativeError> {
    let changes = snapshot::changes_between(
        repo,
        state,
        snapshot::tree_of(repo, parent)?,
        snapshot::tree_of(repo, Some(commit))?,
    )?;

    // Only files. A folder appearing or disappearing is the notes inside it
    // arriving or leaving, and they are each listed in their own right.
    let mut notes: Vec<ChangedNote> = changes
        .into_iter()
        .filter_map(|record| {
            use gix::diff::tree::recorder::Change;
            let (mode, path, change) = match record {
                Change::Addition {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Added),
                Change::Deletion {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Removed),
                Change::Modification {
                    entry_mode, path, ..
                } => (entry_mode, path, NoteChange::Updated),
            };
            mode.is_blob().then(|| ChangedNote {
                path: path.to_string(),
                change,
            })
        })
        .collect();
    notes.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(notes)
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
/// A vault with its own git repository has no engine and therefore no history
/// of ours. That is an empty list rather than an error: the panel showing
/// nothing is the honest rendering of "Auto Sync is not looking after this".
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
) -> Result<Vec<Recorded>, NativeError> {
    let Some(engine) = engine_for(&root_path)? else {
        return Ok(Vec::new());
    };
    read(&engine.repository(), note_path.as_deref(), limit)
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

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
