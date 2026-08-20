use std::path::{Path, PathBuf};

use crate::NativeError;

use super::{failed, is_executable, open_without_following, tree_path, unreadable};

pub(super) enum RecordFileError {
    Skipped((PathBuf, NativeError)),
    Fatal(NativeError),
}

/// Records one regular file, distinguishing a note that can be skipped from
/// a tree-edit failure that must abort the recording batch.
pub(super) fn record_file(
    repo: &gix::Repository,
    editor: &mut gix::object::tree::Editor<'_>,
    vault: &Path,
    relative: &Path,
    path: &Path,
) -> Result<(), RecordFileError> {
    let absolute = vault.join(relative);
    let file = match open_without_following(&absolute) {
        Ok(file) => file,
        Err(open_error) => {
            let still_file = match std::fs::symlink_metadata(&absolute) {
                Ok(metadata) => metadata.is_file(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
                Err(error) => {
                    return Err(RecordFileError::Skipped((
                        path.to_path_buf(),
                        unreadable(error),
                    )));
                }
            };
            if still_file {
                return Err(RecordFileError::Skipped((
                    path.to_path_buf(),
                    unreadable(open_error),
                )));
            }
            editor.remove(tree_path(relative)).map_err(|error| {
                RecordFileError::Fatal(failed(
                    "sync.tree_write_failed",
                    "Could not record a deleted note.",
                    error,
                ))
            })?;
            return Ok(());
        }
    };

    // Mode and type come from this fd, not the path-stat above:
    // a swap between the two would otherwise record one file's
    // bytes under another's executable bit, or follow a symlink
    // that appeared after the check.
    let metadata = file
        .metadata()
        .map_err(|error| RecordFileError::Skipped((path.to_path_buf(), unreadable(error))))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Ok(());
    }
    let blob = repo.write_blob_stream(file).map_err(|error| {
        RecordFileError::Skipped((
            path.to_path_buf(),
            failed(
                "sync.note_store_failed",
                "Could not store a note's contents.",
                error,
            ),
        ))
    })?;
    let kind = if is_executable(&metadata) {
        gix::object::tree::EntryKind::BlobExecutable
    } else {
        gix::object::tree::EntryKind::Blob
    };
    editor
        .upsert(tree_path(relative), kind, blob.detach())
        .map_err(|error| {
            RecordFileError::Fatal(failed(
                "sync.tree_write_failed",
                "Could not record a note.",
                error,
            ))
        })
        .map(|_| ())
}
