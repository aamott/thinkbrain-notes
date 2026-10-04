//! System-clipboard file references.
//!
//! `navigator.clipboard.writeText` covers text copies in the renderer, but
//! putting a *file* on the clipboard — so a system file manager can paste a
//! copy of it — is an OS clipboard format: `CF_HDROP` on Windows,
//! `NSFilenamesPboardType` on macOS, and `text/uri-list` +
//! `x-special/gnome-copied-files` on Linux. `arboard` covers the first two;
//! its `file_list` on Linux only writes `text/uri-list`, which GTK file
//! managers ignore for paste — so Linux goes through
//! [`crate::linux_clipboard`], which offers both formats.

#[cfg(any(target_os = "windows", target_os = "macos"))]
use std::sync::{Mutex, OnceLock};

use crate::NativeError;
#[cfg(any(target_os = "windows", target_os = "macos"))]
use crate::error::{failed, lock_or_recover};

/// A long-lived clipboard handle.
///
/// The `arboard` clipboard is kept for the life of the app so clipboard
/// ownership survives past the end of the command that set it.
#[cfg(any(target_os = "windows", target_os = "macos"))]
static CLIPBOARD: OnceLock<Result<Mutex<arboard::Clipboard>, String>> = OnceLock::new();

/// Places `paths` on the system clipboard as file references, so paste in a
/// file manager (Explorer, Finder, Nautilus…) copies the files themselves.
///
/// Desktop-only: there is no file clipboard on Android, so the mobile build
/// stubs the command with `clipboard.unavailable` and the frontend hides the
/// menu item via `PlatformCapabilities::can_copy_files_to_clipboard`.
#[tauri::command]
#[cfg(all(
    unix,
    not(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "android",
        target_os = "emscripten"
    ))
))]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), NativeError> {
    crate::linux_clipboard::copy_files_to_clipboard(&paths)
}

/// Windows and macOS — `arboard::Set::file_list` writes `CF_HDROP` /
/// `NSFilenamesPboardType` natively on both.
#[tauri::command]
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), NativeError> {
    let clipboard = CLIPBOARD
        .get_or_init(|| {
            arboard::Clipboard::new()
                .map(Mutex::new)
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|error| {
            NativeError::new(
                "clipboard.unavailable",
                format!("Could not open the system clipboard: {error}"),
            )
        })?;
    let mut guard = lock_or_recover(clipboard);
    guard
        .set()
        .file_list(&paths)
        .map_err(|error| failed("clipboard.set_failed", "Could not copy the file.", error))
}

/// Mobile stub — the frontend never calls this (the capability flag hides the
/// item), but the command must exist because the invoke handler registers the
/// same list on every platform.
#[tauri::command]
#[cfg(mobile)]
pub fn copy_files_to_clipboard(_paths: Vec<String>) -> Result<(), NativeError> {
    Err(NativeError::new(
        "clipboard.unavailable",
        "File clipboard copies are not supported on this platform.",
    ))
}
