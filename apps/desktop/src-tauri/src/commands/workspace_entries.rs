//! Workspace tree and explorer CRUD.
//!
//! Collects all entry types, preserves empty folders, and records create,
//! rename, and delete effects for the watcher and search index.

use crate::commands::markdown::is_markdown_path;
use crate::commands::watcher::record_self_write;
use crate::error::{NativeError, failed};
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::Path;

use super::workspace_paths::{
    IGNORED_FOLDERS, MAX_WORKSPACE_ENTRIES, acquire_workspace_mutation_lock, ensure_parent_dir,
    entry_metadata, is_hidden_name, remove_search_index_entry, resolve_workspace_entry_path,
    resolve_workspace_root,
};

/// A single file-manager entry: a folder or a file of any type.
///
/// Unlike `MarkdownFileEntry`, this includes directories (so empty folders show)
/// and non-Markdown files, letting the explorer behave like a normal file tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceEntry {
    pub relative_path: String,
    pub name: String,
    pub parent_path: String,
    /// Either "directory" or "file".
    pub kind: String,
    pub is_markdown: bool,
    pub byte_size: u64,
    pub updated_at: Option<u64>,
}

#[tauri::command]
pub fn list_workspace_entries(
    root_path: String,
    include_hidden: bool,
) -> Result<Vec<WorkspaceEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let mut entries = Vec::new();
    collect_workspace_entries(&root, &root, &mut entries, include_hidden)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(entries)
}

/// Creates a workspace file of any type. Unlike `create_markdown_file`, this
/// powers the explorer's "New file" context action on arbitrary folders and
/// accepts non-Markdown extensions. Parent folders are created on demand.
#[tauri::command]
pub fn create_workspace_file(
    root_path: String,
    relative_path: String,
    contents: Option<String>,
) -> Result<WorkspaceEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let _mutation_lock = acquire_workspace_mutation_lock();
    let file_path = resolve_workspace_entry_path(&root, &relative_path)?;

    ensure_parent_dir(&file_path, "Failed to create the destination folder.")?;

    record_self_write(&file_path);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                NativeError::new(
                    "workspace.file_exists",
                    "A file already exists at that path.",
                )
            } else {
                failed(
                    "workspace.create_failed",
                    "Failed to create the file.",
                    error,
                )
            }
        })?;
    file.write_all(contents.unwrap_or_default().as_bytes())
        .map_err(|error| {
            failed(
                "workspace.create_failed",
                "Failed to create the file.",
                error,
            )
        })?;

    workspace_entry(&root, &file_path, false)
}

/// Creates a workspace folder (including any missing parents). Refuses to
/// overwrite an existing entry so the explorer can surface a clear conflict.
#[tauri::command]
pub fn create_workspace_folder(
    root_path: String,
    relative_path: String,
) -> Result<WorkspaceEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let _mutation_lock = acquire_workspace_mutation_lock();
    let folder_path = resolve_workspace_entry_path(&root, &relative_path)?;

    if folder_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A folder already exists at that path.",
        ));
    }

    fs::create_dir_all(&folder_path).map_err(|error| {
        failed(
            "workspace.create_failed",
            "Failed to create the folder.",
            error,
        )
    })?;

    workspace_entry(&root, &folder_path, true)
}

/// Renames or moves any workspace file or folder. The destination path is
/// normalized the same way as the source, and missing parent folders are
/// created so a drag-into-collapsed-folder style move succeeds. A no-op rename
/// (source == destination) succeeds without touching the filesystem.
#[tauri::command]
pub fn rename_workspace_entry(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<WorkspaceEntry, NativeError> {
    let is_markdown = is_markdown_path(Path::new(&relative_path));
    let entry = rename_workspace_entry_impl(&root_path, &relative_path, &new_relative_path)?;

    if is_markdown {
        remove_search_index_entry(app, root_path, &relative_path, "workspace");
    }

    Ok(entry)
}

fn rename_workspace_entry_impl(
    root_path: &str,
    relative_path: &str,
    new_relative_path: &str,
) -> Result<WorkspaceEntry, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let _mutation_lock = acquire_workspace_mutation_lock();
    let source_path = resolve_workspace_entry_path(&root, relative_path)?;
    let destination_path = resolve_workspace_entry_path(&root, new_relative_path)?;

    if !source_path.exists() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot rename an entry that does not exist.",
        ));
    }

    // A no-op rename returns the entry unchanged instead of failing with
    // `file_exists` (the destination is the source).
    if source_path == destination_path {
        return workspace_entry(&root, &source_path, source_path.is_dir());
    }

    if destination_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "An entry already exists at the new path.",
        ));
    }

    ensure_parent_dir(
        &destination_path,
        "Failed to create the destination folder.",
    )?;

    record_self_write(&source_path);
    record_self_write(&destination_path);
    let is_dir = source_path.is_dir();
    fs::rename(&source_path, &destination_path).map_err(|error| {
        failed(
            "workspace.rename_failed",
            "Failed to rename the workspace entry.",
            error,
        )
    })?;

    workspace_entry(&root, &destination_path, is_dir)
}

#[cfg(test)]
pub fn rename_workspace_entry_for_test(
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<WorkspaceEntry, NativeError> {
    rename_workspace_entry_impl(&root_path, &relative_path, &new_relative_path)
}

/// Deletes any workspace file or folder. Folders are removed recursively so
/// the explorer can delete a populated folder in one action. The path is
/// normalized and verified to stay inside the workspace root for literal
/// traversal (`..`, absolute paths); symlinked components inside the workspace
/// are not separately resolved, so this is safe for trusted local workspaces
/// but should not be exposed to untrusted remote roots.
#[tauri::command]
pub fn delete_workspace_entry(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: String,
) -> Result<(), NativeError> {
    let is_markdown = is_markdown_path(Path::new(&relative_path));
    delete_workspace_entry_impl(&root_path, &relative_path)?;

    if is_markdown {
        remove_search_index_entry(app, root_path, &relative_path, "workspace");
    }

    Ok(())
}

fn delete_workspace_entry_impl(root_path: &str, relative_path: &str) -> Result<(), NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let _mutation_lock = acquire_workspace_mutation_lock();
    let entry_path = resolve_workspace_entry_path(&root, relative_path)?;

    if !entry_path.exists() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot delete an entry that does not exist.",
        ));
    }

    record_self_write(&entry_path);
    let remove_result = if entry_path.is_dir() {
        fs::remove_dir_all(&entry_path)
    } else {
        fs::remove_file(&entry_path)
    };

    remove_result.map_err(|error| {
        failed(
            "workspace.delete_failed",
            "Failed to delete the workspace entry.",
            error,
        )
    })
}

#[cfg(test)]
pub fn delete_workspace_entry_for_test(
    root_path: String,
    relative_path: String,
) -> Result<(), NativeError> {
    delete_workspace_entry_impl(&root_path, &relative_path)
}

/// Recursively collects every visible folder and file under the workspace.
///
/// Hidden entries (dot-prefixed, e.g. `.git`) are skipped unless
/// `include_hidden` is set, so the tree stays clean by default and matches
/// typical file-manager defaults. Directories are emitted before their
/// contents so callers can build a complete tree, including empty folders.
pub fn collect_workspace_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<WorkspaceEntry>,
    include_hidden: bool,
) -> Result<(), NativeError> {
    if entries.len() >= MAX_WORKSPACE_ENTRIES {
        return Ok(());
    }

    let dir = fs::read_dir(current).map_err(|error| {
        failed(
            "workspace.list_failed",
            "Failed to list the workspace contents.",
            error,
        )
    })?;

    for entry in dir {
        if entries.len() >= MAX_WORKSPACE_ENTRIES {
            break;
        }

        let entry = entry.map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace entry.",
                error,
            )
        })?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if !include_hidden && is_hidden_name(&name) {
            continue;
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace entry type.",
                error,
            )
        })?;

        if file_type.is_dir() && IGNORED_FOLDERS.contains(&name.as_str()) {
            continue;
        }

        if file_type.is_dir() {
            entries.push(workspace_entry(root, &path, true)?);
            collect_workspace_entries(root, &path, entries, include_hidden)?;
        } else if file_type.is_file() {
            entries.push(workspace_entry(root, &path, false)?);
        }
    }

    Ok(())
}

/// Builds a `WorkspaceEntry` for a folder or file from filesystem metadata.
pub fn workspace_entry(
    root: &Path,
    path: &Path,
    is_dir: bool,
) -> Result<WorkspaceEntry, NativeError> {
    let metadata = entry_metadata(root, path)?;

    Ok(WorkspaceEntry {
        name: metadata.file_name,
        parent_path: metadata.parent_path,
        kind: if is_dir { "directory" } else { "file" }.to_string(),
        is_markdown: !is_dir && is_markdown_path(path),
        byte_size: if is_dir { 0 } else { metadata.byte_size },
        updated_at: metadata.updated_at,
        relative_path: metadata.relative_path,
    })
}
