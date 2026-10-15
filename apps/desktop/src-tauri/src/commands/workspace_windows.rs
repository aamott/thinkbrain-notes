//! Workspace window lifecycle and shell commands.
//!
//! Creates windows off the main thread, records the root each was launched
//! for in the workspace session table, and grants vault asset scope.

use crate::commands::markdown::{MarkdownFileEntry, list_markdown_file_entries};
use crate::commands::workspace_session;
use crate::error::{NativeError, failed};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Manager;

use super::workspace_paths::{WorkspaceDescriptor, describe_workspace, resolve_workspace_root};

static WORKSPACE_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub fn next_workspace_window_label() -> String {
    format!(
        "workspace-{}",
        WORKSPACE_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
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

pub(crate) fn create_workspace_window_off_main_thread(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let label = next_workspace_window_label();
    let root_path = root.to_string_lossy().into_owned();
    // Register the root before build so the frontend's first
    // `window_workspace_root` call cannot race past registration.
    workspace_session::register_launch(label.clone(), root_path);
    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(describe_workspace(&root).name)
            .build()
            .map_err(|error| {
                workspace_session::unregister_launch(&label);
                failed(
                    "workspace.window_failed",
                    "Failed to create a workspace window.",
                    error,
                )
            })?;
    // Releasing the window's session holdings on destroy also drops this
    // launch record.
    crate::commands::watcher::attach_window_destroy_cleanup(&window, label);
    Ok(())
}

#[tauri::command]
pub async fn open_workspace_window(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<(), NativeError> {
    create_workspace_window_off_main_thread(app, root_path)
}

#[tauri::command]
pub fn window_workspace_root(window: tauri::WebviewWindow) -> Option<String> {
    workspace_session::launched_root(window.label())
}
