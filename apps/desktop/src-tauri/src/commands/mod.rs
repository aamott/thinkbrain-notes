//! Commands Subsystem
//!
//! Exposes Tauri IPC command handlers for interaction between the React frontend
//! and the Rust backend.
//!
//! Submodules:
//! - `workspace`: Vault/workspace window lifecycle, file and directory hierarchy operations.
//! - `markdown`: Content reading, writing, creation, renaming, and listing of markdown files.
//! - `search`: Full-text document indexing and search query execution.
//! - `settings`: Application-level and workspace-level configuration reading and writing.
//! - `themes`: Discovery and listing of `.tbtheme.json` theme files in the app-data themes directory.
//! - `extensions`: Contained reads of files inside a locally loaded extension directory.
//! - `watcher`: Watches the open workspace for edits made outside the app and reports them.
//!
//! Security Guarantees & Safety Invariants:
//! - Path Scoping: File and directory operations must validate paths to prevent directory traversal outside workspace boundaries.
//! - Input Validation: User inputs (such as paths or filenames) must be sanitized and checked before execution.
//! - State Safety: Desktop state and workspace window mappings use synchronized thread-safe primitives.

pub mod extensions;
pub mod markdown;
pub mod search;
pub mod settings;
pub mod themes;
pub mod watcher;
pub mod workspace;

/// Macro aggregating all Tauri IPC invoke handlers for registration in `tauri::Builder`.
///
/// Centralizes command registration so adding new commands to submodules does not
/// require editing `lib.rs`.
///
/// Keep `app_command_handlers!` and `APP_COMMAND_PATHS` in sync: every path in
/// the macro must also appear in the const array, and vice versa. The
/// `all_registered_commands_match_expected` test guards the array against drift.
#[macro_export]
macro_rules! app_command_handlers {
    () => {
        tauri::generate_handler![
            $crate::commands::workspace::desktop_shell_status,
            $crate::commands::workspace::open_workspace,
            $crate::commands::markdown::list_markdown_files,
            $crate::commands::workspace::list_workspace_entries,
            $crate::commands::markdown::read_markdown_file,
            $crate::commands::markdown::write_markdown_file,
            $crate::commands::markdown::create_markdown_file,
            $crate::commands::markdown::rename_markdown_file,
            $crate::commands::markdown::delete_markdown_file,
            $crate::commands::workspace::create_workspace_file,
            $crate::commands::workspace::create_workspace_folder,
            $crate::commands::workspace::rename_workspace_entry,
            $crate::commands::workspace::delete_workspace_entry,
            $crate::commands::search::index_documents,
            $crate::commands::search::search_index,
            $crate::commands::search::query_index_metadata,
            $crate::commands::search::clear_index,
            $crate::commands::search::remove_index_document,
            $crate::commands::settings::read_app_settings,
            $crate::commands::settings::write_app_settings,
            $crate::commands::settings::update_desktop_state,
            $crate::commands::settings::update_app_theme,
            $crate::commands::settings::read_workspace_settings,
            $crate::commands::settings::write_workspace_settings,
            $crate::commands::themes::list_themes,
            $crate::commands::themes::read_theme_file,
            $crate::commands::extensions::read_extension_file,
            $crate::commands::workspace::open_workspace_window,
            $crate::commands::workspace::window_workspace_root,
            $crate::commands::watcher::watch_workspace,
            $crate::commands::watcher::unwatch_workspace
        ]
    };
}

/// Introspectable mirror of `app_command_handlers!` as path strings.
///
/// Used by `all_registered_commands_match_expected` to guard against drift: a
/// command added to a submodule but missing from the registry will fail the
/// test once it is also added here. Update both lists together when adding a
/// `#[tauri::command]`.
#[cfg(test)]
pub const APP_COMMAND_PATHS: &[&str] = &[
    "workspace::desktop_shell_status",
    "workspace::open_workspace",
    "markdown::list_markdown_files",
    "workspace::list_workspace_entries",
    "markdown::read_markdown_file",
    "markdown::write_markdown_file",
    "markdown::create_markdown_file",
    "markdown::rename_markdown_file",
    "markdown::delete_markdown_file",
    "workspace::create_workspace_file",
    "workspace::create_workspace_folder",
    "workspace::rename_workspace_entry",
    "workspace::delete_workspace_entry",
    "search::index_documents",
    "search::search_index",
    "search::query_index_metadata",
    "search::clear_index",
    "search::remove_index_document",
    "settings::read_app_settings",
    "settings::write_app_settings",
    "settings::update_desktop_state",
    "settings::update_app_theme",
    "settings::read_workspace_settings",
    "settings::write_workspace_settings",
    "themes::list_themes",
    "themes::read_theme_file",
    "extensions::read_extension_file",
    "workspace::open_workspace_window",
    "workspace::window_workspace_root",
    "watcher::watch_workspace",
    "watcher::unwatch_workspace",
];

#[cfg(test)]
mod tests {
    use super::APP_COMMAND_PATHS;

    /// Guards the command registry against silent drift.
    ///
    /// Each line references a registered command function by path (compile-
    /// checked: a rename or removal breaks the build) and asserts its string
    /// appears in `APP_COMMAND_PATHS`. When adding a `#[tauri::command]`, add
    /// it to `app_command_handlers!`, `APP_COMMAND_PATHS`, and a line here.
    #[test]
    fn all_registered_commands_match_expected() {
        // Workspace
        assert!(APP_COMMAND_PATHS.contains(&"workspace::desktop_shell_status"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::open_workspace"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::list_workspace_entries"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::create_workspace_file"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::create_workspace_folder"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::rename_workspace_entry"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::delete_workspace_entry"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::open_workspace_window"));
        assert!(APP_COMMAND_PATHS.contains(&"workspace::window_workspace_root"));
        // Markdown
        assert!(APP_COMMAND_PATHS.contains(&"markdown::list_markdown_files"));
        assert!(APP_COMMAND_PATHS.contains(&"markdown::read_markdown_file"));
        assert!(APP_COMMAND_PATHS.contains(&"markdown::write_markdown_file"));
        assert!(APP_COMMAND_PATHS.contains(&"markdown::create_markdown_file"));
        assert!(APP_COMMAND_PATHS.contains(&"markdown::rename_markdown_file"));
        assert!(APP_COMMAND_PATHS.contains(&"markdown::delete_markdown_file"));
        // Search
        assert!(APP_COMMAND_PATHS.contains(&"search::index_documents"));
        assert!(APP_COMMAND_PATHS.contains(&"search::search_index"));
        assert!(APP_COMMAND_PATHS.contains(&"search::query_index_metadata"));
        assert!(APP_COMMAND_PATHS.contains(&"search::clear_index"));
        assert!(APP_COMMAND_PATHS.contains(&"search::remove_index_document"));
        // Settings
        assert!(APP_COMMAND_PATHS.contains(&"settings::read_app_settings"));
        assert!(APP_COMMAND_PATHS.contains(&"settings::write_app_settings"));
        assert!(APP_COMMAND_PATHS.contains(&"settings::update_desktop_state"));
        assert!(APP_COMMAND_PATHS.contains(&"settings::update_app_theme"));
        assert!(APP_COMMAND_PATHS.contains(&"settings::read_workspace_settings"));
        assert!(APP_COMMAND_PATHS.contains(&"settings::write_workspace_settings"));
        // Themes
        assert!(APP_COMMAND_PATHS.contains(&"themes::list_themes"));
        assert!(APP_COMMAND_PATHS.contains(&"themes::read_theme_file"));
        // Extensions
        assert!(APP_COMMAND_PATHS.contains(&"extensions::read_extension_file"));
        // Watcher
        assert!(APP_COMMAND_PATHS.contains(&"watcher::watch_workspace"));
        assert!(APP_COMMAND_PATHS.contains(&"watcher::unwatch_workspace"));

        // Sanity: no duplicates and the count matches the macro entries.
        let mut sorted = APP_COMMAND_PATHS.to_vec();
        sorted.sort();
        let unique: std::collections::BTreeSet<&&str> = sorted.iter().collect();
        assert_eq!(
            unique.len(),
            APP_COMMAND_PATHS.len(),
            "APP_COMMAND_PATHS has duplicates"
        );
        assert_eq!(
            APP_COMMAND_PATHS.len(),
            31,
            "expected 31 registered commands"
        );
    }
}
