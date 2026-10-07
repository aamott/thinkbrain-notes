//! Binary media reads for the audio/video viewers.
//!
//! WebKitGTK's GStreamer backend cannot load `<audio>`/`<video>` from the
//! `asset://` custom protocol even though `<img>` works, and Android's webview
//! mishandles range requests on it (tauri-apps/tauri#3725, #8654, #12019). So
//! rather than fixing one webview, the player pulls the whole file over IPC
//! and plays it from a `blob:` object URL — one code path on every platform.
//!
//! Returning `tauri::ipc::Response` sends the bytes raw: the renderer's
//! `invoke` resolves with an `ArrayBuffer`, not a JSON array of numbers that
//! would cost a copy per byte through the serializer.

use crate::commands::workspace::{resolve_workspace_entry_path, resolve_workspace_root};
use crate::error::{NativeError, failed};
use std::fs;

/// Largest file the player will pull into the webview over IPC.
///
/// There is no streaming here: the whole file lands in renderer memory as an
/// `ArrayBuffer` plus a `Blob` wrapping it, so a bound has to exist. 256 MiB
/// is far past any audio note or clip a vault should carry.
pub const MAX_MEDIA_BYTES: u64 = 256 * 1024 * 1024;

#[tauri::command]
pub fn read_media_file(
    root_path: String,
    relative_path: String,
) -> Result<tauri::ipc::Response, NativeError> {
    read_media_file_bytes(&root_path, &relative_path, MAX_MEDIA_BYTES)
        .map(tauri::ipc::Response::new)
}

/// The command body, split out so tests can drive it without an `AppHandle`
/// and shrink the cap instead of writing a quarter-gigabyte fixture.
pub fn read_media_file_bytes(
    root_path: &str,
    relative_path: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    // Refuses `..`, absolute paths, and symlinks that resolve outside `root`.
    let file_path = resolve_workspace_entry_path(&root, relative_path)?;

    // Check the size before reading so an oversize file is refused cheaply
    // rather than pulled into memory first.
    let metadata = fs::metadata(&file_path).map_err(|error| {
        failed(
            "workspace.metadata_failed",
            "Failed to read workspace entry metadata.",
            error,
        )
    })?;
    if metadata.len() > max_bytes {
        return Err(NativeError::new(
            "workspace.media_too_large",
            "This file is too large to play here.",
        ));
    }

    fs::read(&file_path)
        .map_err(|error| failed("workspace.read_failed", "Failed to read the file.", error))
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::tests::make_temp_test_dir;

    #[test]
    fn reads_a_media_file_as_raw_bytes() {
        let dir = make_temp_test_dir("read", "media", true);
        fs::write(dir.join("clip.mp3"), b"\x00\x01\x02not-really-mp3").expect("file is written");

        let bytes = read_media_file_bytes(&dir.to_string_lossy(), "clip.mp3", MAX_MEDIA_BYTES)
            .expect("file is read");

        assert_eq!(bytes, b"\x00\x01\x02not-really-mp3");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn refuses_a_parent_directory_escape() {
        let dir = make_temp_test_dir("escape", "media", true);
        let outside = dir.parent().expect("temp root").join("outside.mp3");
        fs::write(&outside, b"secret").expect("outside file is written");

        let error =
            read_media_file_bytes(&dir.to_string_lossy(), "../outside.mp3", MAX_MEDIA_BYTES)
                .expect_err("escape is rejected");

        assert_eq!(error.code, "workspace.invalid_path");
        fs::remove_file(outside).ok();
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn refuses_a_file_larger_than_the_cap() {
        let dir = make_temp_test_dir("oversize", "media", true);
        fs::write(dir.join("big.mp4"), vec![0u8; 64]).expect("file is written");

        // A tiny cap stands in for MAX_MEDIA_BYTES so the fixture stays small.
        let error = read_media_file_bytes(&dir.to_string_lossy(), "big.mp4", 8)
            .expect_err("oversize file is rejected");

        assert_eq!(error.code, "workspace.media_too_large");
        assert_eq!(error.message, "This file is too large to play here.");
        fs::remove_dir_all(dir).expect("cleanup");
    }
}
