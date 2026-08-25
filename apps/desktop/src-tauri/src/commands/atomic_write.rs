//! Durable atomic file replacement.
//!
//! Writes and syncs a sibling temp before replacing the destination. Unix uses
//! `rename`; Windows uses write-through `MoveFileExW` without first deleting
//! the old file. Failed writes remove their temp file.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Syncs a sibling temp, atomically replaces `path`, and cleans failed temps.
pub fn write_file_atomically(path: &Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "file path must include a parent directory",
        )
    })?;
    fs::create_dir_all(parent)?;

    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // Include the target stem so two writers in one directory — app and
    // workspace settings share `settings/` — cannot collide on the temp name
    // even if their timestamps match.
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let temp = parent.join(format!(".{stem}.{unique}.tmp"));

    // Sync new bytes before replacement; Windows also flushes the rename.
    let persisted = (|| -> io::Result<()> {
        let mut file = File::create(&temp)?;
        file.write_all(contents.as_ref())?;
        file.flush()?;
        file.sync_all()?;
        drop(file);

        replace_existing(&temp, path)
    })();

    if persisted.is_err() {
        // Best-effort cleanup; the original error is what the caller sees.
        let _ = fs::remove_file(&temp);
    }
    persisted
}

/// Replaces the destination without deleting it first.
#[cfg(not(windows))]
fn replace_existing(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_existing(source: &Path, destination: &Path) -> io::Result<()> {
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_w = to_wide_path(source);
    let destination_w = to_wide_path(destination);

    // SAFETY: `MoveFileExW` reads the two null-terminated wide strings and
    // returns nonzero on success. The flags request an atomic replace of an
    // existing destination and a write-through to disk. Both pointers are
    // valid for the duration of the call (owned by the `Vec<u16>` wrappers).
    let ok = unsafe {
        MoveFileExW(
            source_w.as_ptr(),
            destination_w.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if ok != 0 {
        Ok(())
    } else {
        // SAFETY: `GetLastError` is thread-local and safe to call after a
        // failed Win32 call; it returns the error code for the last call.
        let code = unsafe { GetLastError() };
        let raw = io::Error::from_raw_os_error(code as i32);
        Err(raw)
    }
}

/// Encodes a path as null-terminated UTF-16 for Win32.
#[cfg(windows)]
fn to_wide_path(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    wide
}

#[cfg(test)]
mod tests {
    use super::write_file_atomically;
    use crate::tests::make_temp_test_dir;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        make_temp_test_dir(name, "atomic", false)
    }

    /// Existing contents survive until the synced replacement is ready.
    #[test]
    fn replaces_existing_destination_and_leaves_no_temp() {
        let dir = temp_dir("replace-existing");
        let path = dir.join("note.md");
        fs::write(&path, "old").expect("the previous contents are written");

        write_file_atomically(&path, "new").expect("the atomic write succeeds");

        assert_eq!(
            fs::read_to_string(&path).expect("the note is readable"),
            "new"
        );
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .expect("the folder is readable")
            .map(|entry| entry.expect("the entry is readable").file_name())
            .collect();
        assert_eq!(leftovers.as_slice(), [std::ffi::OsString::from("note.md")]);

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }

    /// Replacement also creates an absent destination.
    #[test]
    fn writes_to_a_path_with_no_existing_destination() {
        let dir = temp_dir("replace-absent");
        let path = dir.join("fresh.md");

        write_file_atomically(&path, b"first").expect("the atomic write succeeds");

        assert_eq!(fs::read(&path).expect("the file is readable"), b"first");
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .expect("the folder is readable")
            .map(|entry| entry.expect("the entry is readable").file_name())
            .collect();
        assert_eq!(leftovers.as_slice(), [std::ffi::OsString::from("fresh.md")]);

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }

    /// A directory destination makes replacement fail on every platform,
    /// exercising temp cleanup.
    #[test]
    fn cleans_up_the_temp_file_when_the_replace_fails() {
        let dir = temp_dir("replace-fail");
        // Directories cannot be replaced by files.
        let path = dir.join("note.md");
        fs::create_dir_all(&path).expect("the destination directory is created");

        let result = write_file_atomically(&path, b"new");

        assert!(result.is_err(), "the atomic write fails as expected");
        // Only the destination directory remains.
        let strays: Vec<_> = fs::read_dir(&dir)
            .expect("the folder is readable")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name != "note.md")
            .collect();
        assert!(strays.is_empty(), "the failed write left {strays:?} behind");

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }

    /// First writes create missing parent directories.
    #[test]
    fn creates_missing_parent_directories() {
        let dir = temp_dir("replace-mkdir");
        let path = dir.join("nested").join("deep").join("note.md");

        write_file_atomically(&path, b"layered").expect("the atomic write succeeds");

        assert_eq!(fs::read(&path).expect("the note is readable"), b"layered");

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }
}
