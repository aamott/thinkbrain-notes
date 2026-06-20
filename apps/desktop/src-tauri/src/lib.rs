use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

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

#[tauri::command]
fn list_markdown_files(root_path: String) -> Result<Vec<MarkdownFileEntry>, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    list_markdown_file_entries(&root)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_shell_status,
            open_workspace,
            list_markdown_files,
            read_markdown_file,
            write_markdown_file,
            create_markdown_file,
            rename_markdown_file,
            delete_markdown_file
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

fn normalize_relative_path(relative_path: &str) -> Result<String, NativeError> {
    let path = Path::new(relative_path);

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

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::{desktop_shell_status, is_markdown_path, normalize_relative_path, NativeError};
    use std::path::Path;

    #[test]
    fn shell_status_reports_ready_desktop_shell() {
        let status = desktop_shell_status().expect("shell status should succeed");

        assert_eq!(status.app_name, "Thinkbrain Notes");
        assert_eq!(status.shell_version, env!("CARGO_PKG_VERSION"));
        assert!(status.ready);
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
}
