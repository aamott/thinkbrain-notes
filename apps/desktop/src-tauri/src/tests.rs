//! Shared test infrastructure for the desktop Tauri backend.
//!
//! This file is a small orchestrator: it declares the coherent test modules
//! under `tests/` and exposes the handful of helpers they share. The
//! `make_temp_test_dir` helper is `pub(crate)` because the sync test modules
//! (under `commands/sync/`) depend on `crate::tests::make_temp_test_dir` for
//! their temp-directory fixtures; that path must keep resolving.
//!
//! Test groups live in `tests/`:
//! - [`search`] — search index (matching, prefix, rebuild, delete, scoping).
//! - [`settings`] — settings paths, read/write, atomic writes, quarantine,
//!   write preconditions, theme.
//! - [`desktop_state`] — desktop-state merge/version/tabs/workspace views.
//! - [`workspace_markdown`] — shell status, path normalization, markdown
//!   detection, workspace entry CRUD, symlink escapes, backup/restore, note
//!   write preconditions.
//! - [`watcher_events`] — watcher event classification (audiences, batches,
//!   rename, ignored folders).
//! - [`watcher_lifecycle`] — self-write suppression, live OS-notification
//!   integration, `WatchInterest` tracking.
//!
//! The workspace-window lifecycle tests live in
//! `crate::workspace_window_lifecycle_tests` (sibling module).

mod desktop_state;
mod search;
mod settings;
mod watcher_events;
mod watcher_lifecycle;
mod workspace_markdown;

use std::{fs, path::PathBuf, time::SystemTime};

/// Creates a unique temp directory for a test and returns its path.
///
/// `prefix` selects the directory-name prefix (`thinkbrain-{prefix}-{unique}`)
/// so callers can keep their existing namespace. `canonicalize` should be true
/// for tests that exercise the live watcher: on macOS the temp directory is a
/// symlink (`/var` -> `/private/var`) and FSEvents reports the resolved
/// spelling, so an uncanonicalized root would fail to match a single event
/// path and the live watcher tests would pass vacuously.
///
/// `pub(crate)` because the sync test modules under `commands/sync/` reach it
/// as `crate::tests::make_temp_test_dir`; widening it would broaden a path
/// that exists only for tests, and narrowing it would break those callers.
pub(crate) fn make_temp_test_dir(name: &str, prefix: &str, canonicalize: bool) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time is after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("thinkbrain-{prefix}-{name}-{unique}"));

    fs::create_dir_all(&path).expect("temp directory is created");
    if canonicalize {
        path.canonicalize().expect("temp directory canonicalizes")
    } else {
        path
    }
}

/// Canonicalized temp directory under the `notes` namespace, shared by the
/// test modules in this directory. Descendant modules reach it as
/// `super::temp_test_dir`.
fn temp_test_dir(name: &str) -> PathBuf {
    make_temp_test_dir(name, "notes", true)
}
