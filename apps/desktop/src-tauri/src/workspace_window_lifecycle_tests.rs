//! Pure-Rust workspace-window lifecycle tests.
//!
//! Real webview creation still requires a live Tauri runtime.

use crate::commands::workspace::{
    describe_workspace, next_workspace_window_label, open_workspace_window,
    register_workspace_window_root, resolve_workspace_root, unregister_workspace_window_root,
    workspace_window_root, WorkspaceWindowRoots,
};
use crate::tests::make_temp_test_dir;
use crate::NativeError;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

// Async-command guard

/// Compile-time guard against making this Windows-sensitive command synchronous.
#[test]
fn workspace_window_creation_command_is_async() {
    fn assert_async_command<F, Fut>(_command: F)
    where
        F: Fn(tauri::AppHandle, String) -> Fut,
        Fut: std::future::Future<Output = Result<(), NativeError>>,
    {
    }

    assert_async_command(open_workspace_window);
}

// Root registration scoping

/// Window labels isolate roots and cleanup.
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

fn temp_dir(name: &str) -> PathBuf {
    make_temp_test_dir(name, "window", true)
}

// Label generation

/// Labels stay unique under repeated allocation.
#[test]
fn workspace_window_labels_are_unique_and_prefixed() {
    let mut labels = Vec::with_capacity(64);
    for _ in 0..64 {
        labels.push(next_workspace_window_label());
    }

    let mut seen = std::collections::HashSet::new();
    for label in &labels {
        assert!(
            label.starts_with("workspace-"),
            "label {label:?} should be prefixed with 'workspace-'"
        );
        assert!(
            seen.insert(label.clone()),
            "label {label:?} was generated twice"
        );
    }
}

// Concurrent registry access

/// Concurrent command and destroy callbacks do not deadlock the registry.
#[test]
fn workspace_window_roots_survive_concurrent_register_and_unregister() {
    let roots = Arc::new(WorkspaceWindowRoots::default());
    let mut handles = Vec::new();

    for _ in 0..8 {
        let roots = Arc::clone(&roots);
        handles.push(thread::spawn(move || {
            for _ in 0..100 {
                let label = next_workspace_window_label();
                register_workspace_window_root(&roots, label.clone(), "/vault".to_string());
                let _ = workspace_window_root(&roots, &label);
                unregister_workspace_window_root(&roots, &label);
            }
        }));
    }

    for handle in handles {
        handle
            .join()
            .expect("concurrent root access must not deadlock");
    }
}

// Root path validation (runs before window creation)

/// Invalid paths fail before window registration.
#[test]
fn resolve_workspace_root_rejects_relative_paths() {
    let error =
        resolve_workspace_root("relative/path").expect_err("relative path should be rejected");

    assert_eq!(error.code, "workspace.invalid_root");
}

/// Missing roots return the stable open-failure code.
#[test]
fn resolve_workspace_root_rejects_nonexistent_paths() {
    let missing = std::env::temp_dir().join("thinkbrain-nonexistent-root-vault");
    assert!(!missing.exists());

    let error = resolve_workspace_root(&missing.to_string_lossy())
        .expect_err("nonexistent path should be rejected");

    assert_eq!(error.code, "workspace.open_failed");
}

/// Files cannot be workspace roots.
#[test]
fn resolve_workspace_root_rejects_files() {
    let dir = temp_dir("file-not-dir");
    let file_path = dir.join("note.md");
    fs::write(&file_path, "# hello").expect("file is written");

    let error = resolve_workspace_root(&file_path.to_string_lossy())
        .expect_err("a file should be rejected as a workspace root");

    assert_eq!(error.code, "workspace.not_directory");

    fs::remove_dir_all(dir).expect("temp directory is cleaned up");
}

/// Existing directories register by canonical path.
#[test]
fn resolve_workspace_root_canonicalizes_an_existing_directory() {
    let dir = temp_dir("valid-root");
    let resolved =
        resolve_workspace_root(&dir.to_string_lossy()).expect("existing directory resolves");

    assert_eq!(resolved, dir);

    fs::remove_dir_all(dir).expect("temp directory is cleaned up");
}

// Workspace naming (feeds the window title)

/// Window titles use the workspace folder name.
#[test]
fn describe_workspace_uses_the_folder_name_for_the_window_title() {
    let root = PathBuf::from("/home/user/My Notes");
    let descriptor = describe_workspace(&root);

    assert_eq!(descriptor.root_path, "/home/user/My Notes");
    assert_eq!(descriptor.name, "My Notes");
}

#[test]
fn describe_workspace_falls_back_to_the_full_path_for_a_root_with_no_name() {
    // Filesystem roots fall back to their full path.
    let root = PathBuf::from(if cfg!(windows) { "C:\\" } else { "/" });
    let descriptor = describe_workspace(&root);

    assert!(
        !descriptor.name.is_empty(),
        "name should fall back to the path"
    );
}
