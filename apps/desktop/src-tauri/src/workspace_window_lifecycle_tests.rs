//! Focused tests for the workspace-window lifecycle components that do not
//! require a running Tauri runtime.
//!
//! These tests cover the pure-Rust pieces of the workspace-window lifecycle:
//! the compile-time async-command guard for `open_workspace_window`, opaque
//! label generation, root registration/scoping/build-failure cleanup,
//! root-path validation, and workspace naming (which feeds the window title).
//! They intentionally do NOT exercise `WebviewWindowBuilder::build()` — that
//! needs a live OS webview — so the native webview creation itself remains
//! uncovered by automated tests in this repository.

use crate::commands::workspace::{
    describe_workspace, next_workspace_window_label, open_workspace_window,
    register_workspace_window_root, resolve_workspace_root, unregister_workspace_window_root,
    workspace_window_root, WorkspaceWindowRoots,
};
use crate::NativeError;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::SystemTime;

// ---------------------------------------------------------------------------
// Async-command guard
// ---------------------------------------------------------------------------

/// `open_workspace_window` is an `async fn` returning `Result<(), NativeError>`.
/// This is a compile-time guard: if the signature ever loses `async` (or
/// changes its error type), this test stops compiling. The Tauri runtime
/// requires the command to be async so the window build does not block the
/// main thread, and the frontend relies on the typed error.
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

// ---------------------------------------------------------------------------
// Root registration scoping
// ---------------------------------------------------------------------------

/// Two workspace windows get distinct opaque labels, and the roots registered
/// under them are scoped to those labels: resolving one label never returns the
/// other's root, and unregistering one leaves the other intact.
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

/// Creates a unique temp directory for a test and returns its canonical path.
///
/// Canonicalization is important on macOS where `/var` is a symlink to
/// `/private/var`; without it, path comparisons against canonicalized roots
/// would fail spuriously.
fn temp_dir(prefix: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time is after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("thinkbrain-{prefix}-{unique}"));
    fs::create_dir_all(&path).expect("temp directory is created");
    path.canonicalize().expect("temp directory canonicalizes")
}

// ---------------------------------------------------------------------------
// Label generation
// ---------------------------------------------------------------------------

/// Every workspace window needs a unique, opaque label so the
/// `WorkspaceWindowRoots` map and the OS window manager never confuse two
/// windows. The label is also the key the frontend uses to ask
/// `window_workspace_root` which vault it should load.
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

// ---------------------------------------------------------------------------
// Root registration and build-failure cleanup
// ---------------------------------------------------------------------------

/// `create_workspace_window_off_main_thread` registers the root BEFORE calling
/// `WebviewWindowBuilder::build()`, and the `.map_err()` closure on build
/// failure calls `unregister_workspace_window_root`. This test exercises that
/// exact cleanup contract: a root that was registered and then unregistered
/// (as the build-failure path does) must no longer be resolvable.
#[test]
fn build_failure_cleanup_removes_a_registered_root() {
    let roots = WorkspaceWindowRoots::default();
    let label = next_workspace_window_label();

    // Simulate the pre-build registration.
    register_workspace_window_root(&roots, label.clone(), "/vault/demo".to_string());
    assert_eq!(
        workspace_window_root(&roots, &label),
        Some("/vault/demo".to_string()),
        "root should be resolvable after registration"
    );

    // Simulate the build-failure cleanup that the `.map_err()` closure runs.
    unregister_workspace_window_root(&roots, &label);
    assert_eq!(
        workspace_window_root(&roots, &label),
        None,
        "root must be gone after build-failure cleanup"
    );
}

/// Unregistering a label that was never registered is a no-op, not an error.
/// This matters because the build-failure cleanup runs even if registration
/// raced with another unregister (e.g. a window destroyed while build was in
/// flight).
#[test]
fn unregistering_an_unknown_root_is_a_safe_noop() {
    let roots = WorkspaceWindowRoots::default();
    let label = next_workspace_window_label();

    // Must not panic or return an error.
    unregister_workspace_window_root(&roots, &label);
    assert_eq!(workspace_window_root(&roots, &label), None);
}

/// `WorkspaceWindowRoots` is shared across all windows and accessed from the
/// main thread, command handlers, and window-destroy callbacks. The internal
/// `Mutex` must not deadlock under concurrent access, and poison recovery
/// (via `lock_or_recover`) must keep the map usable after a panicked thread.
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

// ---------------------------------------------------------------------------
// Root path validation (runs before window creation)
// ---------------------------------------------------------------------------

/// `resolve_workspace_root` is the first thing
/// `create_workspace_window_off_main_thread` calls. A relative path must be
/// rejected before any window is created so the label and root registration
/// never happen for an invalid path.
#[test]
fn resolve_workspace_root_rejects_relative_paths() {
    let error =
        resolve_workspace_root("relative/path").expect_err("relative path should be rejected");

    assert_eq!(error.code, "workspace.invalid_root");
}

/// A path that does not exist on disk cannot be opened as a workspace, and the
/// error must be typed so the frontend can distinguish it from a permission
/// error.
#[test]
fn resolve_workspace_root_rejects_nonexistent_paths() {
    let missing = std::env::temp_dir().join("thinkbrain-nonexistent-root-vault");
    assert!(!missing.exists());

    let error = resolve_workspace_root(&missing.to_string_lossy())
        .expect_err("nonexistent path should be rejected");

    assert_eq!(error.code, "workspace.open_failed");
}

/// A file is not a valid workspace root — the window would have nothing to
/// list. This guards against the user accidentally selecting a file in the
/// native dialog.
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

/// The happy path: an existing directory canonicalizes to its real filesystem
/// path, which is what gets registered as the window's root.
#[test]
fn resolve_workspace_root_canonicalizes_an_existing_directory() {
    let dir = temp_dir("valid-root");
    let resolved =
        resolve_workspace_root(&dir.to_string_lossy()).expect("existing directory resolves");

    assert_eq!(resolved, dir);

    fs::remove_dir_all(dir).expect("temp directory is cleaned up");
}

// ---------------------------------------------------------------------------
// Workspace naming (feeds the window title)
// ---------------------------------------------------------------------------

/// `describe_workspace` extracts the folder name for the window title. A
/// workspace at `/home/user/Notes` should be titled "Notes", not the full
/// path. A root with no file name (the filesystem root) falls back to the
/// full path string.
#[test]
fn describe_workspace_uses_the_folder_name_for_the_window_title() {
    let root = PathBuf::from("/home/user/My Notes");
    let descriptor = describe_workspace(&root);

    assert_eq!(descriptor.root_path, "/home/user/My Notes");
    assert_eq!(descriptor.name, "My Notes");
}

#[test]
fn describe_workspace_falls_back_to_the_full_path_for_a_root_with_no_name() {
    // On Unix, "/" has no file name; on Windows, "C:\\" has no file name.
    // Either way, the fallback should be the path string, not an empty name.
    let root = PathBuf::from(if cfg!(windows) { "C:\\" } else { "/" });
    let descriptor = describe_workspace(&root);

    assert!(
        !descriptor.name.is_empty(),
        "name should fall back to the path"
    );
}

// ---------------------------------------------------------------------------
// NativeError shape (used by build-failure and path-validation errors)
// ---------------------------------------------------------------------------

/// The build-failure and path-validation errors that bubble up to the renderer
/// must carry a stable `code` so the frontend can branch on it. This guards
/// against accidental code renames that would silently break error handling.
#[test]
fn workspace_window_errors_carry_stable_codes() {
    let relative_error = resolve_workspace_root("relative").unwrap_err();
    assert_eq!(relative_error.code, "workspace.invalid_root");

    // `NativeError::with_details` is the shape `failed()` produces for
    // build failures. Verify it round-trips its code and details.
    let build_error = NativeError::with_details(
        "workspace.window_failed",
        "Failed to create a workspace window.",
        "webview build error",
    );
    assert_eq!(build_error.code, "workspace.window_failed");
    assert_eq!(build_error.details.as_deref(), Some("webview build error"));
}
