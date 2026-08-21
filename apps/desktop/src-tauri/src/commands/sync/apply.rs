use std::path::{Path, PathBuf};

use gix::merge::tree::{Resolution, ResolutionFailure};

use crate::NativeError;

use super::conflict;
use super::engine::{self, Engine, StuckNote};
use super::failed;
use super::snapshot;

/// Writes the other side's version of each undecided note beside our own.
///
/// A copy that cannot be written is skipped rather than aborting the vault:
/// the rest still lands, and the note is reported as needs-attention so the
/// next sync retries only that path.
pub(super) fn leave_copies(
    repo: &gix::Repository,
    vault: &Path,
    undecided: &[&gix::merge::tree::Conflict],
) -> Result<(Vec<conflict::ConflictCopy>, Vec<StuckNote>), NativeError> {
    let mut left = Vec::new();
    let mut skipped = Vec::new();
    for conflict in undecided {
        match deletion_decision(repo, vault, conflict) {
            Ok(Some(copy)) => {
                left.push(copy);
                continue;
            }
            Ok(None) => {}
            Err(error) => {
                skipped.push(stuck(
                    path_of(conflict).unwrap_or_else(|_| "unknown".into()),
                    None,
                    error,
                ));
                continue;
            }
        }
        let (_, theirs) = conflict.changes_in_resolution();
        let (mode, id) = theirs.entry_mode_and_id();
        if !mode.is_blob()
            || matches!(
                theirs,
                gix::diff::tree_with_rewrites::Change::Deletion { .. }
            )
        {
            // A folder, or a deletion that was not a modify/delete decision.
            // Neither is a second version of the note.
            continue;
        }
        let original = std::str::from_utf8(theirs.location()).map_err(|_| {
            NativeError::new(
                "sync.note_name_unreadable",
                "A note arrived under a name this device cannot read.",
            )
        })?;
        let beside = conflict::beside_in(vault, original);
        let contents = repo
            .find_object(id)
            .map_err(|error| {
                failed(
                    "sync.history_unreadable",
                    "Could not read the other device's version of a note.",
                    error,
                )
            })?
            .data
            .clone();
        if let Err(error) = put(&vault.join(&beside), &contents) {
            skipped.push(stuck(beside, Some(id.to_owned()), error));
            continue;
        }
        left.push(git_copy(beside, original));
    }
    Ok((left, skipped))
}

/// Brings the vault to `after`: how many notes moved, how many were left
/// beside rather than written over, and the conflict copies that resulted.
///
/// A tree diff rather than a checkout: this repository has no index and wants
/// none, and only the paths that changed should be touched — everything else
/// in the folder is the user's and none of our business.
pub(super) fn apply(
    repo: &gix::Repository,
    vault: &Path,
    before: gix::ObjectId,
    after: gix::ObjectId,
) -> Result<(usize, usize, Vec<conflict::ConflictCopy>, Vec<StuckNote>), NativeError> {
    use gix::diff::tree::recorder::Change;

    // Every name is checked before anything is written, because the names come
    // from wherever this folder syncs to and `..` is one git's tree format
    // allows. A name that would lead out of the folder stops the whole sync: it
    // is either hostile or broken, and neither is something to half-apply.
    let mut arriving = Vec::new();
    for record in snapshot::changes_between(repo, &mut Default::default(), before, after)? {
        let (mode, path, blob, expected) = match record {
            Change::Addition {
                entry_mode,
                oid,
                path,
                ..
            } => (entry_mode, path, Some(oid), None),
            Change::Modification {
                entry_mode,
                oid,
                previous_oid,
                path,
                ..
            } => (entry_mode, path, Some(oid), Some(previous_oid)),
            Change::Deletion {
                entry_mode,
                oid,
                path,
                ..
            } => (entry_mode, path, None, Some(oid)),
        };
        if !mode.is_blob() {
            continue;
        }
        arriving.push((within(vault, path.as_ref())?, path, blob, expected));
    }

    let (mut moved, mut kept_back, mut copies, mut skipped) = (0, 0, Vec::new(), Vec::new());
    for (path, relative, blob, expected) in arriving {
        // Never write over something we did not expect to find. A note someone
        // edited while this was running — or after a sync that was interrupted
        // before it could record what it had done — is theirs, and the other
        // side's version goes beside it rather than over it.
        if let Some(theirs) = unexpected(repo, &path, blob, expected)? {
            let original = relative.to_string();
            let beside = conflict::beside_in(vault, &original);
            let blob_id = blob;
            if let Err(error) = put(&vault.join(&beside), &theirs) {
                skipped.push(stuck(beside, blob_id, error));
                continue;
            }
            kept_back += 1;
            copies.push(git_copy(beside, original));
            continue;
        }

        match blob {
            Some(blob) => {
                if let Err(error) = put(&path, &contents(repo, blob)?) {
                    skipped.push(stuck(relative.to_string(), Some(blob), error));
                    continue;
                }
            }
            // Already gone is the state we wanted. Unrecorded text on disk is
            // a keep-or-delete decision: deleting it here would throw away
            // writing this device has not recorded yet.
            None => {
                if disk_has_unrecorded_text(repo, &path, expected)? {
                    match write_deletion_marker(vault, &relative.to_string()) {
                        Ok(copy) => {
                            kept_back += 1;
                            copies.push(copy);
                        }
                        Err(error) => skipped.push(stuck(relative.to_string(), expected, error)),
                    }
                    continue;
                }
                match std::fs::remove_file(&path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => {
                        skipped.push(stuck(
                            relative.to_string(),
                            expected,
                            failed(
                                "sync.note_write_failed",
                                "Could not remove a note the other device deleted.",
                                error,
                            ),
                        ));
                        continue;
                    }
                }
            }
        }
        moved += 1;
    }

    Ok((moved, kept_back, copies, skipped))
}

/// The other side's bytes, when what is on disk is not what we were about to
/// replace — and `None` when writing is safe.
fn unexpected(
    repo: &gix::Repository,
    path: &Path,
    blob: Option<gix::ObjectId>,
    expected: Option<gix::ObjectId>,
) -> Result<Option<Vec<u8>>, NativeError> {
    let Some(current) = disk_blob_id(repo, path)? else {
        // Nothing there to lose. A note already gone is also the state a
        // deletion wanted.
        return Ok(None);
    };

    if Some(current) == expected || Some(current) == blob {
        return Ok(None);
    }
    match blob {
        Some(blob) => contents(repo, blob).map(Some),
        // Incoming deletions with unrecorded disk text are handled by
        // `disk_has_unrecorded_text` rather than by writing a second version.
        None => Ok(None),
    }
}

/// The path inside `vault` that a tree entry names, or a refusal.
fn within(vault: &Path, path: &gix::bstr::BStr) -> Result<PathBuf, NativeError> {
    let named = std::str::from_utf8(path).map_err(|_| {
        NativeError::new(
            "sync.note_name_unreadable",
            "A note arrived under a name this device cannot read.",
        )
    })?;
    Ok(vault.join(snapshot::vault_relative(vault, Path::new(named))?))
}

fn contents(repo: &gix::Repository, blob: gix::ObjectId) -> Result<Vec<u8>, NativeError> {
    Ok(repo
        .find_object(blob)
        .map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a note that arrived.",
                error,
            )
        })?
        .data
        .clone())
}

fn put(path: &Path, bytes: &[u8]) -> Result<(), NativeError> {
    if path.is_file() {
        if let Ok(existing) = std::fs::read(path) {
            if existing == bytes {
                return Ok(());
            }
        }
    }
    crate::commands::workspace::write_file_atomically(path, bytes).map_err(|error| {
        failed(
            "sync.note_write_failed",
            "Could not write a note that arrived.",
            error,
        )
    })
}

fn stuck(path: String, blob: Option<gix::ObjectId>, error: NativeError) -> StuckNote {
    match blob {
        Some(blob) => StuckNote::incoming(path, blob, error),
        None => StuckNote::recording(path, error),
    }
}

fn is_modify_delete(conflict: &gix::merge::tree::Conflict) -> bool {
    matches!(
        &conflict.resolution,
        Err(ResolutionFailure::OursModifiedTheirsDeleted)
            | Ok(Resolution::Forced(
                ResolutionFailure::OursModifiedTheirsDeleted
            ))
    )
}

fn path_of(conflict: &gix::merge::tree::Conflict) -> Result<String, NativeError> {
    std::str::from_utf8(conflict.ours.location())
        .map(str::to_string)
        .map_err(|_| {
            NativeError::new(
                "sync.note_name_unreadable",
                "A note arrived under a name this device cannot read.",
            )
        })
}

/// Turns a gix modify/delete into a keep-or-delete marker. When this device
/// deleted and the other changed, the changed note is written first so the
/// text is not lost.
fn deletion_decision(
    repo: &gix::Repository,
    vault: &Path,
    conflict: &gix::merge::tree::Conflict,
) -> Result<Option<conflict::ConflictCopy>, NativeError> {
    if !is_modify_delete(conflict) {
        return Ok(None);
    }
    let original = path_of(conflict)?;
    let entries = conflict.entries();
    if entries[1].is_none() {
        let Some(theirs) = entries[2] else {
            return Ok(None);
        };
        if !theirs.mode.is_blob() {
            return Ok(None);
        }
        put(&vault.join(&original), &contents(repo, theirs.id)?)?;
    } else if entries[2].is_none() {
        if !vault.join(&original).is_file() {
            return Ok(None);
        }
    } else {
        return Ok(None);
    }
    write_deletion_marker(vault, &original).map(Some)
}

fn write_deletion_marker(
    vault: &Path,
    original: &str,
) -> Result<conflict::ConflictCopy, NativeError> {
    let beside = conflict::deletion_beside_in(vault, original);
    put(&vault.join(&beside), b"")?;
    Ok(git_copy(beside, original))
}

fn git_copy(copy: String, original: impl Into<String>) -> conflict::ConflictCopy {
    conflict::ConflictCopy {
        copy,
        original: original.into(),
        provider: "git",
    }
}

fn disk_has_unrecorded_text(
    repo: &gix::Repository,
    path: &Path,
    expected: Option<gix::ObjectId>,
) -> Result<bool, NativeError> {
    Ok(disk_blob_id(repo, path)?.is_some_and(|current| Some(current) != expected))
}

fn disk_blob_id(repo: &gix::Repository, path: &Path) -> Result<Option<gix::ObjectId>, NativeError> {
    let Ok(bytes) = std::fs::read(path) else {
        return Ok(None);
    };
    gix::objs::compute_hash(repo.object_hash(), gix::object::Kind::Blob, &bytes)
        .map(Some)
        .map_err(|error| {
            failed(
                "sync.note_write_failed",
                "Could not read a note before replacing it.",
                error,
            )
        })
}

/// Reports recorded shortcuts and nested repositories that are not present in
/// the vault. They stay in the tree so this device does not broadcast a
/// deletion; the warning is rebuilt from the tree on every trip.
pub(super) fn skipped_unsupported(
    repo: &gix::Repository,
    vault: &Path,
) -> Result<Vec<StuckNote>, NativeError> {
    let Some(commit) = snapshot::head_commit(repo)? else {
        return Ok(Vec::new());
    };
    let tree = repo
        .find_commit(commit)
        .map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a recorded state.",
                error,
            )
        })?
        .tree()
        .map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a recorded state.",
                error,
            )
        })?;
    let mut recorder = gix::traverse::tree::Recorder::default();
    tree.traverse()
        .breadthfirst(&mut recorder)
        .map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a recorded state.",
                error,
            )
        })?;

    let mut skipped = Vec::new();
    for entry in recorder.records {
        let path = entry.filepath.to_string();
        if entry.mode.is_link() && !vault_is_symlink(vault, &path) {
            skipped.push(StuckNote::unsupported(
                path,
                engine::SYMLINK_SKIPPED,
                "A shortcut from another device was not created here.",
            ));
        } else if entry.mode.is_commit() && !vault_is_gitlink(vault, &path) {
            skipped.push(StuckNote::unsupported(
                path,
                engine::SUBMODULE_SKIPPED,
                "A folder with its own version history from another device was not brought in.",
            ));
        }
    }
    Ok(skipped)
}

fn vault_is_symlink(vault: &Path, relative: &str) -> bool {
    std::fs::symlink_metadata(vault.join(relative))
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn vault_is_gitlink(vault: &Path, relative: &str) -> bool {
    vault.join(relative).join(".git").exists()
}

/// Retries notes a previous attempt could not write, before this round trip
/// does any new work. Recording failures (no blob) are flushed through the
/// engine; incoming writes are put from the blob we already have. Skipped
/// shortcuts and nested repositories are left alone so they are not recorded
/// as deletions.
pub(super) fn retry_stuck(engine: &Engine, vault: &Path) -> Result<(), NativeError> {
    let repo = engine.repository();
    let mut recording = Vec::new();
    for note in engine.stuck() {
        if engine::is_unsupported(&note.code) {
            continue;
        }
        match note.blob {
            None => recording.push(PathBuf::from(&note.path)),
            Some(blob) => match put(&vault.join(&note.path), &contents(&repo, blob)?) {
                Ok(()) => engine.forget_stuck(&note.path),
                Err(error) => engine.note_stuck([stuck(note.path, Some(blob), error)]),
            },
        }
    }
    if !recording.is_empty() {
        engine.note_changes(recording, std::time::Instant::now());
        engine.flush()?;
    }
    Ok(())
}
