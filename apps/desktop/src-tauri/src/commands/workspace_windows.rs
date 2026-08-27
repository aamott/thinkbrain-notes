//! Workspace window lifecycle and shell commands.
//!
//! Maps window labels to roots, creates windows off the main thread, grants
//! vault asset scope, and cleans up roots/watchers on destroy.

use crate::commands::markdown::{MarkdownFileEntry, list_markdown_file_entries};
use crate::error::{NativeError, failed, lock_or_recover};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};
use tauri::Manager;

use super::workspace_paths::{WorkspaceDescriptor, describe_workspace, resolve_workspace_root};

#[derive(Default)]
pub struct WorkspaceWindowRoots(Mutex<HashMap<String, String>>);

static WORKSPACE_WINDOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub fn next_workspace_window_label() -> String {
    format!(
        "workspace-{}",
        WORKSPACE_WINDOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

pub fn register_workspace_window_root(
    roots: &WorkspaceWindowRoots,
    label: String,
    root_path: String,
) {
    lock_or_recover(&roots.0).insert(label, root_path);
}

pub fn workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) -> Option<String> {
    lock_or_recover(&roots.0).get(label).cloned()
}

pub fn unregister_workspace_window_root(roots: &WorkspaceWindowRoots, label: &str) {
    lock_or_recover(&roots.0).remove(label);
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShellStatus {
    pub app_name: String,
    pub shell_version: String,
    pub ready: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
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

pub(crate) fn create_workspace_window_off_main_thread(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<(), NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let label = next_workspace_window_label();
    let root_path = root.to_string_lossy().into_owned();
    // Register the root before build so the frontend's first
    // `window_workspace_root` call cannot race past registration.
    register_workspace_window_root(
        &app.state::<WorkspaceWindowRoots>(),
        label.clone(),
        root_path,
    );
    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            .title(describe_workspace(&root).name)
            .build()
            .map_err(|error| {
                unregister_workspace_window_root(&app.state::<WorkspaceWindowRoots>(), &label);
                failed(
                    "workspace.window_failed",
                    "Failed to create a workspace window.",
                    error,
                )
            })?;
    let app_for_cleanup = app.clone();
    let label_for_cleanup = label.clone();
    // Workspace windows need both their `WorkspaceWindowRoots` entry and their
    // file watchers cleaned up on destroy. The watcher module owns the destroy
    // policy; the extra closure handles the workspace-specific half.
    crate::commands::watcher::attach_window_destroy_cleanup(
        &window,
        label,
        Some(move || {
            unregister_workspace_window_root(
                &app_for_cleanup.state::<WorkspaceWindowRoots>(),
                &label_for_cleanup,
            );
        }),
    );
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
pub fn window_workspace_root(
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
) -> Option<String> {
    workspace_window_root(&roots, window.label())
}
