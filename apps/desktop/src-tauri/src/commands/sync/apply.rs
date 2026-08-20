use std::path::{Path, PathBuf};

use crate::NativeError;

use super::conflict;
use super::engine::{Engine, StuckNote};
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
        let (_, theirs) = conflict.changes_in_resolution();
        let (mode, id) = theirs.entry_mode_and_id();
        if !mode.is_blob() {
            // A folder, or a note they deleted. Neither is a version of
            // anything, so there is nothing to put beside ours.
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
        left.push(conflict::ConflictCopy {
            copy: beside,
            original: original.to_string(),
            provider: "git",
        });
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
            copies.push(conflict::ConflictCopy {
                copy: beside,
                original,
                provider: "git",
            });
            continue;
        }

        match blob {
            Some(blob) => {
                if let Err(error) = put(&path, &contents(repo, blob)?) {
                    skipped.push(stuck(relative.to_string(), Some(blob), error));
                    continue;
                }
            }
            // Already gone is the state we wanted; anything else is skipped
            // rather than aborting the rest of the vault.
            None => match std::fs::remove_file(&path) {
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
            },
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
    let Ok(on_disk) = std::fs::read(path) else {
        // Nothing there to lose. A note already gone is also the state a
        // deletion wanted.
        return Ok(None);
    };
    let current = gix::objs::compute_hash(repo.object_hash(), gix::object::Kind::Blob, &on_disk)
        .map_err(|error| {
            failed(
                "sync.note_write_failed",
                "Could not read a note before replacing it.",
                error,
            )
        })?;

    if Some(current) == expected || Some(current) == blob {
        return Ok(None);
    }
    match blob {
        Some(blob) => contents(repo, blob).map(Some),
        // They deleted a note this device has since changed. Keeping it is the
        // safe direction, and there is nothing of theirs to put beside it.
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

/// Retries notes a previous attempt could not write, before this round trip
/// does any new work. Recording failures (no blob) are flushed through the
/// engine; incoming writes are put from the blob we already have.
pub(super) fn retry_stuck(engine: &Engine, vault: &Path) -> Result<(), NativeError> {
    let repo = engine.repository();
    let mut recording = Vec::new();
    for note in engine.stuck() {
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
