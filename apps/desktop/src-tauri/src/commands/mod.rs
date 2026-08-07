//! Commands Subsystem
//!
//! Exposes Tauri IPC command handlers for interaction between the React frontend
//! and the Rust backend.
//!
//! Submodules:
//! - `git`: Git repository discovery, status, staging, and unstaging commands.
//! - `workspace`: Vault/workspace window lifecycle, file and directory hierarchy operations.
//! - `markdown`: Content reading, writing, creation, renaming, and listing of markdown files.
//! - `search`: Full-text document indexing and search query execution.
//! - `settings`: Application-level and workspace-level configuration reading and writing.
//! - `themes`: Discovery and listing of `.tbtheme.json` theme files in the app-data themes directory.
//! - `extensions`: Contained reads of files inside a locally loaded extension directory.
//!
//! Security Guarantees & Safety Invariants:
//! - Path Scoping: File and directory operations must validate paths to prevent directory traversal outside workspace boundaries.
//! - Input Validation: User inputs (such as paths or filenames) must be sanitized and checked before execution.
//! - State Safety: Desktop state and workspace window mappings use synchronized thread-safe primitives.

pub mod extensions;
pub mod git;
pub mod workspace;
pub mod markdown;
pub mod search;
pub mod settings;
pub mod themes;

/// Macro aggregating all Tauri IPC invoke handlers for registration in `tauri::Builder`.
///
/// Centralizes command registration so adding new commands to submodules does not
/// require editing `lib.rs`.
#[macro_export]
macro_rules! app_command_handlers {
    () => {
        tauri::generate_handler![
            $crate::commands::workspace::desktop_shell_status,
            $crate::commands::workspace::open_workspace,
            $crate::commands::git::git_availability,
            $crate::commands::git::detect_git_repository,
            $crate::commands::git::initialize_git_repository,
            $crate::commands::git::git_status,
            $crate::commands::git::stage_git_files,
            $crate::commands::git::unstage_git_files,
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
            $crate::commands::workspace::window_workspace_root
        ]
    };
}

