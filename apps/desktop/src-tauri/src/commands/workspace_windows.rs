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

/// The smallest label already showing `root`, so duplicate opens focus rather
/// than spawn. `exclude_label` skips the caller's own window.
pub fn window_for_root(
    roots: &WorkspaceWindowRoots,
    root: &str,
    exclude_label: Option<&str>,
) -> Option<String> {
    lock_or_recover(&roots.0)
        .iter()
        .filter(|(label, path)| path.as_str() == root && Some(label.as_str()) != exclude_label)
        .map(|(label, _)| label.clone())
        .min()
}

/// Every root another window shows — for the manager's "open elsewhere" badge.
/// The caller's own root is excluded; results are sorted and deduped.
pub fn roots_open_elsewhere(roots: &WorkspaceWindowRoots, label: &str) -> Vec<String> {
    let mut roots_elsewhere: Vec<String> = lock_or_recover(&roots.0)
        .iter()
        .filter(|(other_label, _)| other_label.as_str() != label)
        .map(|(_, path)| path.clone())
        .collect();
    roots_elsewhere.sort();
    roots_elsewhere.dedup();
    roots_elsewhere
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSnapshot {
    pub workspace: WorkspaceDescriptor,
    pub files: Vec<MarkdownFileEntry>,
}

#[tauri::command]
pub fn open_workspace(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
    root_path: String,
) -> Result<WorkspaceSnapshot, NativeError> {
    let root = resolve_workspace_root(&root_path)?;

    // Register the caller's root so `open_workspace_window` can focus this
    // window later instead of duplicating it. Overwriting keeps in-window
    // switches correct, and the main window — created before any command
    // runs — is covered the moment it opens a workspace.
    register_workspace_window_root(
        &roots,
        window.label().to_string(),
        root.to_string_lossy().into_owned(),
    );

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

/// What `open_workspace_window` did: spawned a window or focused an existing one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenWorkspaceWindowOutcome {
    Opened,
    Focused,
}

/// Opens a window for `root_path`, or focuses the window already showing it.
///
/// `exclude_label` is the calling window: a match there means the caller
/// already shows the root, so it is focused rather than spawning a window that
/// sits on top of itself. A registered label with no live window is stale —
/// it is unregistered and a fresh window is created.
pub(crate) fn open_or_focus_workspace_window(
    app: tauri::AppHandle,
    root_path: String,
    exclude_label: Option<&str>,
) -> Result<OpenWorkspaceWindowOutcome, NativeError> {
    let root = resolve_workspace_root(&root_path)?;
    let canonical = root.to_string_lossy().into_owned();
    let roots = app.state::<WorkspaceWindowRoots>();
    let mut focus_label = window_for_root(&roots, &canonical, exclude_label);
    if focus_label.is_none()
        && exclude_label.is_some_and(|caller| {
            workspace_window_root(&roots, caller).as_deref() == Some(&canonical)
        })
    {
        focus_label = exclude_label.map(str::to_string);
    }
    if let Some(label) = focus_label {
        if let Some(target) = app.get_webview_window(&label) {
            // Best-effort chrome calls: a failure to unminimize still leaves a
            // focused existing window, which beats spawning a duplicate.
            if let Err(error) = target.unminimize() {
                eprintln!("[workspace] failed to unminimize {label}: {error}");
            }
            if let Err(error) = target.show() {
                eprintln!("[workspace] failed to show {label}: {error}");
            }
            if let Err(error) = target.set_focus() {
                eprintln!("[workspace] failed to focus {label}: {error}");
            }
            return Ok(OpenWorkspaceWindowOutcome::Focused);
        }
        unregister_workspace_window_root(&roots, &label);
    }
    create_workspace_window_off_main_thread(app, canonical)?;
    Ok(OpenWorkspaceWindowOutcome::Opened)
}

#[tauri::command]
pub async fn open_workspace_window(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    root_path: String,
) -> Result<OpenWorkspaceWindowOutcome, NativeError> {
    open_or_focus_workspace_window(app, root_path, Some(window.label()))
}

#[tauri::command]
pub fn open_workspace_roots_elsewhere(
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
) -> Vec<String> {
    roots_open_elsewhere(&roots, window.label())
}

#[tauri::command]
pub fn window_workspace_root(
    window: tauri::WebviewWindow,
    roots: tauri::State<WorkspaceWindowRoots>,
) -> Option<String> {
    workspace_window_root(&roots, window.label())
}
