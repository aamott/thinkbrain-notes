use crate::commands::watcher::record_self_write;
use crate::error::NativeError;
use serde::Serialize;
use std::path::{Path, PathBuf};

use std::fs;

const MAX_MARKDOWN_DEPTH: usize = 20;

use crate::commands::workspace::{
    acquire_workspace_mutation_lock, ensure_parent_dir, entry_metadata, is_ignored_entry_name,
    normalize_relative_path, remove_search_index_entry, resolve_workspace_entry_path,
    resolve_workspace_root, MAX_WORKSPACE_ENTRIES,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileEntry {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileContents {
    pub relative_path: String,
    pub contents: String,
}

#[tauri::command]
pub fn list_markdown_files(root_path: String) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    list_markdown_file_entries(&root)
}

#[tauri::command]
pub fn read_markdown_file(
    root_path: String,
    relative_path: String,
) -> Result<MarkdownFileContents, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;
    let contents = fs::read_to_string(&file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.read_failed",
            "Failed to read the Markdown file.",
            error,
        )
    })?;

    Ok(MarkdownFileContents {
        relative_path: normalize_relative_path(&relative_path)?,
        contents,
    })
}

#[tauri::command]
pub fn write_markdown_file(
    _app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: String,
    expected: Option<String>,
) -> Result<MarkdownFileEntry, NativeError> {
    write_markdown_document(&root_path, &relative_path, contents, expected.as_deref())
}

/// Writes a note, optionally refusing if it is not what the caller last read.
///
/// A note has writers the app cannot see — a sync client, an editor in another
/// window, the user's own shell — and until this precondition existed a save
/// put the tab's text over whatever they had written, without anyone being
/// told. `expected` carries the text the caller computed its version from, so
/// that loss becomes a refusal the caller can put to the user.
///
/// `expected: None` means *unchecked*, which is the opposite of what `None`
/// means for the settings documents (there, an absent file is itself something
/// to expect). The difference is deliberate: a note always exists by the time
/// this runs, and callers with no read behind them — extension writes, scripted
/// edits — have nothing to expect. Leaving the check opt-in is what lets the
/// shell send one on every save without paying for an extra read.
///
/// Split from the command so it can be tested: the `AppHandle` a `#[tauri::command]`
/// takes is unavailable to a unit test, and a comparison tested on its own would
/// not show that a refused write leaves the file alone.
pub fn write_markdown_document(
    root_path: &str,
    relative_path: &str,
    contents: String,
    expected: Option<&str>,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let file_path = resolve_markdown_file_path(&root, relative_path)?;

    // Held across the read, the check and the write. A check that another
    // in-process writer could land inside would only narrow the window it was
    // added to close; this is the lock the entry mutations already take, so a
    // rename or delete cannot slip in either.
    let _mutation_lock = acquire_workspace_mutation_lock();

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot write a Markdown file that does not exist.",
        ));
    }

    if let Some(expected) = expected {
        check_note_write_precondition(&file_path, expected)?;
    }

    record_self_write(&file_path);
    fs::write(&file_path, contents).map_err(|error| {
        NativeError::with_details(
            "workspace.write_failed",
            "Failed to write the Markdown file.",
            error,
        )
    })?;

    markdown_file_entry(&root, &file_path)
}

/// Refuses a write computed from text the file no longer holds.
///
/// An unreadable file counts as a mismatch rather than an error of its own: the
/// caller's answer is the same either way — do not overwrite — and reporting it
/// as a read failure would send them down a path that cannot help.
fn check_note_write_precondition(file_path: &Path, expected: &str) -> Result<(), NativeError> {
    if fs::read_to_string(file_path).ok().as_deref() == Some(expected) {
        return Ok(());
    }

    Err(NativeError::new(
        "workspace.note_conflict",
        "The note changed on disk while it was being edited.",
    ))
}

#[tauri::command]
pub fn create_markdown_file(
    _app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    contents: Option<String>,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if file_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A Markdown file already exists at that path.",
        ));
    }

    ensure_parent_dir(&file_path, "Failed to create the note folder.")?;

    record_self_write(&file_path);
    fs::write(&file_path, contents.unwrap_or_default()).map_err(|error| {
        NativeError::with_details(
            "workspace.create_failed",
            "Failed to create the Markdown file.",
            error,
        )
    })?;

    markdown_file_entry(&root, &file_path)
}

#[tauri::command]
pub fn rename_markdown_file(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;
    let new_file_path = resolve_markdown_file_path(&root, &new_relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot rename a Markdown file that does not exist.",
        ));
    }

    if new_file_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A Markdown file already exists at the new path.",
        ));
    }

    ensure_parent_dir(&new_file_path, "Failed to create the destination folder.")?;

    record_self_write(&file_path);
    record_self_write(&new_file_path);
    fs::rename(&file_path, &new_file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.rename_failed",
            "Failed to rename the Markdown file.",
            error,
        )
    })?;

    remove_search_index_entry(app, root_path, &relative_path, "markdown");
    markdown_file_entry(&root, &new_file_path)
}

#[tauri::command]
pub fn delete_markdown_file(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot delete a Markdown file that does not exist.",
        ));
    }

    record_self_write(&file_path);
    fs::remove_file(&file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.delete_failed",
            "Failed to delete the Markdown file.",
            error,
        )
    })?;

    remove_search_index_entry(app, root_path, &relative_path, "markdown");

    Ok(())
}

pub fn resolve_markdown_file_path(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, NativeError> {
    let normalized = normalize_relative_path(relative_path)?;
    let path = root.join(normalized);

    if !is_markdown_path(&path) {
        return Err(NativeError::new(
            "workspace.not_markdown",
            "Only Markdown files can be managed by this command.",
        ));
    }

    // `normalize_relative_path` rejects `..`, but it cannot see symlinks: a
    // link inside the vault still resolves outside it, which would let these
    // commands read, overwrite or delete arbitrary files. Defer to the entry
    // resolver, which canonicalizes and verifies containment for both existing
    // targets and not-yet-created ones.
    resolve_workspace_entry_path(root, relative_path)
}

pub fn list_markdown_file_entries(root: &Path) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let mut files = Vec::new();
    collect_markdown_file_entries(root, root, &mut files, 0)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(files)
}

pub fn collect_markdown_file_entries(
    root: &Path,
    current: &Path,
    files: &mut Vec<MarkdownFileEntry>,
    depth: usize,
) -> Result<(), NativeError> {
    if depth > MAX_MARKDOWN_DEPTH || files.len() > MAX_WORKSPACE_ENTRIES {
        return Ok(());
    }

    let entries = fs::read_dir(current).map_err(|error| {
        NativeError::with_details(
            "workspace.list_failed",
            "Failed to list Markdown files in the workspace.",
            error,
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file.",
                error,
            )
        })?;
        let path = entry.path();
        
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored_entry_name(&name) {
            continue;
        }

        let file_type = entry.file_type().map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file type.",
                error,
            )
        })?;

        if file_type.is_dir() {
            collect_markdown_file_entries(root, &path, files, depth + 1)?;
        } else if file_type.is_file() && is_markdown_path(&path) {
            files.push(markdown_file_entry(root, &path)?);
        }
    }

    Ok(())
}

pub fn markdown_file_entry(
    root: &Path,
    file_path: &Path,
) -> Result<MarkdownFileEntry, NativeError> {
    let metadata = entry_metadata(root, file_path)?;

    Ok(MarkdownFileEntry {
        file_name: metadata.file_name,
        parent_path: metadata.parent_path,
        relative_path: metadata.relative_path,
        byte_size: metadata.byte_size,
        updated_at: metadata.updated_at,
    })
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}
