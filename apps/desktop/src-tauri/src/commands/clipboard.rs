//! System-clipboard file references.
//!
//! `navigator.clipboard.writeText` covers text copies in the renderer, but
//! putting a *file* on the clipboard — so a system file manager can paste a
//! copy of it — is an OS clipboard format: `CF_HDROP` on Windows,
//! `NSFilenamesPboardType` on macOS, and `text/uri-list` +
//! `x-special/gnome-copied-files` on Linux. `arboard` covers all three.

#[cfg(desktop)]
use std::sync::{Mutex, OnceLock};

use crate::NativeError;
#[cfg(desktop)]
use crate::error::{failed, lock_or_recover};

/// A long-lived clipboard handle.
///
/// On X11 and Wayland the *owning* process serves every paste request, so the
/// `Clipboard` must outlive the call that set it — a per-invocation clipboard
/// would carry the file list to the grave within milliseconds. `OnceLock` +
/// `Mutex` keeps the first successful handle for the life of the app.
#[cfg(desktop)]
static CLIPBOARD: OnceLock<Result<Mutex<arboard::Clipboard>, String>> = OnceLock::new();

/// Places `paths` on the system clipboard as file references, so paste in a
/// file manager (Explorer, Finder, Nautilus…) copies the files themselves.
///
/// Desktop-only: there is no file clipboard on Android, so the mobile build
/// stubs the command with `clipboard.unavailable` and the frontend hides the
/// menu item via `PlatformCapabilities::can_copy_files_to_clipboard`.
#[tauri::command]
#[cfg(desktop)]
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
