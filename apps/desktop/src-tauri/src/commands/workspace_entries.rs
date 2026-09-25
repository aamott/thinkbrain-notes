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
    entry_metadata, is_hidden_name, normalize_relative_path, remove_search_index_entry,
    resolve_workspace_entry_path, resolve_workspace_root,
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

/// One file's path change caused by a rename or move. Folders produce one
/// entry per descendant file so the renderer can retarget open tabs and drop
/// stale index entries for every moved path, not just the renamed root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspacePathMove {
    pub old_relative_path: String,
    pub new_relative_path: String,
    /// Whether the OLD path is Markdown — drives stale search-index removal.
    pub was_markdown: bool,
    /// Whether the NEW path is Markdown — drives the renderer's event choice.
    pub is_markdown: bool,
}

/// The renamed entry plus every file path it moved. `file_moves` is empty for
/// a no-op rename, holds one item for a file, and one per descendant file for
/// a folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceRenameResult {
    pub entry: WorkspaceEntry,
    pub file_moves: Vec<WorkspacePathMove>,
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
) -> Result<WorkspaceRenameResult, NativeError> {
    let result = rename_workspace_entry_impl(&root_path, &relative_path, &new_relative_path)?;

    // Every moved Markdown file leaves a stale document in the search index
    // under its old path; the rebuilt index picks up the new paths. Only the
    // OLD spelling matters here — a rename that turns `note.md` into
    // `note.txt` still has an old index entry to drop.
    for moved in &result.file_moves {
        if moved.was_markdown {
            remove_search_index_entry(
                app.clone(),
                root_path.clone(),
                &moved.old_relative_path,
                "workspace",
            );
        }
    }

    Ok(result)
}

fn rename_workspace_entry_impl(
    root_path: &str,
    relative_path: &str,
    new_relative_path: &str,
) -> Result<WorkspaceRenameResult, NativeError> {
    let root = resolve_workspace_root(root_path)?;
    let _mutation_lock = acquire_workspace_mutation_lock();
    let source_relative = normalize_relative_path(relative_path)?;
    let destination_relative = normalize_relative_path(new_relative_path)?;
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
        return Ok(WorkspaceRenameResult {
            entry: workspace_entry(&root, &source_path, source_path.is_dir())?,
            file_moves: Vec::new(),
        });
    }

    if destination_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "An entry already exists at the new path.",
        ));
    }

    let is_dir = source_path.is_dir();
    // Moving a folder into itself or a subfolder has no answer the filesystem
    // can produce; `starts_with` is component-aware so `a` does not match `ab`.
    if is_dir && destination_path.starts_with(&source_path) {
        return Err(NativeError::new(
            "workspace.invalid_move",
            "A folder cannot be moved into itself or one of its subfolders.",
        ));
    }

    // Descendant paths are enumerated before the move while the source still
    // exists. Hidden files are included; ignored folders keep their usual
    // collection behavior, so files inside them are not listed here.
    let mut file_moves = Vec::new();
    if is_dir {
        let mut descendants = Vec::new();
        collect_moved_files(&root, &source_path, &mut descendants)?;
        let source_prefix = format!("{source_relative}/");
        let destination_prefix = format!("{destination_relative}/");
        for descendant in descendants {
            let Some(suffix) = descendant.relative_path.strip_prefix(&source_prefix) else {
                continue;
            };
            let new_path = format!("{destination_prefix}{suffix}");
            file_moves.push(WorkspacePathMove {
                old_relative_path: descendant.relative_path.clone(),
                new_relative_path: new_path.clone(),
                was_markdown: descendant.is_markdown,
                is_markdown: is_markdown_path(Path::new(&new_path)),
            });
        }
    } else {
        file_moves.push(WorkspacePathMove {
            old_relative_path: source_relative.clone(),
            new_relative_path: destination_relative.clone(),
            was_markdown: is_markdown_path(Path::new(&source_relative)),
            is_markdown: is_markdown_path(Path::new(&destination_relative)),
        });
    }

    ensure_parent_dir(
        &destination_path,
        "Failed to create the destination folder.",
    )?;

    record_self_write(&source_path);
    record_self_write(&destination_path);
    fs::rename(&source_path, &destination_path).map_err(|error| {
        failed(
            "workspace.rename_failed",
            "Failed to rename the workspace entry.",
            error,
        )
    })?;

    Ok(WorkspaceRenameResult {
        entry: workspace_entry(&root, &destination_path, is_dir)?,
        file_moves,
    })
}

#[cfg(test)]
pub fn rename_workspace_entry_for_test(
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<WorkspaceRenameResult, NativeError> {
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

/// Collects every regular descendant file of `dir` for a move mapping.
///
/// Unlike `collect_workspace_entries` this may not silently truncate: a folder
/// move needs one entry per file it carries, so reaching the workspace listing
/// ceiling fails loudly instead of reporting a partial mapping. Hidden entries
/// are included and ignored folders are skipped, matching the tree's own
/// collection rules.
pub(crate) fn collect_moved_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<WorkspaceEntry>,
) -> Result<(), NativeError> {
    if out.len() >= MAX_WORKSPACE_ENTRIES {
        return Err(NativeError::new(
            "workspace.too_many_entries",
            "That folder contains too many files to move.",
        ));
    }

    let reader = fs::read_dir(dir).map_err(|error| {
        failed(
            "workspace.list_failed",
            "Failed to list the workspace contents.",
            error,
        )
    })?;

    for entry in reader {
        if out.len() >= MAX_WORKSPACE_ENTRIES {
            return Err(NativeError::new(
                "workspace.too_many_entries",
                "That folder contains too many files to move.",
            ));
        }
        let entry = entry.map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace entry.",
                error,
            )
        })?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            failed(
                "workspace.list_failed",
                "Failed to inspect a workspace entry type.",
                error,
            )
        })?;

        if file_type.is_dir() {
            if IGNORED_FOLDERS.contains(&name.as_str()) {
                continue;
            }
            collect_moved_files(root, &path, out)?;
        } else if file_type.is_file() {
            out.push(workspace_entry(root, &path, false)?);
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
