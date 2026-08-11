use crate::error::NativeError;
use serde::Serialize;
use std::path::{Path, PathBuf};

use std::sync::{Mutex, atomic::{AtomicU64, Ordering}};
use std::collections::HashMap;
use std::fs;
use std::time::UNIX_EPOCH;
use std::path::Component;
use tauri::Manager;
use std::io::Write;
use crate::commands::markdown::{MarkdownFileEntry, list_markdown_file_entries, is_markdown_path};
use crate::commands::watcher::record_self_write;

pub const IGNORED_FOLDERS: &[&str] = &["node_modules", "target", "dist", "vendor"];
const MAX_WORKSPACE_ENTRIES: usize = 10_000;

pub static WORKSPACE_ENTRY_MUTATION_LOCK: Mutex<()> = Mutex::new(());
static WORKSPACE_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct WorkspaceWindowRoots(Mutex<HashMap<String, String>>);

pub fn next_workspace_window_label() -> String {
    format!(
        "workspace-{}",
        WORKSPACE_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}


pub fn register_workspace_window_root(roots: &WorkspaceWindowRoots, label: String, root_path: String) {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(label, root_path);
}


pub fn workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) -> Option<String> {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(label)
        .cloned()
}


pub fn unregister_workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(label);
}


#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShellStatus {
    pub app_name: String,
    pub shell_version: String,
    pub ready: bool,
}


#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceDescriptor {
    pub root_path: String,
    pub name: String,
}


#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
}


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
pub fn desktop_shell_status() -> Result<ShellStatus, NativeError> {
    Ok(ShellStatus {
        app_name: "Thinkbrain Notes".to_string(),
        shell_version: env!("CARGO_PKG_VERSION").to_string(),
        ready: true,
    })
}


#[tauri::command]
pub fn open_workspace(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<WorkspaceSnapshot, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    // Grant `asset://` reads for this vault only. The static scope in
    // tauri.conf.json is empty, so the renderer can reach nothing until a
    // workspace is deliberately opened, and then only inside it. This is what
    // lets live preview render vault-relative images without handing the
    // webview the whole filesystem.
    if let Err(error) = app.asset_protocol_scope().allow_directory(&root, true) {
        // Not fatal: the workspace still opens, images just fall back to alt
        // text. Fail loudly so the cause is visible rather than mysterious.
        eprintln!(
            "[workspace] failed to grant asset scope for {}: {error}",
            root.display()
        );
    }

    Ok(WorkspaceSnapshot {
        workspace: describe_workspace(&root),
        files: list_markdown_file_entries(&root)?,
    })
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
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let file_path = resolve_workspace_entry_path(&root, &relative_path)?;

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the destination folder.",
                error.to_string(),
            )
        })?;
    }

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
                NativeError::with_details(
                    "workspace.create_failed",
                    "Failed to create the file.",
                    error.to_string(),
                )
            }
        })?;
    file.write_all(contents.unwrap_or_default().as_bytes())
        .map_err(|error| {
            NativeError::with_details(
                "workspace.create_failed",
                "Failed to create the file.",
                error.to_string(),
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
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let folder_path = resolve_workspace_entry_path(&root, &relative_path)?;

    if folder_path.exists() {
        return Err(NativeError::new(
            "workspace.file_exists",
            "A folder already exists at that path.",
        ));
    }

    fs::create_dir_all(&folder_path).map_err(|error| {
        NativeError::with_details(
            "workspace.create_failed",
            "Failed to create the folder.",
            error.to_string(),
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
    root_path: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<WorkspaceEntry, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let source_path = resolve_workspace_entry_path(&root, &relative_path)?;
    let destination_path = resolve_workspace_entry_path(&root, &new_relative_path)?;

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

    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeError::with_details(
                "workspace.create_parent_failed",
                "Failed to create the destination folder.",
                error.to_string(),
            )
        })?;
    }

    record_self_write(&source_path);
    record_self_write(&destination_path);
    let is_dir = source_path.is_dir();
    fs::rename(&source_path, &destination_path).map_err(|error| {
        NativeError::with_details(
            "workspace.rename_failed",
            "Failed to rename the workspace entry.",
            error.to_string(),
        )
    })?;

    workspace_entry(&root, &destination_path, is_dir)
}


/// Deletes any workspace file or folder. Folders are removed recursively so
/// the explorer can delete a populated folder in one action. The path is
/// normalized and verified to stay inside the workspace root for literal
/// traversal (`..`, absolute paths); symlinked components inside the workspace
/// are not separately resolved, so this is safe for trusted local workspaces
/// but should not be exposed to untrusted remote roots.
#[tauri::command]
pub fn delete_workspace_entry(root_path: String, relative_path: String) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let _mutation_lock = WORKSPACE_ENTRY_MUTATION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let entry_path = resolve_workspace_entry_path(&root, &relative_path)?;

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
        NativeError::with_details(
            "workspace.delete_failed",
            "Failed to delete the workspace entry.",
            error.to_string(),
        )
    })
}


#[tauri::command]
pub fn open_workspace_window(app: tauri::AppHandle, root_path: String) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let label = next_workspace_window_label();
    let root_path = root.to_string_lossy().into_owned();
    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(describe_workspace(&root).name)
            .build()
            .map_err(|error| {
                NativeError::with_details(
                    "workspace.window_failed",
                    "Failed to create a workspace window.",
                    error.to_string(),
                )
            })?;
    let app_for_cleanup = app.clone();
    let label_for_cleanup = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            unregister_workspace_window_root(
                &app_for_cleanup.state::<WorkspaceWindowRoots>(),
                &label_for_cleanup,
            );
            // A destroyed window never runs the frontend teardown, so its file
            // watchers have to be released from here or they outlive it.
            crate::commands::watcher::release_window_watchers(&label_for_cleanup);
        }
    });
    register_workspace_window_root(&app.state::<WorkspaceWindowRoots>(), label, root_path);
    Ok(())
}


#[tauri::command]
pub fn window_workspace_root(
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
) -> Option<String> {
    workspace_window_root(&roots, window.label())
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
        NativeError::with_details(
            "workspace.open_failed",
            "Failed to open the workspace folder.",
            error.to_string(),
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
pub fn resolve_workspace_entry_path(root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
    let normalized = normalize_relative_path(relative_path)?;
    let path = root.join(normalized);

    // For existing entries, canonicalize the full path and verify it stays
    // inside the (already canonical) workspace root.
    if path.exists() {
        let canonical = path.canonicalize().map_err(|error| {
            NativeError::with_details(
                "workspace.invalid_path",
                "Failed to resolve the workspace entry.",
                error.to_string(),
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
        NativeError::with_details(
            "workspace.invalid_path",
            "Failed to resolve the workspace entry.",
            error.to_string(),
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
        NativeError::with_details(
            "workspace.list_failed",
            "Failed to list the workspace contents.",
            error.to_string(),
        )
    })?;

    for entry in dir {
        if entries.len() >= MAX_WORKSPACE_ENTRIES {
            break;
        }

        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace entry.",
                error.to_string(),
            )
        })?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if !include_hidden && is_hidden_name(&name) {
            continue;
        }

        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace entry type.",
                error.to_string(),
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
pub fn workspace_entry(root: &Path, path: &Path, is_dir: bool) -> Result<WorkspaceEntry, NativeError> {
    let relative_path = path
        .strip_prefix(root)
        .map_err(|error| {
            NativeError::with_details(
                "workspace.invalid_path",
                "Entry path is outside the workspace.",
                error.to_string(),
            )
        })?
        .to_string_lossy()
        .replace('\\', "/");
    let metadata = fs::metadata(path).map_err(|error| {
        NativeError::with_details(
            "workspace.metadata_failed",
            "Failed to read workspace entry metadata.",
            error.to_string(),
        )
    })?;
    let updated_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(WorkspaceEntry {
        name: path
            .file_name()
            .map(|file_name| file_name.to_string_lossy().into_owned())
            .unwrap_or_else(|| relative_path.clone()),
        parent_path: Path::new(&relative_path)
            .parent()
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default(),
        kind: if is_dir { "directory" } else { "file" }.to_string(),
        is_markdown: !is_dir && is_markdown_path(path),
        byte_size: if is_dir { 0 } else { metadata.len() },
        updated_at,
        relative_path,
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


