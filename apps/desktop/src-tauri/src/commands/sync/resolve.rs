//! Presenting a conflict, and carrying out what the user decides about it.
//!
//! Two versions of a note exist because a sync daemon refused to choose between
//! them. This module reads both, hands [`merge`] the bytes, and writes back
//! whatever comes of the choice — but only after a checkpoint holds both sides,
//! and only if neither has moved since the comparison was read.
//!
//! Deliberately *not* echo-suppressed. Every other write the app makes claims
//! its own echo so the indexes ignore it, because the in-app path has already
//! updated them. Here the opposite is true: the note's content changed under an
//! editor that is probably open on it, and the copy beside it disappeared from
//! the file list. Letting the watcher report both is what refreshes every window
//! showing this vault, using the path that already exists for outside edits.

use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::NativeError;
use crate::commands::workspace::{
    acquire_workspace_mutation_lock, entry_metadata, resolve_workspace_entry_path,
    resolve_workspace_root,
};

use super::conflict::{self, ConflictCopy};
use super::engine::Engine;
use super::failed;
use super::merge::{self, Kind};

/// What we call the version already in the vault.
const OURS_LABEL: &str = "This computer";

/// One side of a conflict, as the panel shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// Vault-relative, forward slashes.
    pub path: String,
    /// Whose version this is, in the user's terms: "This computer", "Syncthing".
    pub label: String,
    pub byte_size: u64,
    /// Milliseconds since the epoch, as the rest of the app reports mtimes.
    pub changed_at: Option<u64>,
    /// What this side was on disk when the comparison was read.
    ///
    /// Sent back with the resolution so a write cannot land on content nobody
    /// looked at. Content-addressed rather than a timestamp: a cloud daemon can
    /// deliver a new version inside the same second the old one was read.
    pub fingerprint: String,
}

/// A conflict, without the line-by-line comparison.
///
/// What a triage card needs: both names, both sizes and dates, who made the
/// copy, and whether a review is even possible. Both fingerprints are here too,
/// so a card offering "keep this one" can carry out that choice without opening
/// anything first.
///
/// `theirs.path` is the handle for [`read_conflict`] and [`resolve_conflict`]:
/// a conflict is named by the copy, and the rest is derived from it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictSummary {
    pub kind: Kind,
    pub decision: Decision,
    pub ours: Version,
    pub theirs: Version,
}

/// Whether this is two versions of a note, or keep-versus-delete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Decision {
    #[default]
    Versions,
    KeepOrDelete,
}

/// A comparison's complete documents: the incoming copy's text, and this
/// computer's version as the user sees it.
///
/// Whole texts, not a diff — the frontend's own differ draws the comparison,
/// so the native side owes it the two ends exactly as they stand. `current` is
/// the open editor's buffer when one was sent, because "this computer's
/// version" is what the user is looking at rather than the last save.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictText {
    pub incoming: String,
    pub current: String,
}

/// A conflict, in the only form the merge view ever sees.
///
/// There is no mention of where the texts came from. A two-way comparison of a
/// daemon's copy and a three-way merge against a real base produce the same
/// shape, so the panel that renders this does not learn which happened.
///
/// Flattened over [`ConflictSummary`], so a card and an opened comparison are
/// one shape to the frontend, with the texts the only difference between them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictView {
    #[serde(flatten)]
    pub summary: ConflictSummary,
    /// `None` when `kind` is binary: there is nothing to compare line by line,
    /// and the choice is between whole files.
    pub text: Option<ConflictText>,
}

/// What the user decided.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    /// Keep what is already in the vault and drop the daemon's copy.
    KeepOurs,
    /// Replace the note with the daemon's copy.
    KeepTheirs,
    /// Keep both, renaming the copy after the provider that made it. The escape
    /// hatch for "I cannot tell, and I am not deciding under pressure".
    KeepBoth,
    /// Assembled by the panel from the two versions it was shown.
    Merged { contents: String },
    /// Keep the note; one side had deleted it.
    KeepNote,
    /// Delete the note; one side had changed it. Checkpointed first.
    DeleteNote,
}

/// Where things ended up, so the window that asked can say so.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    /// The note that now holds the resolution.
    pub note: String,
    /// Where the other version was kept, if it was.
    pub kept_as: Option<String>,
    /// The restore point taken before anything was written.
    pub checkpoint: String,
}

/// Every conflict this workspace is waiting on someone to decide.
///
/// An unmanaged vault has no engine and so no conflicts to report, which is an
/// empty list rather than an error: the panel showing nothing is the honest
/// rendering of "Auto Sync is not looking after this folder".
///
/// A conflict whose files have gone since it was noticed is left out rather
/// than failing the whole list — one unreadable pair must not hide the rest.
#[tauri::command]
pub fn list_conflicts(root_path: String) -> Result<Vec<ConflictSummary>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let Some(engine) = super::registry::engine(&root.to_string_lossy()) else {
        return Ok(Vec::new());
    };

    Ok(engine
        .conflicts()
        .iter()
        .filter_map(|copy| summarise(&root, &copy.copy).ok())
        .collect())
}

#[tauri::command]
pub fn read_conflict(
    root_path: String,
    copy_path: String,
    buffer: Option<String>,
) -> Result<ConflictView, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    view(&root, &copy_path, buffer.as_deref())
}

#[tauri::command]
pub fn resolve_conflict(
    app: tauri::AppHandle,
    root_path: String,
    copy_path: String,
    resolution: Resolution,
    expected_ours: String,
    expected_theirs: String,
) -> Result<Resolved, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let key = root.to_string_lossy().to_string();
    // Without an engine there is no checkpoint, and without a checkpoint this
    // write would be the one thing Auto Sync promises never to be: a change to
    // the user's notes that cannot be undone.
    let engine = super::registry::engine(&key).ok_or_else(|| {
        NativeError::new(
            "sync.not_recorded",
            "Auto Sync is not keeping history for this workspace, so a conflict cannot be resolved here.",
        )
    })?;

    let resolved = resolve(
        &engine,
        &root,
        &copy_path,
        &resolution,
        &expected_ours,
        &expected_theirs,
    )?;
    // One fewer thing waiting on the user, in every window showing this vault.
    // The watcher will not say so on its own: it reports files, and the copy
    // going away is precisely the event that must *not* re-raise a conflict.
    crate::commands::watcher::announce_conflicts(&app, &key);
    Ok(resolved)
}

/// Builds the comparison for the conflict copy at `copy_path`.
///
/// `buffer` is the text of an editor open on the note with unsaved changes. It
/// stands in for the file on disk, because "this computer's version" is what
/// the user is looking at — resolving against the last save would quietly throw
/// away everything typed since. The fingerprint still comes from disk: it
/// exists to notice someone *else* writing, and the buffer is not someone else.
pub fn view(
    root: &Path,
    copy_path: &str,
    buffer: Option<&str>,
) -> Result<ConflictView, NativeError> {
    let sides = Sides::load(root, copy_path, buffer)?;
    let text = merge::text_pair(&sides.theirs.bytes, sides.shown()).map(|(incoming, current)| {
        ConflictText {
            incoming: incoming.to_string(),
            current: current.to_string(),
        }
    });
    let kind = if text.is_some() {
        Kind::Text
    } else {
        Kind::Binary
    };

    Ok(ConflictView {
        summary: sides.summarise(root, kind)?,
        text,
    })
}

/// The conflict at `copy_path` without comparing the two versions.
///
/// Deliberately does not run the diff: the triage list asks this of every
/// outstanding conflict at once, and a card shows names, sizes and dates.
pub fn summarise(root: &Path, copy_path: &str) -> Result<ConflictSummary, NativeError> {
    let sides = Sides::load(root, copy_path, None)?;
    let kind = merge::kind_of(sides.shown(), &sides.theirs.bytes);
    sides.summarise(root, kind)
}

/// Carries out `resolution`, checkpointing both sides first.
///
/// The order is the whole point. Nothing is written until a commit holds the
/// content of both files, so every outcome — including the one the user
/// regrets — is a restore away. Taking the engine as an argument rather than
/// looking it up is what makes that order testable.
pub fn resolve(
    engine: &Engine,
    root: &Path,
    copy_path: &str,
    resolution: &Resolution,
    expected_ours: &str,
    expected_theirs: &str,
) -> Result<Resolved, NativeError> {
    resolve_holding_lock(
        engine,
        root,
        copy_path,
        resolution,
        expected_ours,
        expected_theirs,
        || {},
    )
}

/// `resolve`, with a seam open between the read and the write.
///
/// The window the mutation lock exists to close is invisible from outside: a
/// save that lands after the fingerprints are checked and before the contents
/// are replaced would be overwritten while the resolution reported success.
/// Parking a caller exactly there is the only way to put a real save into it.
#[cfg(test)]
pub(super) fn resolve_after_read(
    engine: &Engine,
    root: &Path,
    copy_path: &str,
    resolution: &Resolution,
    expected_ours: &str,
    expected_theirs: &str,
    after_read: impl FnOnce(),
) -> Result<Resolved, NativeError> {
    resolve_holding_lock(
        engine,
        root,
        copy_path,
        resolution,
        expected_ours,
        expected_theirs,
        after_read,
    )
}

fn resolve_holding_lock(
    engine: &Engine,
    root: &Path,
    copy_path: &str,
    resolution: &Resolution,
    expected_ours: &str,
    expected_theirs: &str,
    after_read: impl FnOnce(),
) -> Result<Resolved, NativeError> {
    // Held across the read, the check and every write below, and it is the same
    // lock the ordinary note writes take — so a save landing in the middle of a
    // resolution is not a race this has to reason about.
    let _mutation_lock = acquire_workspace_mutation_lock();

    // No buffer: the write checks and records what is on disk. An editor's
    // unsaved text belongs in the merged contents the panel sends, not here.
    let Sides {
        pairing,
        ours,
        theirs,
        ..
    } = Sides::load(root, copy_path, None)?;
    if fingerprint(&ours.bytes) != expected_ours || fingerprint(&theirs.bytes) != expected_theirs {
        return Err(NativeError::new(
            "sync.conflict_moved",
            "One of these versions changed while you were looking at it. Nothing was written.",
        ));
    }
    if matches!(resolution, Resolution::Merged { .. })
        && merge::kind_of(&ours.bytes, &theirs.bytes) == Kind::Binary
    {
        return Err(NativeError::new(
            "sync.not_mergeable",
            "This file cannot be merged line by line; keep one version or both.",
        ));
    }
    let deletion = conflict::is_deletion_decision(&pairing.copy);
    if deletion && !matches!(resolution, Resolution::KeepNote | Resolution::DeleteNote) {
        return Err(NativeError::new(
            "sync.not_a_conflict",
            "This note was changed on one device and deleted on the other. Keep it or delete it.",
        ));
    }
    if !deletion && matches!(resolution, Resolution::KeepNote | Resolution::DeleteNote) {
        return Err(NativeError::new(
            "sync.not_a_conflict",
            "This is a choice between two versions, not whether to keep or delete the note.",
        ));
    }

    // Everything below writes. A test parks here to hold the lock open across
    // the boundary; in every other build this is a closure that does nothing.
    after_read();

    let checkpoint = engine.checkpoint(
        &[
            PathBuf::from(&pairing.original),
            PathBuf::from(&pairing.copy),
        ],
        super::snapshot::Reason::ConflictResolved,
    )?;

    let kept_as = match resolution {
        Resolution::KeepOurs => {
            discard(&theirs.path)?;
            None
        }
        Resolution::KeepTheirs => {
            put(&ours.path, &theirs.bytes)?;
            discard(&theirs.path)?;
            None
        }
        Resolution::Merged { contents } => {
            put(&ours.path, contents.as_bytes())?;
            discard(&theirs.path)?;
            None
        }
        Resolution::KeepBoth => Some(keep_both(root, &pairing)?),
        Resolution::KeepNote => {
            discard(&theirs.path)?;
            None
        }
        Resolution::DeleteNote => {
            if ours.path.exists() {
                discard(&ours.path)?;
            }
            discard(&theirs.path)?;
            None
        }
    };

    // The conflict is answered whichever way it went, and after a rename the
    // copy no longer looks like one — so nothing would clear it later.
    engine.forget_conflict(&pairing.copy);
    if matches!(resolution, Resolution::KeepNote | Resolution::DeleteNote) {
        // A keep-or-delete marker kept the note out of history. Now that the
        // decision is made, record whatever is actually on disk.
        engine.note_changes([PathBuf::from(&pairing.original)], Instant::now());
        engine.flush()?;
    }

    Ok(Resolved {
        note: pairing.original,
        kept_as,
        checkpoint: checkpoint.to_string(),
    })
}

/// The conflict `copy_path` is one half of.
///
/// Derived here rather than taken from the caller: the original's name and the
/// provider's are both consequences of the copy's name, and a frontend that
/// could name the other side could aim this at any file in the vault.
fn pairing(root: &Path, copy_path: &str) -> Result<ConflictCopy, NativeError> {
    // Through the workspace resolver first, so a path that climbs out of the
    // vault is refused before anything reads it.
    let absolute = resolve_workspace_entry_path(root, copy_path)?;
    let relative = conflict::relative_str(absolute.strip_prefix(root).unwrap_or(&absolute));

    conflict::pair(&relative, |original| root.join(original).is_file()).ok_or_else(|| {
        NativeError::new(
            "sync.not_a_conflict",
            "That file is not a conflict copy of a note in this workspace.",
        )
    })
}

struct Loaded {
    path: PathBuf,
    bytes: Vec<u8>,
}

fn load(root: &Path, relative: &str) -> Result<Loaded, NativeError> {
    let path = resolve_workspace_entry_path(root, relative)?;
    let bytes = std::fs::read(&path).map_err(|error| {
        failed(
            "sync.version_read_failed",
            "Could not read one of the two versions.",
            error,
        )
    })?;
    Ok(Loaded { path, bytes })
}

/// Both versions of one conflict, read and ready to be compared or written.
///
/// Every entry point needs exactly this much — the pairing, both files, and
/// whatever should stand in for our side — so they all start here.
struct Sides {
    pairing: ConflictCopy,
    ours: Loaded,
    theirs: Loaded,
    /// An open editor's unsaved text, when there is one.
    buffer: Option<Vec<u8>>,
}

impl Sides {
    fn load(root: &Path, copy_path: &str, buffer: Option<&str>) -> Result<Self, NativeError> {
        let pairing = pairing(root, copy_path)?;
        Ok(Self {
            ours: load(root, &pairing.original)?,
            theirs: load(root, &pairing.copy)?,
            buffer: buffer.map(|text| text.as_bytes().to_vec()),
            pairing,
        })
    }

    /// Our side as the user sees it: the editor buffer if one was sent, and
    /// what is on disk otherwise.
    fn shown(&self) -> &[u8] {
        self.buffer.as_deref().unwrap_or(&self.ours.bytes)
    }

    fn summarise(&self, root: &Path, kind: Kind) -> Result<ConflictSummary, NativeError> {
        Ok(ConflictSummary {
            kind,
            decision: if conflict::is_deletion_decision(&self.pairing.copy) {
                Decision::KeepOrDelete
            } else {
                Decision::Versions
            },
            ours: version(root, &self.ours, OURS_LABEL.to_string(), self.shown())?,
            theirs: version(
                root,
                &self.theirs,
                self.pairing.provider.to_string(),
                &self.theirs.bytes,
            )?,
        })
    }
}

fn version(
    root: &Path,
    loaded: &Loaded,
    label: String,
    shown: &[u8],
) -> Result<Version, NativeError> {
    let metadata = entry_metadata(root, &loaded.path)?;
    Ok(Version {
        path: metadata.relative_path,
        label,
        // What the user is looking at, which is the buffer when there is one.
        byte_size: shown.len() as u64,
        changed_at: metadata.updated_at,
        fingerprint: fingerprint(&loaded.bytes),
    })
}

/// A stable name for exactly these bytes.
///
/// The git blob id, because the repository is already here and computing it
/// costs one hash of content we have just read anyway.
fn fingerprint(bytes: &[u8]) -> String {
    gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::object::Kind::Blob, bytes)
        .map(|id| id.to_string())
        // A hasher that will not hash has nothing useful to say, and answering
        // with a value that can never match is the safe direction: it refuses
        // the write rather than allowing an unchecked one.
        .unwrap_or_default()
}

fn put(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    std::fs::write(path, bytes).map_err(|error| {
        failed(
            "sync.resolution_write_failed",
            "Could not write the resolved note.",
            error,
        )
    })
}

fn discard(path: &Path) -> Result<(), NativeError> {
    std::fs::remove_file(path).map_err(|error| {
        failed(
            "sync.conflict_cleanup_failed",
            "The note was resolved, but the extra copy could not be removed.",
            error,
        )
    })
}

/// Renames the copy after the provider that made it, returning the new path.
///
/// `note.sync-conflict-….md` becomes `note (Syncthing).md` — a name that says
/// where it came from, and no longer matches any pattern in the table, so the
/// same conflict is not offered again tomorrow.
fn keep_both(root: &Path, pairing: &ConflictCopy) -> Result<String, NativeError> {
    let (stem, extension) = conflict::split_extension(&pairing.original);

    for attempt in 1.. {
        let suffix = if attempt == 1 {
            pairing.provider.to_string()
        } else {
            format!("{} {attempt}", pairing.provider)
        };
        let candidate = format!("{stem} ({suffix}){extension}");
        let target = resolve_workspace_entry_path(root, &candidate)?;
        if target.exists() {
            continue;
        }
        std::fs::rename(root.join(&pairing.copy), &target).map_err(|error| {
            failed(
                "sync.conflict_cleanup_failed",
                "Both versions were kept, but the copy could not be renamed.",
                error,
            )
        })?;
        return Ok(candidate);
    }
    unreachable!("the loop returns or keeps counting")
}

#[cfg(test)]
#[path = "resolve_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "resolve_deletion_tests.rs"]
mod deletion_tests;
