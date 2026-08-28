//! Generic text file read/write commands for non-Markdown files (code, config, etc.).
//!
//! Unlike `markdown.rs`, these commands accept any file extension — the only
//! constraint is that the file must be valid UTF-8 text. Path containment is
//! enforced via `resolve_workspace_entry_path`.

use crate::commands::watcher::record_self_write;
use crate::commands::workspace::{
    acquire_workspace_mutation_lock, entry_metadata, normalize_relative_path,
    resolve_workspace_entry_path, write_file_atomically,
};
use crate::error::{NativeError, failed};
use serde::Serialize;
use std::fs;
use tauri::Manager;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextFileContents {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextFileEntry {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<u64>,
}

#[tauri::command]
pub fn read_text_file(
    root_path: String,
    relative_path: String,
) -> Result<TextFileContents, NativeError> {
    let root = crate::commands::workspace::resolve_workspace_root(&root_path)?;
    let file_path = resolve_workspace_entry_path(&root, &relative_path)?;

    let bytes = fs::read(&file_path)
        .map_err(|error| failed("workspace.read_failed", "Failed to read the file.", error))?;

    let contents = String::from_utf8(bytes).map_err(|error| {
        NativeError::with_details(
            "workspace.file_not_text",
            "This file is not readable as text. It may be a binary file.",
            error,
        )
    })?;

    Ok(TextFileContents {
        relative_path: normalize_relative_path(&relative_path)?,
        contents,
    })
}

#[tauri::command]
pub fn write_text_file(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: String,
    expected: Option<String>,
) -> Result<TextFileEntry, NativeError> {
    let app_data = app.path().app_data_dir().ok();
    let root = crate::commands::workspace::resolve_workspace_root(&root_path)?;
    let file_path = resolve_workspace_entry_path(&root, &relative_path)?;

    let _mutation_lock = acquire_workspace_mutation_lock();

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot write a file that does not exist.",
        ));
    }

    if let Some(expected) = expected.as_deref() {
        check_text_write_precondition(&file_path, expected)?;
    }

    // Best-effort backup, same pattern as markdown.rs.
    if let Some(app_data) = app_data {
        if let Ok(previous) = fs::read(&file_path) {
            if let Err(error) =
                super::backup::keep_previous_version(&app_data, &root, &relative_path, &previous)
            {
                eprintln!(
                    "[backup] could not keep the previous version of {relative_path}: {error}"
                );
            }
        }
    }

    record_self_write(&file_path);
    write_file_atomically(&file_path, contents)
        .map_err(|error| failed("workspace.write_failed", "Failed to write the file.", error))?;

    let metadata = entry_metadata(&root, &file_path)?;
    Ok(TextFileEntry {
        file_name: metadata.file_name,
        parent_path: metadata.parent_path,
        relative_path: metadata.relative_path,
        byte_size: metadata.byte_size,
        updated_at: metadata.updated_at,
    })
}

fn check_text_write_precondition(
    file_path: &std::path::Path,
    expected: &str,
) -> Result<(), NativeError> {
    if fs::read_to_string(file_path).ok().as_deref() == Some(expected) {
        return Ok(());
    }
    Err(NativeError::new(
        "workspace.file_conflict",
        "The file changed on disk while it was being edited.",
    ))
}
