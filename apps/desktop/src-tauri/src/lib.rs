//! Thinkbrain Notes Desktop Shell
//!
//! Main entry point for the Tauri desktop application, registering application state,
//! plugins, and command handlers.

mod error;
mod commands;

#[cfg(test)]
mod tests;

pub use error::NativeError;

use crate::commands::workspace::WorkspaceWindowRoots;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceWindowRoots::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(app_command_handlers!())
        .run(tauri::generate_context!())
        .expect("failed to run Thinkbrain Notes desktop shell");
}


