//! Picked Files Command Module
//!
//! Reads and writes UTF-8 text at paths the user chooses in a native open or
//! save dialog. The dialog runs inside the command itself, so the renderer
//! never supplies a path: renderer code — including same-realm extensions —
//! can ask for a file, but it cannot point the command at an arbitrary one.
//! That is the boundary the plugin-fs `read_text_file` / `write_text_file`
//! permissions could not express, and why those unscoped `fs:allow-*` grants
//! are no longer needed.
//!
//! IO goes through `tauri_plugin_fs::Fs`, the plugin's own Rust API, so one
//! code path serves desktop paths, iOS `file://` URLs, and Android
//! `content://` document URIs — the plugin resolves each to a file
//! descriptor the same way its renderer commands would.

use crate::error::{NativeError, failed};
use serde::Serialize;
use std::io::Write;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_fs::{FsExt, OpenOptions};

/// One file the user chose, and what was in it.
///
/// The path comes back alongside the contents because an import records where
/// its document came from, not just what it said.
#[derive(Serialize)]
pub struct PickedTextFile {
    path: String,
    contents: String,
}

/// Shows a native open-file dialog and reads the chosen file as UTF-8 text.
///
/// `extensions`, when given, filters the picker to matching file types; the
/// dialog title doubles as the filter label (the JS picker's convention).
///
/// Returns `None` when the user dismisses the dialog. Errors cover real
/// failures only: the file disappeared, is unreadable, or is not UTF-8.
#[tauri::command]
pub async fn pick_and_read_text_file(
    window: tauri::Window,
    title: String,
    extensions: Option<Vec<String>>,
) -> Result<Option<PickedTextFile>, NativeError> {
    let builder = window.dialog().file().set_title(&title);
    // A parent handle for the open dialog is only usable on Windows and
    // macOS — the same condition the dialog plugin's own `open` command uses.
    #[cfg(any(windows, target_os = "macos"))]
    let builder = builder.set_parent(&window);
    let builder = match extensions {
        Some(extensions) => {
            let name =
                title.trim_end_matches(|c: char| c.is_whitespace() || c.is_ascii_punctuation());
            let extensions: Vec<&str> = extensions.iter().map(String::as_str).collect();
            builder.add_filter(name, &extensions)
        }
        None => builder,
    };

    let Some(file) = builder.blocking_pick_file() else {
        return Ok(None);
    };

    let path = file.clone().simplified().to_string();
    let contents = window.fs().read_to_string(file.clone()).map_err(|error| {
        failed(
            "picked_files.read_failed",
            "The picked file could not be read.",
            error,
        )
    })?;
    release_security_scoped_resource(&window, &file);

    Ok(Some(PickedTextFile { path, contents }))
}

/// Shows a native save-file dialog and writes `contents` to the chosen path.
///
/// Returns `false` when the user dismisses the dialog. Errors cover real
/// failures only: the path is unwritable, the disk is full, and so on.
#[tauri::command]
pub async fn save_and_write_text_file(
    window: tauri::Window,
    title: String,
    default_name: String,
    contents: String,
) -> Result<bool, NativeError> {
    let builder = window
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(default_name);
    #[cfg(desktop)]
    let builder = builder.set_parent(&window);

    let Some(file) = builder.blocking_save_file() else {
        return Ok(false);
    };

    // The flags plugin-fs' `write_text_file` used: create-or-truncate.
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    let mut handle = window.fs().open(file.clone(), options).map_err(|error| {
        failed(
            "picked_files.write_failed",
            "The chosen file could not be written.",
            error,
        )
    })?;
    let write_result = handle.write_all(contents.as_bytes());
    release_security_scoped_resource(&window, &file);
    write_result.map_err(|error| {
        failed(
            "picked_files.write_failed",
            "The chosen file could not be written.",
            error,
        )
    })?;

    Ok(true)
}

/// The iOS picker hands out `file://` URLs backed by security-scoped
/// resources; `Fs::open` starts access on them and nothing ends it on its
/// own. Other platforms grant nothing that needs releasing.
fn release_security_scoped_resource(window: &tauri::Window, file: &FilePath) {
    #[cfg(target_os = "ios")]
    {
        let _ = window
            .fs()
            .stop_accessing_security_scoped_resource(file.clone());
    }
    #[cfg(not(target_os = "ios"))]
    let _ = (window, file);
}
