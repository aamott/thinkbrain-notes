use crate::error::NativeError;
use serde::Serialize;
use std::path::{Path, PathBuf};

use std::fs;
use std::time::UNIX_EPOCH;

use crate::commands::workspace::{
    normalize_relative_path, resolve_workspace_entry_path, resolve_workspace_root,
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
            error.to_string(),
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
) -> Result<MarkdownFileEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot write a Markdown file that does not exist.",
        ));
    }

    fs::write(&file_path, contents).map_err(|error| {
        NativeError::with_details(
            "workspace.write_failed",
            "Failed to write the Markdown file.",
            error.to_string(),
        )
    })?;

    markdown_file_entry(&root, &file_path)
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

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the note folder.",
                error.to_string(),
            )
        })?;
    }

    fs::write(&file_path, contents.unwrap_or_default()).map_err(|error| {
        NativeError::with_details(
            "workspace.create_failed",
            "Failed to create the Markdown file.",
            error.to_string(),
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

    if let Some(parent) = new_file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the destination folder.",
                error.to_string(),
            )
        })?;
    }

    fs::rename(&file_path, &new_file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.rename_failed",
            "Failed to rename the Markdown file.",
            error.to_string(),
        )
    })?;

    let index_path = relative_path.clone();
    if let Err(error) = crate::commands::search::remove_index_document(app, root_path, index_path) {
        eprintln!("[markdown] failed to remove search index for {relative_path}: {error}");
    }

    markdown_file_entry(&root, &new_file_path)
}


#[tauri::command]
pub fn delete_markdown_file(app: tauri::AppHandle, root_path: String, relative_path: String) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let file_path = resolve_markdown_file_path(&root, &relative_path)?;

    if !file_path.is_file() {
        return Err(NativeError::new(
            "workspace.file_missing",
            "Cannot delete a Markdown file that does not exist.",
        ));
    }

    fs::remove_file(&file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.delete_failed",
            "Failed to delete the Markdown file.",
            error.to_string(),
        )
    })?;

    let index_path = relative_path.clone();
    if let Err(error) = crate::commands::search::remove_index_document(app, root_path, index_path) {
        eprintln!("[markdown] failed to remove search index for {relative_path}: {error}");
    }

    Ok(())
}


pub fn resolve_markdown_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
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
    if depth > 20 || files.len() > 10_000 {
        return Ok(());
    }

    let entries = fs::read_dir(current).map_err(|error| {
        NativeError::with_details(
            "workspace.list_failed",
            "Failed to list Markdown files in the workspace.",
            error.to_string(),
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file.",
                error.to_string(),
            )
        })?;
        let path = entry.path();
        
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || ["node_modules", "target", "dist", "vendor"].contains(&name.as_str()) {
            continue;
        }

        let file_type = entry.file_type().map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file type.",
                error.to_string(),
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


pub fn markdown_file_entry(root: &Path, file_path: &Path) -> Result<MarkdownFileEntry, NativeError> {
    let relative_path = file_path
        .strip_prefix(root)
        .map_err(|error| {
            NativeError::with_details(
                "workspace.invalid_path",
                "File path is outside the workspace.",
                error.to_string(),
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");
    let metadata = fs::metadata(file_path).map_err(|error| {
        NativeError::with_details(
            "workspace.metadata_failed",
            "Failed to read Markdown file metadata.",
            error.to_string(),
        )
    })?;
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(MarkdownFileEntry {
        file_name: file_path
            .file_name()
            .map(|file_name| file_name.to_string_lossy().to_string())
            .unwrap_or_else(|| relative_path.clone()),
        parent_path: Path::new(&relative_path)
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default(),
        relative_path,
        byte_size: metadata.len(),
        updated_at,
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


