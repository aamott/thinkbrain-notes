//! Shared workspace path security and metadata.
//!
//! Rejects traversal and symlink escapes; owns the mutation lock, ignored-name
//! policy, entry metadata, stable hash, and atomic-write re-export.

use crate::error::{NativeError, failed};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub const IGNORED_FOLDERS: &[&str] = &["node_modules", "target", "dist", "vendor"];
pub(crate) const MAX_WORKSPACE_ENTRIES: usize = 10_000;

/// True for vault entries the explorer, markdown walker, and watcher all skip:
/// dotfiles plus the configured ignored-folder list. Centralized so the three
/// cannot drift.
pub fn is_ignored_entry_name(name: &str) -> bool {
    is_hidden_name(name) || IGNORED_FOLDERS.contains(&name)
}

pub static WORKSPACE_ENTRY_MUTATION_LOCK: Mutex<()> = Mutex::new(());

/// Acquires the workspace entry mutation lock, recovering from poison so a
/// panicked writer does not deadlock the app.
pub fn acquire_workspace_mutation_lock() -> std::sync::MutexGuard<'static, ()> {
    WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Creates missing parent directories for a path, mapping failures to the
/// shared `workspace.create_parent_failed` error code.
pub fn ensure_parent_dir(path: &Path, message: &str) -> Result<(), NativeError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details("workspace.create_parent_failed", message, error)
        })?;
    }
    Ok(())
}

/// Removes a document from the search index, logging failures best-effort
/// so a stale index entry never blocks a successful rename or delete.
pub fn remove_search_index_entry(
    app: tauri::AppHandle,
    root_path: String,
    relative_path: &str,
    module: &str,
) {
    if let Err(error) =
        crate::commands::search::remove_index_document(app, root_path, relative_path.to_string())
    {
        eprintln!("[{module}] failed to remove search index for {relative_path}: {error}");
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceDescriptor {
    pub root_path: String,
    pub name: String,
}

pub fn resolve_workspace_root(root_path: &str) -> Result<PathBuf, NativeError> {
    let root = PathBuf::from(root_path);

    if !root.is_absolute() {
        return Err(NativeError::new(
            "workspace.invalid_root",
            "Workspace root must be an absolute path.",
        ));
    }

    let canonical_root = root.canonicalize().map_err(|error| {
        failed(
            "workspace.open_failed",
            "Failed to open the workspace folder.",
            error,
        )
    })?;

    if !canonical_root.is_dir() {
        return Err(NativeError::new(
            "workspace.not_directory",
            "Workspace root must be a folder.",
        ));
    }

    Ok(canonical_root)
}

/// Resolves an arbitrary workspace entry path (file or folder) and validates
/// that it stays inside the workspace root. Unlike
/// [`resolve_markdown_file_path`], this accepts any extension and is used by
/// the explorer's generic file/folder context actions.
///
/// For paths that already exist on disk, the resolved path is canonicalized
/// and verified to remain inside the canonical workspace root, so symlinked
/// components cannot redirect an operation outside the workspace. For
/// not-yet-existing targets (e.g. a `create_workspace_file` destination), the
/// deepest existing ancestor is canonicalized and prefix-checked instead,
/// because `canonicalize` requires the path to exist.
pub fn resolve_workspace_entry_path(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, NativeError> {
    let normalized = normalize_relative_path(relative_path)?;
    let path = root.join(normalized);

    // For existing entries, canonicalize the full path and verify it stays
    // inside the (already canonical) workspace root.
    if path.exists() {
        let canonical = path.canonicalize().map_err(|error| {
            failed(
                "workspace.invalid_path",
                "Failed to resolve the workspace entry.",
                error,
            )
        })?;
        if !canonical.starts_with(root) {
            return Err(NativeError::new(
                "workspace.invalid_path",
                "File path must stay inside the workspace.",
            ));
        }
        return Ok(canonical);
    }

    // For not-yet-existing targets, canonicalize the deepest existing ancestor
    // and ensure that ancestor is inside the workspace root. The remaining
    // (non-existent) tail is appended literally; `fs::create_dir_all` and
    // `fs::write` will create those components inside the verified ancestor.
    let mut ancestor = path.clone();
    while !ancestor.exists() {
        if !ancestor.pop() {
            return Err(NativeError::new(
                "workspace.invalid_path",
                "File path must stay inside the workspace.",
            ));
        }
    }
    let canonical_ancestor = ancestor.canonicalize().map_err(|error| {
        failed(
            "workspace.invalid_path",
            "Failed to resolve the workspace entry.",
            error,
        )
    })?;
    if !canonical_ancestor.starts_with(root) {
        return Err(NativeError::new(
            "workspace.invalid_path",
            "File path must stay inside the workspace.",
        ));
    }
    let tail = path.strip_prefix(&ancestor).map_err(|_| {
        NativeError::new(
            "workspace.invalid_path",
            "File path must stay inside the workspace.",
        )
    })?;
    Ok(canonical_ancestor.join(tail))
}

pub fn normalize_relative_path(relative_path: &str) -> Result<String, NativeError> {
    // Tauri receives paths from every supported desktop platform. Normalize
    // separators before `Path::components` so Windows input is validated the
    // same way on Unix hosts (including `..` escape attempts).
    let normalized_input = relative_path.replace('\\', "/");
    let path = Path::new(&normalized_input);

    if path.is_absolute() {
        return Err(NativeError::new(
            "workspace.invalid_path",
            "File path must be relative to the workspace.",
        ));
    }

    let mut parts = Vec::new();

    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if part.trim().is_empty() {
                    return Err(NativeError::new(
                        "workspace.invalid_path",
                        "File path contains an empty segment.",
                    ));
                }
                parts.push(part.to_string());
            }
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(NativeError::new(
                    "workspace.invalid_path",
                    "File path must stay inside the workspace.",
                ));
            }
        }
    }

    if parts.is_empty() {
        return Err(NativeError::new(
            "workspace.invalid_path",
            "File path cannot be empty.",
        ));
    }

    Ok(parts.join("/"))
}

pub fn describe_workspace(root: &Path) -> WorkspaceDescriptor {
    WorkspaceDescriptor {
        root_path: root.to_string_lossy().into_owned(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
    }
}

/// Shared filesystem-derived fields for a workspace entry.
pub struct EntryMetadata {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<u64>,
}

/// Reads the shared metadata block (relative path, file name, parent path, byte size, mtime)
/// used by both `workspace_entry` and `markdown_file_entry`.
pub fn entry_metadata(root: &Path, path: &Path) -> Result<EntryMetadata, NativeError> {
    let relative_path = path
        .strip_prefix(root)
        .map_err(|error| {
            failed(
                "workspace.invalid_path",
                "Entry path is outside the workspace.",
                error,
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");
    let metadata = fs::metadata(path).map_err(|error| {
        failed(
            "workspace.metadata_failed",
            "Failed to read workspace entry metadata.",
            error,
        )
    })?;
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);
    let file_name = path
        .file_name()
        .map(|file_name| file_name.to_string_lossy().into_owned())
        .unwrap_or_else(|| relative_path.clone());
    let parent_path = Path::new(&relative_path)
        .parent()
        .map(|parent| parent.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    Ok(EntryMetadata {
        relative_path,
        file_name,
        parent_path,
        byte_size: metadata.len(),
        updated_at,
    })
}

/// Reports whether an entry name should be hidden (dot-prefixed, e.g. `.git`).
pub fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

/// Computes a deterministic 64-bit FNV-1a hash for workspace cache filenames.
///
/// A stable, dependency-free hash keeps the same workspace mapped to the same
/// cache file across runs (unlike `DefaultHasher`, which is not guaranteed
/// stable between Rust versions).
pub fn stable_workspace_hash(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;

    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    hash
}

/// Preserves the historical `commands::workspace` API.
pub use crate::commands::atomic_write::write_file_atomically;
