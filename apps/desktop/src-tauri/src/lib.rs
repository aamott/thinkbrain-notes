use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::UNIX_EPOCH,
};
use tauri::Manager;

// Explorer entry commands do a small amount of check-then-act filesystem work
// (notably rename). Keep that sequence serialized for calls handled by this
// process; external filesystem mutations can still race and are reported by
// the underlying operation where possible.
static WORKSPACE_ENTRY_MUTATION_LOCK: Mutex<()> = Mutex::new(());
static WORKSPACE_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
struct WorkspaceWindowRoots(Mutex<HashMap<String, String>>);

fn next_workspace_window_label() -> String {
    format!(
        "workspace-{}",
        WORKSPACE_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn register_workspace_window_root(roots: &WorkspaceWindowRoots, label: String, root_path: String) {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(label, root_path);
}

fn workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) -> Option<String> {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(label)
        .cloned()
}

fn unregister_workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) {
    roots
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(label);
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl NativeError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details.into()),
        }
    }
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
pub struct MarkdownFileEntry {
    pub relative_path: String,
    pub file_name: String,
    pub parent_path: String,
    pub byte_size: u64,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarkdownFileContents {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
}

/// The system Git installation available to the desktop app.
///
/// `available` is deliberately a value rather than an error: the UI needs to
/// render a useful disabled state when Git is absent. Other Git commands use a
/// typed `git.not_installed` error if the binary disappears after this check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitAvailability {
    pub available: bool,
    pub version: Option<String>,
}

/// Read-only Git repository information for an opened workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitRepository {
    pub is_repository: bool,
    pub branch: Option<String>,
}

/// One entry from Git's machine-readable porcelain v1 status output.
///
/// The status codes are the two fixed-width porcelain fields. A space means
/// Git reports no change for that area; `?` marks an untracked path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitStatusEntry {
    pub path: String,
    pub index_status: String,
    pub worktree_status: String,
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
    pub updated_at: Option<String>,
}

/// A single note record sent from the frontend to (re)index.
///
/// The frontend extracts these fields with the shared core parser, so the
/// native layer never reimplements frontmatter/tag parsing. Field names arrive
/// from JS as camelCase and are mapped to these snake_case fields by serde.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub path: String,
    pub file_name: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub body: String,
}

/// A ranked search match returned to the frontend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchHit {
    pub path: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub snippet: String,
    pub score: f64,
}

#[tauri::command]
fn desktop_shell_status() -> Result<ShellStatus, NativeError> {
    Ok(ShellStatus {
        app_name: "Thinkbrain Notes".to_string(),
        shell_version: env!("CARGO_PKG_VERSION").to_string(),
        ready: true,
    })
}

#[tauri::command]
fn open_workspace(root_path: String) -> Result<WorkspaceSnapshot, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    Ok(WorkspaceSnapshot {
        workspace: describe_workspace(&root),
        files: list_markdown_file_entries(&root)?,
    })
}

/// Reports whether a usable system `git` binary is available on PATH.
///
/// This command never treats a missing Git binary as an exceptional result so
/// the frontend can gate source-control affordances without error handling.
#[tauri::command]
fn git_availability() -> Result<GitAvailability, NativeError> {
    git_availability_with(&SystemGitRunner)
}

/// Detects whether an opened workspace is inside a Git work tree and, when
/// available, reports its current symbolic branch.
///
/// The command is read-only. It executes exact, non-shell Git subcommands in
/// the already canonicalized workspace directory, with no stdin or pager.
#[tauri::command]
fn detect_git_repository(root_path: String) -> Result<GitRepository, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    detect_git_repository_with(&SystemGitRunner, &root)
}

/// Initializes the opened workspace as a Git repository when it is not
/// already one, then returns the resulting repository state.
///
/// The command first uses the same read-only detection used by the source
/// control UI. That makes repeated requests idempotent: an existing
/// repository is returned unchanged and `git init` is not run again.
#[tauri::command]
fn initialize_git_repository(root_path: String) -> Result<GitRepository, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    initialize_git_repository_with(&SystemGitRunner, &root)
}

/// Returns the current Git status for an opened workspace.
///
/// This uses porcelain v1 with NUL delimiters so filenames are never parsed
/// through human-oriented quoting rules. The command is read-only and uses
/// only fixed arguments; the workspace root is the process working directory.
#[tauri::command]
fn git_status(root_path: String) -> Result<Vec<GitStatusEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    git_status_with(&SystemGitRunner, &root)
}

/// Stages the supplied workspace-relative paths with Git.
///
/// Every path is normalized before it is passed to Git, and `--` terminates
/// fixed Git options so a filename can never be interpreted as an argument.
#[tauri::command]
fn stage_git_files(root_path: String, paths: Vec<String>) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    stage_git_files_with(&SystemGitRunner, &root, &paths)
}

/// Removes the supplied workspace-relative paths from Git's staging area.
#[tauri::command]
fn unstage_git_files(root_path: String, paths: Vec<String>) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    unstage_git_files_with(&SystemGitRunner, &root, &paths)
}

#[tauri::command]
fn list_markdown_files(root_path: String) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    list_markdown_file_entries(&root)
}

#[tauri::command]
fn list_workspace_entries(root_path: String) -> Result<Vec<WorkspaceEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let mut entries = Vec::new();
    collect_workspace_entries(&root, &root, &mut entries)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(entries)
}

#[tauri::command]
fn read_markdown_file(
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
fn write_markdown_file(
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
fn create_markdown_file(
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
fn rename_markdown_file(
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

    markdown_file_entry(&root, &new_file_path)
}

#[tauri::command]
fn delete_markdown_file(root_path: String, relative_path: String) -> Result<(), NativeError> {
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
    })
}

/// Creates a workspace file of any type. Unlike `create_markdown_file`, this
/// powers the explorer's "New file" context action on arbitrary folders and
/// accepts non-Markdown extensions. Parent folders are created on demand.
#[tauri::command]
fn create_workspace_file(
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
fn create_workspace_folder(
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
fn rename_workspace_entry(
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
fn delete_workspace_entry(root_path: String, relative_path: String) -> Result<(), NativeError> {
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
fn index_documents(
    app: tauri::AppHandle,
    root_path: String,
    documents: Vec<DocumentRecord>,
) -> Result<usize, NativeError> {
    let mut connection = open_index_connection(&app, &root_path)?;

    index_document_records(&mut connection, &documents).map_err(|error| {
        NativeError::with_details(
            "index.write_failed",
            "Failed to update the search index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn search_index(
    app: tauri::AppHandle,
    root_path: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchHit>, NativeError> {
    let connection = open_index_connection(&app, &root_path)?;
    let resolved_limit = limit.unwrap_or(50).clamp(1, 200) as usize;

    search_documents(&connection, &query, resolved_limit).map_err(|error| {
        NativeError::with_details(
            "index.search_failed",
            "Failed to search the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn clear_index(app: tauri::AppHandle, root_path: String) -> Result<(), NativeError> {
    let connection = open_index_connection(&app, &root_path)?;

    clear_documents(&connection).map_err(|error| {
        NativeError::with_details(
            "index.clear_failed",
            "Failed to clear the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn remove_index_document(
    app: tauri::AppHandle,
    root_path: String,
    path: String,
) -> Result<(), NativeError> {
    let connection = open_index_connection(&app, &root_path)?;

    delete_document(&connection, &path).map_err(|error| {
        NativeError::with_details(
            "index.remove_failed",
            "Failed to remove a document from the workspace index.",
            error.to_string(),
        )
    })
}

#[tauri::command]
fn read_app_settings(app: tauri::AppHandle) -> Result<Option<String>, NativeError> {
    read_settings_file(&resolve_app_settings_path(&app)?)
}

#[tauri::command]
fn write_app_settings(app: tauri::AppHandle, contents: String) -> Result<(), NativeError> {
    write_settings_file(&resolve_app_settings_path(&app)?, &contents)
}

#[tauri::command]
fn read_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Option<String>, NativeError> {
    read_settings_file(&resolve_workspace_settings_path(&app, &root_path)?)
}

#[tauri::command]
fn write_workspace_settings(
    app: tauri::AppHandle,
    root_path: String,
    contents: String,
) -> Result<(), NativeError> {
    write_settings_file(
        &resolve_workspace_settings_path(&app, &root_path)?,
        &contents,
    )
}

#[tauri::command]
fn open_workspace_window(app: tauri::AppHandle, root_path: String) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let label = next_workspace_window_label();
    let root_path = root.to_string_lossy().to_string();
    let roots = app.state::<WorkspaceWindowRoots>();
    register_workspace_window_root(&roots, label.clone(), root_path);
    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(describe_workspace(&root).name)
            .build()
            .map_err(|error| {
                unregister_workspace_window_root(&roots, &label);
                NativeError::with_details(
                    "workspace.window_failed",
                    "Failed to create a workspace window.",
                    error.to_string(),
                )
            })?;
    let app_for_cleanup = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            unregister_workspace_window_root(
                &app_for_cleanup.state::<WorkspaceWindowRoots>(),
                &label,
            );
        }
    });
    Ok(())
}

#[tauri::command]
fn window_workspace_root(
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
) -> Option<String> {
    workspace_window_root(&roots, window.label())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceWindowRoots::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_shell_status,
            open_workspace,
            git_availability,
            detect_git_repository,
            initialize_git_repository,
            git_status,
            stage_git_files,
            unstage_git_files,
            list_markdown_files,
            list_workspace_entries,
            read_markdown_file,
            write_markdown_file,
            create_markdown_file,
            rename_markdown_file,
            delete_markdown_file,
            create_workspace_file,
            create_workspace_folder,
            rename_workspace_entry,
            delete_workspace_entry,
            index_documents,
            search_index,
            clear_index,
            remove_index_document,
            read_app_settings,
            write_app_settings,
            read_workspace_settings,
            write_workspace_settings,
            open_workspace_window,
            window_workspace_root
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Thinkbrain Notes desktop shell");
}

fn resolve_workspace_root(root_path: &str) -> Result<PathBuf, NativeError> {
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

fn resolve_markdown_file_path(root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
    let normalized = normalize_relative_path(relative_path)?;
    let path = root.join(normalized);

    if !is_markdown_path(&path) {
        return Err(NativeError::new(
            "workspace.not_markdown",
            "Only Markdown files can be managed by this command.",
        ));
    }

    Ok(path)
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
fn resolve_workspace_entry_path(root: &Path, relative_path: &str) -> Result<PathBuf, NativeError> {
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

fn normalize_relative_path(relative_path: &str) -> Result<String, NativeError> {
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

fn describe_workspace(root: &Path) -> WorkspaceDescriptor {
    WorkspaceDescriptor {
        root_path: root.to_string_lossy().to_string(),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
    }
}

const GIT_COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const MAX_GIT_DETAILS_LENGTH: usize = 4_096;

#[derive(Debug, Clone, PartialEq, Eq)]
struct GitCommandOutput {
    success: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Debug)]
enum GitRunError {
    NotFound(std::io::Error),
    TimedOut,
    Io(std::io::Error),
}

trait GitRunner {
    /// Runs one fixed Git command. `working_dir` is only used as a process
    /// current directory; workspace paths are never interpolated into shell
    /// strings or passed as Git arguments.
    fn run(
        &self,
        working_dir: Option<&Path>,
        args: &[&str],
    ) -> Result<GitCommandOutput, GitRunError>;
}

struct SystemGitRunner;

impl GitRunner for SystemGitRunner {
    fn run(
        &self,
        working_dir: Option<&Path>,
        args: &[&str],
    ) -> Result<GitCommandOutput, GitRunError> {
        let mut command = Command::new("git");
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // These commands are non-interactive. The explicit environment
            // prevents a credential prompt or pager from keeping a desktop
            // command alive.
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_PAGER", "cat")
            .env("GIT_OPTIONAL_LOCKS", "0");

        if let Some(directory) = working_dir {
            command.current_dir(directory);
        }

        let mut child = command.spawn().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                GitRunError::NotFound(error)
            } else {
                GitRunError::Io(error)
            }
        })?;
        let deadline = std::time::Instant::now() + GIT_COMMAND_TIMEOUT;

        loop {
            match child.try_wait().map_err(GitRunError::Io)? {
                Some(_) => {
                    let output = child.wait_with_output().map_err(GitRunError::Io)?;
                    return Ok(git_command_output(output));
                }
                None if std::time::Instant::now() >= deadline => {
                    // Best-effort cleanup before reporting a typed timeout.
                    // Ignore a raced "already exited" error, then reap it.
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(GitRunError::TimedOut);
                }
                None => std::thread::sleep(std::time::Duration::from_millis(10)),
            }
        }
    }
}

fn git_command_output(output: Output) -> GitCommandOutput {
    GitCommandOutput {
        success: output.status.success(),
        exit_code: output.status.code(),
        // Preserve leading whitespace: porcelain status uses the first two
        // bytes for its index/worktree codes, including a meaningful space.
        // Callers that consume line-oriented Git output trim it explicitly.
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    }
}

fn git_availability_with(runner: &impl GitRunner) -> Result<GitAvailability, NativeError> {
    match runner.run(None, &["--version"]) {
        Ok(output) if output.success => Ok(GitAvailability {
            available: true,
            version: non_empty_git_text(&output.stdout),
        }),
        Ok(output) => Err(git_command_failed(
            "check the installed Git version",
            &output,
        )),
        Err(GitRunError::NotFound(_)) => Ok(GitAvailability {
            available: false,
            version: None,
        }),
        Err(error) => Err(git_run_error("check the installed Git version", error)),
    }
}

fn detect_git_repository_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<GitRepository, NativeError> {
    let repository_check = runner
        .run(Some(root), &["rev-parse", "--is-inside-work-tree"])
        .map_err(|error| git_run_error("detect the workspace Git repository", error))?;

    // `rev-parse` uses a non-zero status for ordinary non-repositories. It is
    // the expected negative result for this detection API, not an operation
    // failure. Any later mutation command can instead surface git.not_repo.
    if !repository_check.success || repository_check.stdout.trim() != "true" {
        return Ok(GitRepository {
            is_repository: false,
            branch: None,
        });
    }

    let branch = runner
        .run(Some(root), &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .map_err(|error| git_run_error("read the workspace Git branch", error))?;

    if branch.success {
        return Ok(GitRepository {
            is_repository: true,
            branch: non_empty_git_text(&branch.stdout),
        });
    }

    // Exit status 1 is Git's documented detached-HEAD/no-symbolic-branch
    // signal for `symbolic-ref --quiet`; the workspace is still a repository.
    if branch.exit_code == Some(1) {
        return Ok(GitRepository {
            is_repository: true,
            branch: None,
        });
    }

    Err(git_command_failed("read the workspace Git branch", &branch))
}

fn initialize_git_repository_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<GitRepository, NativeError> {
    let existing_repository = detect_git_repository_with(runner, root)?;

    if existing_repository.is_repository {
        return Ok(existing_repository);
    }

    let initialization = runner
        .run(Some(root), &["init", "--quiet"])
        .map_err(|error| git_run_error("initialize the workspace Git repository", error))?;

    if !initialization.success {
        return Err(git_command_failed(
            "initialize the workspace Git repository",
            &initialization,
        ));
    }

    detect_git_repository_with(runner, root)
}

fn git_status_with(
    runner: &impl GitRunner,
    root: &Path,
) -> Result<Vec<GitStatusEntry>, NativeError> {
    let status = runner
        .run(
            Some(root),
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
        .map_err(|error| git_run_error("read the workspace Git status", error))?;

    if !status.success {
        return Err(git_command_failed("read the workspace Git status", &status));
    }

    parse_git_status_porcelain_v1(&status.stdout)
}

fn stage_git_files_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
) -> Result<(), NativeError> {
    update_git_index_with(runner, root, paths, "stage", &["add"])
}

fn unstage_git_files_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
) -> Result<(), NativeError> {
    // `git reset -- <paths>` works for both an initialized repository and an
    // unborn branch, unlike an explicit `HEAD` pathspec.
    update_git_index_with(runner, root, paths, "unstage", &["reset"])
}

fn update_git_index_with(
    runner: &impl GitRunner,
    root: &Path,
    paths: &[String],
    action: &str,
    command: &[&str],
) -> Result<(), NativeError> {
    if paths.is_empty() {
        return Err(NativeError::new(
            "git.no_paths",
            "Select at least one workspace file.",
        ));
    }

    let paths = paths
        .iter()
        .map(|path| normalize_relative_path(path))
        .collect::<Result<Vec<_>, _>>()?;
    let mut args = command.to_vec();
    args.push("--");
    args.extend(paths.iter().map(String::as_str));

    let output = runner
        .run(Some(root), &args)
        .map_err(|error| git_run_error(&format!("{action} workspace files"), error))?;

    if output.success {
        Ok(())
    } else {
        Err(git_command_failed(
            &format!("{action} workspace files"),
            &output,
        ))
    }
}

/// Parses Git's `status --porcelain=v1 -z` output.
///
/// A normal record is `XY path\\0`. Rename and copy records include a second
/// NUL-delimited source path after the destination path; this API exposes the
/// destination path because it is the path that now exists in the workspace.
fn parse_git_status_porcelain_v1(output: &str) -> Result<Vec<GitStatusEntry>, NativeError> {
    let records: Vec<&str> = output
        .split('\0')
        .filter(|record| !record.is_empty())
        .collect();
    let mut entries = Vec::new();
    let mut record_index = 0;

    while record_index < records.len() {
        let record = records[record_index];
        let bytes = record.as_bytes();

        if bytes.len() < 4 || bytes[2] != b' ' {
            return Err(git_status_parse_error("a record did not contain `XY path`"));
        }

        let path = &record[3..];
        if path.is_empty() {
            return Err(git_status_parse_error("a record did not include a path"));
        }

        let index_status = record[0..1].to_string();
        let worktree_status = record[1..2].to_string();
        let has_source_path = matches!(index_status.as_str(), "R" | "C")
            || matches!(worktree_status.as_str(), "R" | "C");

        if has_source_path {
            record_index += 1;
            let Some(source_path) = records.get(record_index) else {
                return Err(git_status_parse_error(
                    "a rename or copy record did not include its source path",
                ));
            };

            if source_path.is_empty() {
                return Err(git_status_parse_error(
                    "a rename or copy record included an empty source path",
                ));
            }
        }

        entries.push(GitStatusEntry {
            path: path.to_string(),
            index_status,
            worktree_status,
        });
        record_index += 1;
    }

    entries.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.index_status.cmp(&right.index_status))
            .then_with(|| left.worktree_status.cmp(&right.worktree_status))
    });

    Ok(entries)
}

fn git_status_parse_error(reason: &str) -> NativeError {
    NativeError::with_details(
        "git.command_failed",
        "Git returned an unexpected failure.",
        format!("read the workspace Git status; invalid porcelain v1 output: {reason}"),
    )
}

fn git_run_error(action: &str, error: GitRunError) -> NativeError {
    match error {
        GitRunError::NotFound(error) => NativeError::with_details(
            "git.not_installed",
            "Git is not installed or is unavailable on PATH.",
            error.to_string(),
        ),
        GitRunError::TimedOut => NativeError::with_details(
            "git.command_timeout",
            "Git did not finish before the command timeout.",
            action,
        ),
        GitRunError::Io(error) => NativeError::with_details(
            "git.command_failed",
            "Failed to run a Git command.",
            format!("{action}: {error}"),
        ),
    }
}

fn git_command_failed(action: &str, output: &GitCommandOutput) -> NativeError {
    let stdout = bounded_git_text(&output.stdout);
    let stderr = bounded_git_text(&output.stderr);
    let details = match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => format!("{action}; exit status {:?}", output.exit_code),
        (false, true) => format!("{action}; stdout: {stdout}"),
        (true, false) => format!("{action}; stderr: {stderr}"),
        (false, false) => format!("{action}; stdout: {stdout}; stderr: {stderr}"),
    };

    NativeError::with_details(
        "git.command_failed",
        "Git returned an unexpected failure.",
        bounded_git_text(&details),
    )
}

fn non_empty_git_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| bounded_git_text(value))
}

fn bounded_git_text(value: &str) -> String {
    let mut characters = value.chars();
    let truncated: String = characters.by_ref().take(MAX_GIT_DETAILS_LENGTH).collect();

    if characters.next().is_some() {
        format!("{truncated}…")
    } else {
        truncated
    }
}

fn list_markdown_file_entries(root: &Path) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let mut files = Vec::new();
    collect_markdown_file_entries(root, root, &mut files)?;
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(files)
}

fn collect_markdown_file_entries(
    root: &Path,
    current: &Path,
    files: &mut Vec<MarkdownFileEntry>,
) -> Result<(), NativeError> {
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
        let file_type = entry.file_type().map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace file type.",
                error.to_string(),
            )
        })?;

        if file_type.is_dir() {
            collect_markdown_file_entries(root, &path, files)?;
        } else if file_type.is_file() && is_markdown_path(&path) {
            files.push(markdown_file_entry(root, &path)?);
        }
    }

    Ok(())
}

fn markdown_file_entry(root: &Path, file_path: &Path) -> Result<MarkdownFileEntry, NativeError> {
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
        .map(|duration| duration.as_millis().to_string());

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

/// Recursively collects every visible folder and file under the workspace.
///
/// Hidden entries (dot-prefixed, e.g. `.git`) are skipped so the tree stays
/// clean, matching typical file-manager defaults. Directories are emitted before
/// their contents so callers can build a complete tree, including empty folders.
fn collect_workspace_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<WorkspaceEntry>,
) -> Result<(), NativeError> {
    let dir = fs::read_dir(current).map_err(|error| {
        NativeError::with_details(
            "workspace.list_failed",
            "Failed to list the workspace contents.",
            error.to_string(),
        )
    })?;

    for entry in dir {
        let entry = entry.map_err(|error| {
            NativeError::with_details(
                "workspace.list_failed",
                "Failed to inspect a workspace entry.",
                error.to_string(),
            )
        })?;
        let name = entry.file_name().to_string_lossy().to_string();

        if is_hidden_name(&name) {
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

        if file_type.is_dir() {
            entries.push(workspace_entry(root, &path, true)?);
            collect_workspace_entries(root, &path, entries)?;
        } else if file_type.is_file() {
            entries.push(workspace_entry(root, &path, false)?);
        }
    }

    Ok(())
}

/// Builds a `WorkspaceEntry` for a folder or file from filesystem metadata.
fn workspace_entry(root: &Path, path: &Path, is_dir: bool) -> Result<WorkspaceEntry, NativeError> {
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
        .map(|duration| duration.as_millis().to_string());

    Ok(WorkspaceEntry {
        name: path
            .file_name()
            .map(|file_name| file_name.to_string_lossy().to_string())
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
fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

/// Opens (creating if needed) the SQLite FTS5 cache for a workspace.
///
/// The database always lives in the OS application-data directory, never inside
/// the workspace, satisfying the project's user-data separation rule.
fn open_index_connection(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<Connection, NativeError> {
    let db_path = resolve_index_db_path(app, root_path)?;
    let connection = Connection::open(&db_path).map_err(|error| {
        NativeError::with_details(
            "index.open_failed",
            "Failed to open the search index database.",
            error.to_string(),
        )
    })?;

    init_index_schema(&connection).map_err(|error| {
        NativeError::with_details(
            "index.schema_failed",
            "Failed to initialize the search index schema.",
            error.to_string(),
        )
    })?;

    Ok(connection)
}

/// Resolves the per-workspace index database path inside the app-data dir.
///
/// Each workspace gets its own cache file named from a stable hash of the
/// canonicalized workspace root, so distinct vaults never collide.
fn resolve_index_db_path(app: &tauri::AppHandle, root_path: &str) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "index.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;
    let index_dir = app_data_dir.join("index");

    fs::create_dir_all(&index_dir).map_err(|error| {
        NativeError::with_details(
            "index.create_dir_failed",
            "Failed to create the search index directory.",
            error.to_string(),
        )
    })?;

    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    Ok(index_dir.join(format!("workspace-{workspace_key:016x}.sqlite3")))
}

/// Computes a deterministic 64-bit FNV-1a hash for workspace cache filenames.
///
/// A stable, dependency-free hash keeps the same workspace mapped to the same
/// cache file across runs (unlike `DefaultHasher`, which is not guaranteed
/// stable between Rust versions).
fn stable_workspace_hash(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;

    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    hash
}

fn resolve_app_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(app_settings_path(&app_data_dir))
}

fn resolve_workspace_settings_path(
    app: &tauri::AppHandle,
    root_path: &str,
) -> Result<PathBuf, NativeError> {
    let canonical_root = resolve_workspace_root(root_path)?;
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        NativeError::with_details(
            "settings.app_data_unavailable",
            "Failed to resolve the application data directory.",
            error.to_string(),
        )
    })?;

    Ok(workspace_settings_path(&app_data_dir, &canonical_root))
}

fn app_settings_path(app_data_dir: &Path) -> PathBuf {
    settings_dir(app_data_dir).join("app.json")
}

fn workspace_settings_path(app_data_dir: &Path, canonical_root: &Path) -> PathBuf {
    let workspace_key = stable_workspace_hash(&canonical_root.to_string_lossy());

    settings_dir(app_data_dir).join(format!("workspace-{workspace_key:016x}.json"))
}

fn settings_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("settings")
}

fn read_settings_file(path: &Path) -> Result<Option<String>, NativeError> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(NativeError::with_details(
            "settings.read_failed",
            "Failed to read the settings file.",
            error.to_string(),
        )),
    }
}

fn write_settings_file(path: &Path, contents: &str) -> Result<(), NativeError> {
    let parent = path.parent().ok_or_else(|| {
        NativeError::new(
            "settings.invalid_path",
            "Settings file path must include a parent directory.",
        )
    })?;

    fs::create_dir_all(parent).map_err(|error| {
        NativeError::with_details(
            "settings.create_dir_failed",
            "Failed to create the settings directory.",
            error.to_string(),
        )
    })?;

    fs::write(path, contents).map_err(|error| {
        NativeError::with_details(
            "settings.write_failed",
            "Failed to write the settings file.",
            error.to_string(),
        )
    })
}

/// Creates the FTS5 virtual table backing search. Idempotent.
///
/// Every searchable field (filename, title, tags, aliases, body) is a column so
/// a single `MATCH` query ranks across all of them. `path` is stored but not
/// tokenized so results can resolve back to a workspace-relative file.
fn init_index_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            path UNINDEXED,
            file_name,
            title,
            tags,
            aliases,
            body,
            tokenize = 'unicode61 remove_diacritics 1'
        );",
    )
}

/// Inserts or replaces a single document keyed by its workspace-relative path.
fn upsert_document(connection: &Connection, record: &DocumentRecord) -> rusqlite::Result<()> {
    connection.execute(
        "DELETE FROM documents_fts WHERE path = ?1",
        params![record.path],
    )?;
    connection.execute(
        "INSERT INTO documents_fts (path, file_name, title, tags, aliases, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record.path,
            record.file_name,
            record.title.clone().unwrap_or_default(),
            record.tags.join(" "),
            record.aliases.join(" "),
            record.body,
        ],
    )?;

    Ok(())
}

/// Removes a single document from the index by path. No-op if absent.
fn delete_document(connection: &Connection, path: &str) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM documents_fts WHERE path = ?1", params![path])?;

    Ok(())
}

/// Clears every indexed document, used to rebuild the cache from scratch.
fn clear_documents(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM documents_fts", [])?;

    Ok(())
}

/// Upserts many records inside a single transaction for fast (re)indexing.
fn index_document_records(
    connection: &mut Connection,
    records: &[DocumentRecord],
) -> rusqlite::Result<usize> {
    let transaction = connection.transaction()?;

    for record in records {
        upsert_document(&transaction, record)?;
    }

    transaction.commit()?;

    Ok(records.len())
}

/// Runs a ranked full-text search across all indexed columns.
///
/// User input is sanitized into a safe FTS5 MATCH expression so special syntax
/// can never raise an error. Returns `bm25`-ordered matches (best first).
fn search_documents(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> rusqlite::Result<Vec<SearchHit>> {
    let match_query = match build_fts_match_query(query) {
        Some(value) => value,
        None => return Ok(Vec::new()),
    };

    let mut statement = connection.prepare(
        "SELECT path,
                file_name,
                title,
                snippet(documents_fts, 5, '', '', '…', 12) AS snippet,
                bm25(documents_fts) AS score
         FROM documents_fts
         WHERE documents_fts MATCH ?1
         ORDER BY score
         LIMIT ?2",
    )?;

    let rows = statement.query_map(params![match_query, limit as i64], |row| {
        let title: String = row.get(2)?;

        Ok(SearchHit {
            path: row.get(0)?,
            file_name: row.get(1)?,
            title: if title.is_empty() { None } else { Some(title) },
            snippet: row.get(3)?,
            score: row.get(4)?,
        })
    })?;

    let mut hits = Vec::new();

    for row in rows {
        hits.push(row?);
    }

    Ok(hits)
}

/// Builds a safe FTS5 MATCH expression from arbitrary user input.
///
/// Each whitespace-separated token is quoted (neutralizing FTS5 operators like
/// `*`, `:`, `-`, parentheses) and given a trailing `*` for prefix matching so
/// search-as-you-type works. Returns `None` when there is no usable token.
fn build_fts_match_query(raw: &str) -> Option<String> {
    let clauses: Vec<String> = raw
        .split_whitespace()
        // A double quote is the only character meaningful inside a quoted FTS5
        // string; drop it so we can safely wrap each token in quotes.
        .map(|token| token.replace('"', ""))
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{token}\"*"))
        .collect();

    if clauses.is_empty() {
        return None;
    }

    Some(clauses.join(" "))
}

#[cfg(test)]
mod tests {
    use super::{
        app_settings_path, bounded_git_text, build_fts_match_query, clear_documents,
        create_workspace_file, create_workspace_folder, delete_document, delete_workspace_entry,
        desktop_shell_status, detect_git_repository_with, git_availability_with, git_status_with,
        index_document_records, init_index_schema, initialize_git_repository_with,
        is_markdown_path, next_workspace_window_label, normalize_relative_path, read_settings_file,
        register_workspace_window_root, rename_workspace_entry, search_documents,
        stable_workspace_hash, stage_git_files_with, unregister_workspace_window_root,
        unstage_git_files_with, workspace_settings_path, workspace_window_root,
        write_settings_file, DocumentRecord, GitCommandOutput, GitRunError, GitRunner,
        GitStatusEntry, NativeError, SystemGitRunner, WorkspaceWindowRoots,
    };
    use rusqlite::Connection;
    use std::{
        cell::RefCell,
        collections::VecDeque,
        fs,
        path::{Path, PathBuf},
        process::Command,
        time::SystemTime,
    };

    #[test]
    fn workspace_window_roots_are_scoped_to_opaque_window_labels() {
        let roots = WorkspaceWindowRoots::default();
        let first = next_workspace_window_label();
        let second = next_workspace_window_label();

        assert_ne!(first, second);
        assert!(first.starts_with("workspace-"));
        register_workspace_window_root(&roots, first.clone(), "/notes/first".to_string());
        register_workspace_window_root(&roots, second.clone(), "/notes/second".to_string());

        assert_eq!(
            workspace_window_root(&roots, &first),
            Some("/notes/first".to_string())
        );
        assert_eq!(
            workspace_window_root(&roots, &second),
            Some("/notes/second".to_string())
        );

        unregister_workspace_window_root(&roots, &first);
        assert_eq!(workspace_window_root(&roots, &first), None);
        assert_eq!(
            workspace_window_root(&roots, &second),
            Some("/notes/second".to_string())
        );
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct GitCall {
        working_dir: Option<PathBuf>,
        args: Vec<String>,
    }

    struct MockGitRunner {
        results: RefCell<VecDeque<Result<GitCommandOutput, MockGitError>>>,
        calls: RefCell<Vec<GitCall>>,
    }

    #[derive(Debug)]
    enum MockGitError {
        NotFound,
        TimedOut,
        Io,
    }

    impl MockGitRunner {
        fn new(results: impl IntoIterator<Item = Result<GitCommandOutput, MockGitError>>) -> Self {
            Self {
                results: RefCell::new(results.into_iter().collect()),
                calls: RefCell::new(Vec::new()),
            }
        }

        fn calls(&self) -> Vec<GitCall> {
            self.calls.borrow().clone()
        }
    }

    impl GitRunner for MockGitRunner {
        fn run(
            &self,
            working_dir: Option<&Path>,
            args: &[&str],
        ) -> Result<GitCommandOutput, GitRunError> {
            self.calls.borrow_mut().push(GitCall {
                working_dir: working_dir.map(Path::to_path_buf),
                args: args.iter().map(ToString::to_string).collect(),
            });

            match self
                .results
                .borrow_mut()
                .pop_front()
                .expect("mock Git result is configured")
            {
                Ok(output) => Ok(output),
                Err(MockGitError::NotFound) => Err(GitRunError::NotFound(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "git missing for test",
                ))),
                Err(MockGitError::TimedOut) => Err(GitRunError::TimedOut),
                Err(MockGitError::Io) => Err(GitRunError::Io(std::io::Error::other(
                    "Git process error for test",
                ))),
            }
        }
    }

    fn git_output(
        success: bool,
        exit_code: Option<i32>,
        stdout: &str,
        stderr: &str,
    ) -> GitCommandOutput {
        GitCommandOutput {
            success,
            exit_code,
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
        }
    }

    fn record(
        path: &str,
        file_name: &str,
        title: Option<&str>,
        tags: &[&str],
        aliases: &[&str],
        body: &str,
    ) -> DocumentRecord {
        DocumentRecord {
            path: path.to_string(),
            file_name: file_name.to_string(),
            title: title.map(str::to_string),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            aliases: aliases.iter().map(|alias| alias.to_string()).collect(),
            body: body.to_string(),
        }
    }

    fn in_memory_index() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database opens");
        init_index_schema(&connection).expect("schema initializes");
        connection
    }

    fn result_paths(connection: &Connection, query: &str) -> Vec<String> {
        search_documents(connection, query, 50)
            .expect("search succeeds")
            .into_iter()
            .map(|hit| hit.path)
            .collect()
    }

    fn temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time is after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("thinkbrain-notes-{name}-{unique}"));

        fs::create_dir_all(&path).expect("temp directory is created");
        path
    }

    #[test]
    fn shell_status_reports_ready_desktop_shell() {
        let status = desktop_shell_status().expect("shell status should succeed");

        assert_eq!(status.app_name, "Thinkbrain Notes");
        assert_eq!(status.shell_version, env!("CARGO_PKG_VERSION"));
        assert!(status.ready);
    }

    #[test]
    fn git_availability_returns_the_installed_version_from_a_bounded_command() {
        let runner =
            MockGitRunner::new([Ok(git_output(true, Some(0), "git version 2.47.1\n", ""))]);

        let availability = git_availability_with(&runner).expect("Git check succeeds");

        assert!(availability.available);
        assert_eq!(availability.version.as_deref(), Some("git version 2.47.1"));
        assert_eq!(
            runner.calls(),
            vec![GitCall {
                working_dir: None,
                args: vec!["--version".to_string()],
            }]
        );
    }

    #[test]
    fn git_availability_returns_false_when_git_is_not_installed() {
        let runner = MockGitRunner::new([Err(MockGitError::NotFound)]);

        let availability = git_availability_with(&runner).expect("missing Git is a valid state");

        assert!(!availability.available);
        assert_eq!(availability.version, None);
    }

    #[test]
    fn git_repository_detection_reports_a_non_repository_without_a_git_installation_assumption() {
        let root = temp_test_dir("git-non-repository");
        let runner = MockGitRunner::new([Ok(git_output(
            false,
            Some(128),
            "",
            "fatal: not a git repository",
        ))]);

        let repository =
            detect_git_repository_with(&runner, &root).expect("non-repository is a valid state");

        assert!(!repository.is_repository);
        assert_eq!(repository.branch, None);
        assert_eq!(
            runner.calls(),
            vec![GitCall {
                working_dir: Some(root.clone()),
                args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
            }]
        );
        fs::remove_dir_all(root).expect("temp non-repository directory is cleaned up");
    }

    #[test]
    fn git_repository_detection_reports_the_current_branch_with_fixed_commands() {
        let root = temp_test_dir("git-repository");
        let runner = MockGitRunner::new([
            Ok(git_output(true, Some(0), "true\n", "")),
            Ok(git_output(true, Some(0), "main\n", "")),
        ]);

        let repository =
            detect_git_repository_with(&runner, &root).expect("repository detection succeeds");

        assert!(repository.is_repository);
        assert_eq!(repository.branch.as_deref(), Some("main"));
        assert_eq!(
            runner.calls(),
            vec![
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec![
                        "symbolic-ref".to_string(),
                        "--quiet".to_string(),
                        "--short".to_string(),
                        "HEAD".to_string(),
                    ],
                },
            ]
        );
        fs::remove_dir_all(root).expect("temp repository directory is cleaned up");
    }

    #[test]
    fn git_repository_detection_maps_missing_git_to_a_typed_error() {
        let root = temp_test_dir("git-missing");
        let runner = MockGitRunner::new([Err(MockGitError::NotFound)]);

        let error = detect_git_repository_with(&runner, &root)
            .expect_err("missing Git should explain why detection cannot run");

        assert_eq!(error.code, "git.not_installed");
        assert_eq!(
            error.message,
            "Git is not installed or is unavailable on PATH."
        );
        assert!(error.details.is_some());
        fs::remove_dir_all(root).expect("temp missing-Git directory is cleaned up");
    }

    #[test]
    fn git_repository_initialization_uses_fixed_commands_then_returns_the_repository() {
        let root = temp_test_dir("git-initialize");
        let runner = MockGitRunner::new([
            // The initial repository check sees an ordinary folder.
            Ok(git_output(false, Some(128), "", "not a repository")),
            // Initialization succeeds without accepting workspace-controlled arguments.
            Ok(git_output(true, Some(0), "", "")),
            // Detection after initialization returns the new repository state.
            Ok(git_output(true, Some(0), "true", "")),
            Ok(git_output(true, Some(0), "main", "")),
        ]);

        let repository = initialize_git_repository_with(&runner, &root)
            .expect("Git initialization should return the new repository");

        assert!(repository.is_repository);
        assert_eq!(repository.branch.as_deref(), Some("main"));
        assert_eq!(
            runner.calls(),
            vec![
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec!["init".to_string(), "--quiet".to_string()],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec![
                        "symbolic-ref".to_string(),
                        "--quiet".to_string(),
                        "--short".to_string(),
                        "HEAD".to_string(),
                    ],
                },
            ]
        );
        fs::remove_dir_all(root).expect("temp initialization directory is cleaned up");
    }

    #[test]
    fn git_repository_initialization_returns_existing_repositories_without_running_init() {
        let root = temp_test_dir("git-initialize-existing");
        let runner = MockGitRunner::new([
            Ok(git_output(true, Some(0), "true", "")),
            Ok(git_output(true, Some(0), "main", "")),
        ]);

        let repository = initialize_git_repository_with(&runner, &root)
            .expect("existing repository should remain unchanged");

        assert!(repository.is_repository);
        assert_eq!(repository.branch.as_deref(), Some("main"));
        assert_eq!(
            runner.calls(),
            vec![
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec!["rev-parse".to_string(), "--is-inside-work-tree".to_string()],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec![
                        "symbolic-ref".to_string(),
                        "--quiet".to_string(),
                        "--short".to_string(),
                        "HEAD".to_string(),
                    ],
                },
            ]
        );
        fs::remove_dir_all(root).expect("temp existing-repository directory is cleaned up");
    }

    #[test]
    fn git_repository_initialization_maps_runner_and_git_failures_to_typed_errors() {
        let root = temp_test_dir("git-initialize-errors");
        let missing_git = MockGitRunner::new([
            Ok(git_output(false, Some(128), "", "not a repository")),
            Err(MockGitError::NotFound),
        ]);

        let missing_error = initialize_git_repository_with(&missing_git, &root)
            .expect_err("missing Git while initializing should be explicit");
        assert_eq!(missing_error.code, "git.not_installed");

        let timed_out = MockGitRunner::new([
            Ok(git_output(false, Some(128), "", "not a repository")),
            Err(MockGitError::TimedOut),
        ]);
        let timeout_error = initialize_git_repository_with(&timed_out, &root)
            .expect_err("timed out Git initialization should be explicit");
        assert_eq!(timeout_error.code, "git.command_timeout");

        let rejected = MockGitRunner::new([
            Ok(git_output(false, Some(128), "", "not a repository")),
            Ok(git_output(false, Some(2), "", "init rejected")),
        ]);
        let rejected_error = initialize_git_repository_with(&rejected, &root)
            .expect_err("failed Git initialization should be explicit");
        assert_eq!(rejected_error.code, "git.command_failed");
        assert!(rejected_error
            .details
            .unwrap_or_default()
            .contains("initialize the workspace Git repository"));

        fs::remove_dir_all(root).expect("temp initialization-error directory is cleaned up");
    }

    #[test]
    fn git_status_uses_fixed_nul_delimited_porcelain_and_parses_all_path_kinds() {
        let root = temp_test_dir("git-status-mock");
        let runner = MockGitRunner::new([Ok(git_output(
            true,
            Some(0),
            // Rename and copy each include their source path after the
            // destination in porcelain v1's NUL-delimited form.
            " M modified.md\0A  staged.md\0?? untracked.md\0R  renamed.md\0old-name.md\0C  copied.md\0source.md\0",
            "",
        ))]);

        let entries = git_status_with(&runner, &root).expect("status parses");

        assert_eq!(
            entries,
            vec![
                GitStatusEntry {
                    path: "copied.md".to_string(),
                    index_status: "C".to_string(),
                    worktree_status: " ".to_string(),
                },
                GitStatusEntry {
                    path: "modified.md".to_string(),
                    index_status: " ".to_string(),
                    worktree_status: "M".to_string(),
                },
                GitStatusEntry {
                    path: "renamed.md".to_string(),
                    index_status: "R".to_string(),
                    worktree_status: " ".to_string(),
                },
                GitStatusEntry {
                    path: "staged.md".to_string(),
                    index_status: "A".to_string(),
                    worktree_status: " ".to_string(),
                },
                GitStatusEntry {
                    path: "untracked.md".to_string(),
                    index_status: "?".to_string(),
                    worktree_status: "?".to_string(),
                },
            ]
        );
        assert_eq!(
            runner.calls(),
            vec![GitCall {
                working_dir: Some(root.clone()),
                args: vec![
                    "status".to_string(),
                    "--porcelain=v1".to_string(),
                    "-z".to_string(),
                    "--untracked-files=all".to_string(),
                ],
            }]
        );

        fs::remove_dir_all(root).expect("temp mock status directory is cleaned up");
    }

    #[test]
    fn git_status_rejects_malformed_porcelain_with_a_typed_error() {
        let root = temp_test_dir("git-status-malformed");
        let runner = MockGitRunner::new([Ok(git_output(true, Some(0), "malformed\0", ""))]);

        let error = git_status_with(&runner, &root).expect_err("invalid output is rejected");

        assert_eq!(error.code, "git.command_failed");
        assert!(error
            .details
            .unwrap_or_default()
            .contains("invalid porcelain v1 output"));
        fs::remove_dir_all(root).expect("temp malformed status directory is cleaned up");
    }

    #[test]
    fn git_index_updates_use_validated_paths_and_fixed_commands() {
        let root = temp_test_dir("git-index-mock");
        let runner = MockGitRunner::new([
            Ok(git_output(true, Some(0), "", "")),
            Ok(git_output(true, Some(0), "", "")),
        ]);
        let paths = vec!["Notes\\draft.md".to_string(), "todo.md".to_string()];

        stage_git_files_with(&runner, &root, &paths).expect("files stage");
        unstage_git_files_with(&runner, &root, &paths).expect("files unstage");

        assert_eq!(
            runner.calls(),
            vec![
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec![
                        "add".to_string(),
                        "--".to_string(),
                        "Notes/draft.md".to_string(),
                        "todo.md".to_string(),
                    ],
                },
                GitCall {
                    working_dir: Some(root.clone()),
                    args: vec![
                        "reset".to_string(),
                        "--".to_string(),
                        "Notes/draft.md".to_string(),
                        "todo.md".to_string(),
                    ],
                },
            ]
        );

        let invalid = MockGitRunner::new([]);
        let error = stage_git_files_with(&invalid, &root, &["../outside.md".to_string()])
            .expect_err("paths outside the workspace are rejected");
        assert_eq!(error.code, "workspace.invalid_path");
        assert!(invalid.calls().is_empty());

        fs::remove_dir_all(root).expect("temp index workspace is cleaned up");
    }

    #[test]
    fn git_runner_errors_and_details_are_typed_and_bounded() {
        let root = temp_test_dir("git-timeout");
        let runner = MockGitRunner::new([Err(MockGitError::TimedOut)]);

        let error = detect_git_repository_with(&runner, &root)
            .expect_err("timed out Git detection should fail loudly");

        assert_eq!(error.code, "git.command_timeout");
        assert!(error
            .details
            .unwrap_or_default()
            .contains("detect the workspace"));
        assert_eq!(bounded_git_text(&"x".repeat(4_097)).chars().count(), 4_097);
        fs::remove_dir_all(root).expect("temp timeout directory is cleaned up");
    }

    #[test]
    fn git_io_failures_are_reported_as_command_failures() {
        let runner = MockGitRunner::new([Err(MockGitError::Io)]);

        let error = git_availability_with(&runner).expect_err("I/O error should not be hidden");

        assert_eq!(error.code, "git.command_failed");
        assert!(error
            .details
            .unwrap_or_default()
            .contains("check the installed Git version"));
    }

    #[test]
    fn system_git_detects_a_temp_non_repo_and_repo_when_git_is_available() {
        let runner = SystemGitRunner;
        let availability = git_availability_with(&runner).expect("Git availability command runs");

        // CI environments without Git still exercise all behavior through the
        // injected-runner tests above. This integration assertion runs only
        // when the host can safely create an isolated temporary repository.
        if !availability.available {
            return;
        }

        let root = temp_test_dir("system-git-repository");
        let non_repository =
            detect_git_repository_with(&runner, &root).expect("non-repository detection succeeds");
        assert!(!non_repository.is_repository);

        let initialized = Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .stdin(std::process::Stdio::null())
            .output()
            .expect("Git initializes the isolated temporary repository");
        assert!(
            initialized.status.success(),
            "git init failed: {}",
            String::from_utf8_lossy(&initialized.stderr)
        );

        let repository =
            detect_git_repository_with(&runner, &root).expect("repository detection succeeds");
        assert!(repository.is_repository);
        assert!(repository.branch.is_some());

        fs::remove_dir_all(root).expect("temporary Git repository is cleaned up");
    }

    #[test]
    fn system_git_initializes_an_isolated_workspace_when_available() {
        let runner = SystemGitRunner;
        let availability = git_availability_with(&runner).expect("Git availability command runs");

        if !availability.available {
            return;
        }

        let root = temp_test_dir("system-git-initialization");
        let repository = initialize_git_repository_with(&runner, &root)
            .expect("Git initializes an isolated temporary workspace");
        assert!(repository.is_repository);
        assert!(root.join(".git").is_dir());

        let repeat = initialize_git_repository_with(&runner, &root)
            .expect("repeated initialization is idempotent");
        assert!(repeat.is_repository);

        fs::remove_dir_all(root).expect("temporary initialized repository is cleaned up");
    }

    #[test]
    fn system_git_stages_and_unstages_an_unborn_repository_when_available() {
        let runner = SystemGitRunner;
        let availability = git_availability_with(&runner).expect("Git availability command runs");

        if !availability.available {
            return;
        }

        let root = temp_test_dir("system-git-stage-unstage");
        initialize_git_repository_with(&runner, &root).expect("Git initializes the workspace");
        fs::write(root.join("draft.md"), "draft\n").expect("draft file is written");

        stage_git_files_with(&runner, &root, &["draft.md".to_string()]).expect("new file stages");
        let staged = git_status_with(&runner, &root).expect("staged status is available");
        assert_eq!(
            staged,
            vec![GitStatusEntry {
                path: "draft.md".to_string(),
                index_status: "A".to_string(),
                worktree_status: " ".to_string(),
            }]
        );

        unstage_git_files_with(&runner, &root, &["draft.md".to_string()])
            .expect("new file unstages without a HEAD commit");
        let unstaged = git_status_with(&runner, &root).expect("unstaged status is available");
        assert_eq!(
            unstaged,
            vec![GitStatusEntry {
                path: "draft.md".to_string(),
                index_status: "?".to_string(),
                worktree_status: "?".to_string(),
            }]
        );

        fs::remove_dir_all(root).expect("temporary stage workspace is cleaned up");
    }

    #[test]
    fn system_git_status_reports_staged_modified_and_untracked_paths_when_available() {
        let runner = SystemGitRunner;
        let availability = git_availability_with(&runner).expect("Git availability command runs");

        if !availability.available {
            return;
        }

        let root = temp_test_dir("system-git-status");
        let initialize = Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .stdin(std::process::Stdio::null())
            .output()
            .expect("Git initializes the isolated temporary repository");
        assert!(
            initialize.status.success(),
            "git init failed: {}",
            String::from_utf8_lossy(&initialize.stderr)
        );

        fs::write(root.join("modified.md"), "before\n").expect("baseline file is written");
        let add_baseline = Command::new("git")
            .args(["add", "modified.md"])
            .current_dir(&root)
            .stdin(std::process::Stdio::null())
            .output()
            .expect("baseline file stages");
        assert!(add_baseline.status.success());
        let commit = Command::new("git")
            .args([
                "-c",
                "user.name=Thinkbrain Tests",
                "-c",
                "user.email=tests@thinkbrain.invalid",
                "commit",
                "--quiet",
                "-m",
                "baseline",
            ])
            .current_dir(&root)
            .stdin(std::process::Stdio::null())
            .output()
            .expect("baseline commit succeeds");
        assert!(
            commit.status.success(),
            "git commit failed: {}",
            String::from_utf8_lossy(&commit.stderr)
        );

        fs::write(root.join("modified.md"), "after\n").expect("tracked file is modified");
        fs::write(root.join("staged.md"), "staged\n").expect("staged file is written");
        let add_staged = Command::new("git")
            .args(["add", "staged.md"])
            .current_dir(&root)
            .stdin(std::process::Stdio::null())
            .output()
            .expect("staged file stages");
        assert!(add_staged.status.success());
        fs::write(root.join("untracked.md"), "untracked\n").expect("untracked file is written");

        let entries = git_status_with(&runner, &root).expect("Git status succeeds");

        assert_eq!(
            entries,
            vec![
                GitStatusEntry {
                    path: "modified.md".to_string(),
                    index_status: " ".to_string(),
                    worktree_status: "M".to_string(),
                },
                GitStatusEntry {
                    path: "staged.md".to_string(),
                    index_status: "A".to_string(),
                    worktree_status: " ".to_string(),
                },
                GitStatusEntry {
                    path: "untracked.md".to_string(),
                    index_status: "?".to_string(),
                    worktree_status: "?".to_string(),
                },
            ]
        );

        fs::remove_dir_all(root).expect("temporary Git status repository is cleaned up");
    }

    #[test]
    fn native_error_shape_supports_optional_details() {
        let error = NativeError::with_details(
            "desktop.test_failure",
            "The test error is shaped consistently.",
            "extra context",
        );

        assert_eq!(error.code, "desktop.test_failure");
        assert_eq!(error.message, "The test error is shaped consistently.");
        assert_eq!(error.details.as_deref(), Some("extra context"));
    }

    #[test]
    fn relative_paths_are_normalized_for_frontend_use() {
        assert_eq!(
            normalize_relative_path("folder\\note.md").expect("path should normalize"),
            "folder/note.md"
        );
    }

    #[test]
    fn relative_paths_reject_workspace_escape() {
        let error = normalize_relative_path("../note.md").expect_err("path should be rejected");

        assert_eq!(error.code, "workspace.invalid_path");
    }

    #[test]
    fn markdown_path_detection_accepts_markdown_extensions() {
        assert!(is_markdown_path(Path::new("note.md")));
        assert!(is_markdown_path(Path::new("note.MARKDOWN")));
        assert!(!is_markdown_path(Path::new("note.txt")));
    }

    #[test]
    fn hidden_entries_are_dot_prefixed() {
        assert!(super::is_hidden_name(".git"));
        assert!(super::is_hidden_name(".obsidian"));
        assert!(!super::is_hidden_name("Notes"));
        assert!(!super::is_hidden_name("note.md"));
    }

    #[test]
    fn search_matches_filename_body_tags_and_aliases() {
        let mut connection = in_memory_index();
        index_document_records(
            &mut connection,
            &[
                record(
                    "projects/roadmap.md",
                    "roadmap.md",
                    Some("Quarterly Roadmap"),
                    &["planning", "project"],
                    &["Q3 Plan"],
                    "Ship the indexer and search experience this quarter.",
                ),
                record(
                    "daily/inbox.md",
                    "inbox.md",
                    Some("Inbox"),
                    &["capture"],
                    &[],
                    "Loose notes about kombucha brewing.",
                ),
            ],
        )
        .expect("documents index");

        // Filename match.
        assert_eq!(
            result_paths(&connection, "roadmap"),
            vec!["projects/roadmap.md"]
        );
        // Body match.
        assert_eq!(
            result_paths(&connection, "kombucha"),
            vec!["daily/inbox.md"]
        );
        // Tag match.
        assert_eq!(
            result_paths(&connection, "planning"),
            vec!["projects/roadmap.md"]
        );
        // Alias match.
        assert_eq!(result_paths(&connection, "Q3"), vec!["projects/roadmap.md"]);
        // Title match.
        assert_eq!(
            result_paths(&connection, "quarterly"),
            vec!["projects/roadmap.md"]
        );
    }

    #[test]
    fn search_supports_prefix_matching_for_type_ahead() {
        let mut connection = in_memory_index();
        index_document_records(
            &mut connection,
            &[record(
                "notes/linguistics.md",
                "linguistics.md",
                None,
                &[],
                &[],
                "Phonology and morphology overview.",
            )],
        )
        .expect("document indexes");

        assert_eq!(
            result_paths(&connection, "ling"),
            vec!["notes/linguistics.md"]
        );
        assert_eq!(
            result_paths(&connection, "phon"),
            vec!["notes/linguistics.md"]
        );
    }

    #[test]
    fn rebuild_replaces_previous_index_contents() {
        let mut connection = in_memory_index();
        index_document_records(
            &mut connection,
            &[record(
                "old.md",
                "old.md",
                None,
                &[],
                &[],
                "obsolete content",
            )],
        )
        .expect("first index");

        clear_documents(&connection).expect("index clears");
        index_document_records(
            &mut connection,
            &[record("new.md", "new.md", None, &[], &[], "fresh content")],
        )
        .expect("rebuild");

        assert!(result_paths(&connection, "obsolete").is_empty());
        assert_eq!(result_paths(&connection, "fresh"), vec!["new.md"]);
    }

    #[test]
    fn deleting_a_document_removes_it_from_search() {
        let mut connection = in_memory_index();
        index_document_records(
            &mut connection,
            &[record(
                "removable.md",
                "removable.md",
                None,
                &[],
                &[],
                "delete me",
            )],
        )
        .expect("document indexes");

        delete_document(&connection, "removable.md").expect("document deletes");

        assert!(result_paths(&connection, "delete").is_empty());
    }

    #[test]
    fn malformed_and_empty_queries_do_not_panic_or_error() {
        let mut connection = in_memory_index();
        index_document_records(
            &mut connection,
            &[record(
                "safe.md",
                "safe.md",
                None,
                &[],
                &[],
                "harmless body text",
            )],
        )
        .expect("document indexes");

        // Empty / whitespace-only input yields no results without touching SQLite.
        assert!(build_fts_match_query("   ").is_none());
        assert!(search_documents(&connection, "", 50)
            .expect("empty query is safe")
            .is_empty());

        // FTS5 special syntax must be neutralized rather than raising an error.
        for malformed in ["\"", "*", "AND OR", "tag:", "(unbalanced", "a -b \"c"] {
            search_documents(&connection, malformed, 50)
                .unwrap_or_else(|error| panic!("query {malformed:?} should not error: {error}"));
        }
    }

    #[test]
    fn workspace_hash_is_stable_and_path_specific() {
        assert_eq!(
            stable_workspace_hash("/home/user/vault"),
            stable_workspace_hash("/home/user/vault")
        );
        assert_ne!(
            stable_workspace_hash("/home/user/vault"),
            stable_workspace_hash("/home/user/other-vault")
        );
    }

    #[test]
    fn settings_paths_stay_under_app_data() {
        let app_data_dir = PathBuf::from("/tmp/thinkbrain-app-data");
        let workspace_root = PathBuf::from("/tmp/user-vault");

        let app_path = app_settings_path(&app_data_dir);
        let workspace_path = workspace_settings_path(&app_data_dir, &workspace_root);
        let expected_workspace_file_name = format!(
            "workspace-{:016x}.json",
            stable_workspace_hash(&workspace_root.to_string_lossy())
        );

        assert_eq!(app_path, app_data_dir.join("settings").join("app.json"));
        assert!(workspace_path.starts_with(app_data_dir.join("settings")));
        assert!(!workspace_path.starts_with(&workspace_root));
        assert_eq!(
            workspace_path.file_name().and_then(|name| name.to_str()),
            Some(expected_workspace_file_name.as_str())
        );
    }

    #[test]
    fn settings_read_returns_none_when_file_is_absent() {
        let settings_path = temp_test_dir("missing").join("settings").join("app.json");

        assert_eq!(
            read_settings_file(&settings_path).expect("missing settings read succeeds"),
            None
        );
    }

    #[test]
    fn settings_write_creates_parent_directory_and_round_trips() {
        let temp_dir = temp_test_dir("write");
        let settings_path = temp_dir.join("settings").join("app.json");
        let contents = "{\n  \"version\": 1\n}\n";

        write_settings_file(&settings_path, contents).expect("settings write succeeds");

        assert_eq!(
            read_settings_file(&settings_path).expect("settings read succeeds"),
            Some(contents.to_string())
        );

        fs::remove_dir_all(temp_dir).expect("temp settings directory is cleaned up");
    }

    #[test]
    fn create_workspace_file_creates_missing_parents_and_writes_contents() {
        let root = temp_test_dir("create-file");
        let entry = create_workspace_file(
            root.to_string_lossy().to_string(),
            "Notes/welcome.md".to_string(),
            Some("# Hello".to_string()),
        )
        .expect("workspace file is created");

        assert_eq!(entry.name, "welcome.md");
        assert_eq!(entry.parent_path, "Notes");
        assert_eq!(entry.kind, "file");
        assert!(entry.is_markdown);
        assert_eq!(
            fs::read_to_string(root.join("Notes").join("welcome.md")).expect("file is readable"),
            "# Hello"
        );

        // A second create at the same path fails loudly so the UI can surface it.
        let conflict = create_workspace_file(
            root.to_string_lossy().to_string(),
            "Notes/welcome.md".to_string(),
            None,
        );
        assert!(conflict.is_err());
        assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");
        assert_eq!(
            fs::read_to_string(root.join("Notes").join("welcome.md"))
                .expect("existing file is unchanged"),
            "# Hello"
        );

        fs::remove_dir_all(root).expect("temp create-file directory is cleaned up");
    }

    #[test]
    fn create_workspace_folder_creates_nested_directories() {
        let root = temp_test_dir("create-folder");
        let entry = create_workspace_folder(
            root.to_string_lossy().to_string(),
            "Archive/2024/January".to_string(),
        )
        .expect("workspace folder is created");

        assert_eq!(entry.kind, "directory");
        assert_eq!(entry.relative_path, "Archive/2024/January");
        assert!(root.join("Archive").join("2024").join("January").is_dir());

        let conflict = create_workspace_folder(
            root.to_string_lossy().to_string(),
            "Archive/2024/January".to_string(),
        );
        assert!(conflict.is_err());
        assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");

        fs::remove_dir_all(root).expect("temp create-folder directory is cleaned up");
    }

    #[test]
    fn rename_workspace_entry_moves_files_and_creates_destination_parents() {
        let root = temp_test_dir("rename-entry");
        create_workspace_file(
            root.to_string_lossy().to_string(),
            "draft.md".to_string(),
            Some("body".to_string()),
        )
        .expect("source file is created");

        let renamed = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "draft.md".to_string(),
            "Archive/draft.md".to_string(),
        )
        .expect("rename succeeds");

        assert_eq!(renamed.relative_path, "Archive/draft.md");
        assert!(!root.join("draft.md").exists());
        assert!(root.join("Archive").join("draft.md").is_file());

        // Renaming a missing entry fails loudly.
        let missing = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "ghost.md".to_string(),
            "Archive/ghost.md".to_string(),
        );
        assert!(missing.is_err());
        assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

        // Renaming onto an existing entry fails loudly.
        create_workspace_file(
            root.to_string_lossy().to_string(),
            "other.md".to_string(),
            None,
        )
        .expect("destination file is created");
        let collision = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "Archive/draft.md".to_string(),
            "other.md".to_string(),
        );
        assert!(collision.is_err());
        assert_eq!(collision.unwrap_err().code, "workspace.file_exists");

        fs::remove_dir_all(root).expect("temp rename-entry directory is cleaned up");
    }

    #[test]
    fn delete_workspace_entry_removes_files_and_folders_recursively() {
        let root = temp_test_dir("delete-entry");
        create_workspace_file(
            root.to_string_lossy().to_string(),
            "Folder/nested.md".to_string(),
            Some("body".to_string()),
        )
        .expect("nested file is created");

        delete_workspace_entry(root.to_string_lossy().to_string(), "Folder".to_string())
            .expect("folder is deleted recursively");

        assert!(!root.join("Folder").exists());

        let missing =
            delete_workspace_entry(root.to_string_lossy().to_string(), "Folder".to_string());
        assert!(missing.is_err());
        assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

        fs::remove_dir_all(root).expect("temp delete-entry directory is cleaned up");
    }

    #[test]
    fn workspace_entry_commands_reject_paths_that_escape_the_workspace_root() {
        let root = temp_test_dir("entry-escape");

        let create_file_escape = create_workspace_file(
            root.to_string_lossy().to_string(),
            "../outside.md".to_string(),
            None,
        );
        assert!(create_file_escape.is_err());
        assert_eq!(
            create_file_escape.unwrap_err().code,
            "workspace.invalid_path"
        );

        let create_folder_escape =
            create_workspace_folder(root.to_string_lossy().to_string(), "../outside".to_string());
        assert!(create_folder_escape.is_err());
        assert_eq!(
            create_folder_escape.unwrap_err().code,
            "workspace.invalid_path"
        );

        let rename_source_escape = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "../outside.md".to_string(),
            "renamed.md".to_string(),
        );
        assert!(rename_source_escape.is_err());
        assert_eq!(
            rename_source_escape.unwrap_err().code,
            "workspace.invalid_path"
        );

        fs::write(root.join("source.md"), "body").expect("rename source is created");
        let rename_destination_escape = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "source.md".to_string(),
            "../outside.md".to_string(),
        );
        assert!(rename_destination_escape.is_err());
        assert_eq!(
            rename_destination_escape.unwrap_err().code,
            "workspace.invalid_path"
        );
        assert!(root.join("source.md").exists());

        let delete_escape = delete_workspace_entry(
            root.to_string_lossy().to_string(),
            "../outside.md".to_string(),
        );
        assert!(delete_escape.is_err());
        assert_eq!(delete_escape.unwrap_err().code, "workspace.invalid_path");

        fs::remove_dir_all(root).expect("temp entry-escape directory is cleaned up");
    }

    #[cfg(unix)]
    #[test]
    fn workspace_entry_commands_reject_symlink_escapes_via_canonicalization() {
        use std::os::unix::fs::symlink;

        let root = temp_test_dir("entry-symlink");
        let outside = temp_test_dir("entry-symlink-outside");
        symlink(&outside, root.join("escape")).expect("symlink is created");

        // Creating a file through the symlink would write outside the workspace.
        let attempt = create_workspace_file(
            root.to_string_lossy().to_string(),
            "escape/stolen.md".to_string(),
            None,
        );
        assert!(attempt.is_err());
        assert_eq!(attempt.unwrap_err().code, "workspace.invalid_path");
        assert!(!outside.join("stolen.md").exists());

        // Deleting through the symlink would delete outside the workspace.
        fs::write(outside.join("target.md"), "body").expect("outside file is created");
        let delete_attempt = delete_workspace_entry(
            root.to_string_lossy().to_string(),
            "escape/target.md".to_string(),
        );
        assert!(delete_attempt.is_err());
        assert_eq!(delete_attempt.unwrap_err().code, "workspace.invalid_path");
        assert!(outside.join("target.md").exists());

        fs::remove_dir_all(root).expect("temp symlink root is cleaned up");
        fs::remove_dir_all(outside).expect("temp symlink outside directory is cleaned up");
    }

    #[test]
    fn rename_workspace_entry_treats_source_equal_destination_as_a_noop() {
        let root = temp_test_dir("rename-noop");
        create_workspace_file(
            root.to_string_lossy().to_string(),
            "draft.md".to_string(),
            Some("body".to_string()),
        )
        .expect("source file is created");

        // Same relative path on both sides: succeed without touching the file.
        let result = rename_workspace_entry(
            root.to_string_lossy().to_string(),
            "draft.md".to_string(),
            "draft.md".to_string(),
        )
        .expect("no-op rename succeeds");
        assert_eq!(result.relative_path, "draft.md");
        assert_eq!(
            fs::read_to_string(root.join("draft.md")).expect("file is unchanged"),
            "body"
        );

        fs::remove_dir_all(root).expect("temp rename-noop directory is cleaned up");
    }
}
