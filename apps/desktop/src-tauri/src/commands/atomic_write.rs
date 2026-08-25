//! Atomic file replacement.
//!
//! `write_file_atomically` writes `contents` to a sibling temp file and then
//! renames it over `path`. `rename` is atomic on the same filesystem on Unix,
//! so a crash mid-write cannot leave a truncated destination. On Windows,
//! `std::fs::rename` refuses to replace an existing file, so the previous
//! implementation deleted the destination first — a window in which a crash,
//! antivirus lock, or rename failure left the note or settings file missing.
//!
//! This module replaces that window with a true replace-existing operation:
//! `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)` on Windows.
//! The temp file is flushed and `fsync`ed (`FlushFileBuffers` on Windows) before
//! the replace so the new bytes are on disk before the old bytes are
//! unreachable, and a failed replace deletes the temp file so nothing is left
//! behind.
//!
//! Temp names start with `.` and end in `.tmp`, matching the names Auto Sync
//! already refuses to record.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Replaces `path` with `contents` via a sibling `.tmp` and an atomic rename.
///
/// The destination is never explicitly removed before the replace: on Windows
/// the replace is performed with
/// `MoveFileExW(MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)`, and on
/// Unix `std::fs::rename` already replaces an existing file atomically. The
/// temp file is flushed and fsynced to disk before the replace, and is deleted
/// if the replace fails.
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

    // Write, flush, and fsync the temp before renaming it over the
    // destination. A crash after a successful rename but before the temp's
    // bytes hit disk would leave the new file empty on some filesystems.
    // `sync_all` is `fsync` on Unix and `FlushFileBuffers` on Windows, so the
    // new bytes are on disk before the old bytes are unreachable on both
    // platforms. On Windows the rename itself is additionally write-through
    // (see `replace_existing`).
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

/// Replaces `destination` with `source` without deleting `destination` first.
///
/// On Unix, `std::fs::rename` already replaces an existing destination
/// atomically on the same filesystem. On Windows, `std::fs::rename` fails if
/// the destination exists, so `MoveFileExW` is used with
/// `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH` to perform a true
/// replace-existing that also flushes the rename to disk before returning.
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

/// Encodes a `Path` as a null-terminated UTF-16 wide string for Win32 APIs.
///
/// `Path` strings on Windows are arbitrary `OsStr` (WTF-8-ish), and the Win32
/// `*W` functions take UTF-16. `OsStrExt::encode_wide` would be the canonical
/// path, but `std::os::windows::ffi::OsStrExt` is only available on Windows,
/// which is exactly where this helper is used.
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
    use std::fs;

    /// Creates a unique temp directory for a test and returns its path.
    fn temp_dir(name: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time is after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("thinkbrain-atomic-{name}-{unique}"));
        fs::create_dir_all(&path).expect("temp directory is created");
        path
    }

    /// Replaces an existing destination with new contents and leaves no temp
    /// file behind. The previous contents must survive until the new ones are
    /// fully on disk — the core invariant of the helper.
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

    /// Creates a destination that did not exist. The replace-existing path
    /// must still succeed when there is nothing to replace.
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

    /// A failed replace must not leave the temp file behind. The temp is
    /// written into the real parent, then the rename is made to fail by
    /// pointing the destination at an existing directory — neither
    /// `std::fs::rename` (Unix) nor `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`
    /// (Windows) replaces a directory — exercising the failure-cleanup branch.
    #[test]
    fn cleans_up_the_temp_file_when_the_replace_fails() {
        let dir = temp_dir("replace-fail");
        // The destination is a directory, so the replace-existing operation
        // refuses to overwrite it on both platforms.
        let path = dir.join("note.md");
        fs::create_dir_all(&path).expect("the destination directory is created");

        let result = write_file_atomically(&path, b"new");

        assert!(result.is_err(), "the atomic write fails as expected");
        // The temp file must have been removed even though the replace failed.
        // Only the destination directory should remain.
        let strays: Vec<_> = fs::read_dir(&dir)
            .expect("the folder is readable")
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name != "note.md")
            .collect();
        assert!(strays.is_empty(), "the failed write left {strays:?} behind");

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }

    /// The helper creates missing parent directories for the destination, so a
    /// first write into a nested path succeeds and lands the file in place.
    #[test]
    fn creates_missing_parent_directories() {
        let dir = temp_dir("replace-mkdir");
        let path = dir.join("nested").join("deep").join("note.md");

        write_file_atomically(&path, b"layered").expect("the atomic write succeeds");

        assert_eq!(fs::read(&path).expect("the note is readable"), b"layered");

        fs::remove_dir_all(&dir).expect("temp directory is cleaned up");
    }
}
