//! Commands Subsystem
//!
//! Exposes Tauri IPC command handlers for interaction between the React frontend
//! and the Rust backend.
//!
//! Submodules:
//! - `atomic_write`: Temp-then-rename file replacement that never deletes the destination first.
//! - `workspace`: Vault/workspace window lifecycle, file and directory hierarchy operations.
//! - `markdown`: Content reading, writing, creation, and listing of markdown files.
//! - `search`: Full-text document indexing and search query execution.
//! - `settings`: Application-level and workspace-level configuration reading and writing.
//! - `sync`: Auto Sync native layer — the hidden per-workspace repository.
//! - `themes`: Discovery and listing of `.tbtheme.json` theme files in the app-data themes directory.
//! - `extensions`: Contained reads of files inside a locally loaded extension directory.
//! - `watcher`: Watches the open workspace for edits made outside the app and reports them.
//!
//! Command names are **not** a supported contract. Extensions run in the app's
//! own realm, so they can reach any command whether it is registered here or
//! not, and keeping an unused one protects nobody. The contract is the host
//! API — `workspaceBridge`, the contribution registries, the settings bridge.
//! A command may be promoted to a contract deliberately, in writing, with a
//! reason; until then an unused command is deletable like any dead code. See
//! `plans/extensions/done-ipc_surface_is_not_the_contract-med-easy.md`.
//!
//! Security Guarantees & Safety Invariants:
//! - Path Scoping: File and directory operations must validate paths to prevent directory traversal outside workspace boundaries.
//! - Input Validation: User inputs (such as paths or filenames) must be sanitized and checked before execution.
//! - State Safety: Desktop state and workspace window mappings use synchronized thread-safe primitives.

pub mod atomic_write;
pub mod backup;
pub mod extensions;
pub mod markdown;
pub mod search;
pub mod settings;
pub mod sync;
pub mod text_files;
pub mod themes;
pub mod watcher;
pub mod workspace;

/// Every command this app registers, named exactly once.
///
/// Hands the list to `$expand`, so the same tokens produce both the Tauri
/// handler registration and the test's path strings. There is no second list
/// to keep in step: adding a line here adds the command to both.
///
/// This replaced a hand-maintained mirror whose guard test could not do what
/// it claimed. It compared one hand-written array against a hand-written
/// count, so a command added to the macro but not the array was caught only
/// when the count happened to disagree too.
#[macro_export]
macro_rules! app_command_list {
    ($expand:ident) => {
        $crate::$expand! {
        workspace::desktop_shell_status,
        workspace::workspace_access_capabilities,
        workspace::platform_capabilities,
        workspace::list_managed_workspaces,
        workspace::create_managed_workspace,
        workspace::open_workspace,
        markdown::list_markdown_files,
        workspace::list_workspace_entries,
        markdown::read_markdown_file,
        markdown::write_markdown_file,
        markdown::create_markdown_file,
        text_files::read_text_file,
        text_files::write_text_file,
        workspace::create_workspace_file,
        workspace::create_workspace_folder,
        workspace::rename_workspace_entry,
        workspace::delete_workspace_entry,
        search::index_documents,
        search::search_index,
        search::query_index_metadata,
        search::clear_index,
        search::remove_index_document,
        settings::quarantined_settings,
        settings::read_app_settings,
        settings::write_app_settings,
        settings::update_desktop_state,
        settings::update_app_theme,
        settings::read_workspace_settings,
        settings::write_workspace_settings,
        themes::list_themes,
        themes::read_theme_file,
        extensions::read_extension_file,
        backup::list_note_versions,
        backup::restore_note_backup,
        workspace::open_workspace_window,
        workspace::window_workspace_root,
        watcher::watch_workspace,
        watcher::unwatch_workspace,
        sync::resolve::list_conflicts,
        sync::resolve::read_conflict,
        sync::resolve::resolve_conflict,
        sync::history::sync_history,
        sync::history::restore_version,
        sync::history::sync_conflict_rate,
        sync::maintain::sync_history_usage,
        sync::maintain::sync_free_space,
        sync::maintain::sync_clear_undo_history,
        sync::status::sync_status,
        sync::round::sync_now,
        sync::sign_in::save_sync_credentials,
        sync::sign_in::save_sync_link,
        sync::sign_in::sync_sign_in_status,
        sync::sign_in::forget_sync_sign_in,
        sync::import::preview_workspace_from_git_link,
        sync::import::preview_managed_workspace_from_git_link,
        sync::import::import_workspace_from_git_link,
        sync::import::import_managed_workspace_from_git_link,
        sync::registry::sync_app_foregrounded,
        sync::registry::sync_app_backgrounded,
        }
    };
}

/// Expands the command list into Tauri's handler registration.
#[macro_export]
macro_rules! app_command_handlers_expand {
    ($($first:ident $(:: $rest:ident)*),* $(,)?) => {
        tauri::generate_handler![
            $( $crate::commands::$first $(:: $rest)* ),*
        ]
    };
}

/// Macro aggregating all Tauri IPC invoke handlers for registration in `tauri::Builder`.
///
/// Centralizes command registration so adding new commands to submodules does not
/// require editing `lib.rs`.
#[macro_export]
macro_rules! app_command_handlers {
    () => {
        $crate::app_command_list!(app_command_handlers_expand)
    };
}

/// Expands the command list into path strings for the test below.
///
/// Built with `concat!` over per-segment `stringify!` rather than `stringify!`
/// on the whole path: stringifying a path inserts spaces around `::`, which
/// would yield "sync :: round :: sync_now".
#[cfg(test)]
#[macro_export]
macro_rules! app_command_paths_expand {
    ($($first:ident $(:: $rest:ident)*),* $(,)?) => {
        &[ $( concat!(stringify!($first) $(, "::", stringify!($rest))*) ),* ]
    };
}

/// Introspectable view of the registered commands, generated from the same
/// list the handlers come from.
#[cfg(test)]
pub const APP_COMMAND_PATHS: &[&str] = app_command_list!(app_command_paths_expand);

#[cfg(test)]
mod tests {
    use super::APP_COMMAND_PATHS;

    /// Guards the command list against accidental loss and duplication.
    ///
    /// Deliberately short. `APP_COMMAND_PATHS` and the Tauri registration are
    /// both expanded from `app_command_list!`, so they cannot disagree — a
    /// per-command `contains` assertion here would only be checking that a
    /// macro expanded twice from one source produced the same thing twice,
    /// which it does by construction.
    ///
    /// What is still worth asserting is what the single list cannot enforce
    /// about itself: that no command is named twice, and that the number of
    /// them has not changed without someone meaning it. Removing a command is
    /// then a two-line change — the list and this count — which is the point
    /// at which a reviewer sees it.
    #[test]
    fn the_command_list_has_no_duplicates_and_the_expected_size() {
        let unique: std::collections::BTreeSet<&&str> = APP_COMMAND_PATHS.iter().collect();
        assert_eq!(
            unique.len(),
            APP_COMMAND_PATHS.len(),
            "a command is named twice in app_command_list!"
        );
        assert_eq!(
            APP_COMMAND_PATHS.len(),
            59,
            "the number of registered commands changed; update this count if it was deliberate"
        );
    }

    /// The path strings must survive macro expansion intact.
    ///
    /// `stringify!` on a whole path inserts spaces around `::`, so a naive
    /// expansion yields "sync :: round :: sync_now". The list is built with
    /// `concat!` over per-segment `stringify!` to avoid that, and this proves
    /// it, because nothing else would notice: the strings are only read by
    /// this test.
    #[test]
    fn generated_paths_are_written_the_way_a_command_path_is_written() {
        for path in APP_COMMAND_PATHS {
            assert!(
                !path.contains(' '),
                "generated path {path:?} contains a space"
            );
            assert!(
                !path.starts_with("::") && !path.ends_with("::"),
                "generated path {path:?} has a dangling separator"
            );
        }
        assert!(APP_COMMAND_PATHS.contains(&"sync::round::sync_now"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::desktop_shell_status"));
    }
}
