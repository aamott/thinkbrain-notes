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
use tauri::Manager;

/// Works around WebKitGTK's DMA-BUF renderer aborting on the NVIDIA driver.
///
/// On Linux with the proprietary/open NVIDIA kernel module loaded, WebKitGTK
/// 2.42+ can fail with "Could not create GBM EGL display: EGL_NOT_INITIALIZED"
/// before any app code runs. Disabling the DMA-BUF renderer falls back to the
/// shared-memory path, which renders correctly. An explicit user setting wins.
#[cfg(target_os = "linux")]
fn disable_dmabuf_renderer_on_nvidia() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    if std::path::Path::new("/proc/driver/nvidia/version").exists() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    disable_dmabuf_renderer_on_nvidia();

    tauri::Builder::default()
        .manage(WorkspaceWindowRoots::default())
        .setup(|app| {
            // Windows opened later register this themselves, but the window
            // declared in tauri.conf.json exists before any command runs. A
            // destroyed window never runs the frontend teardown, so without
            // this its file watchers outlive it whenever another window keeps
            // the process alive. The main window is never registered as a
            // workspace window, so it has no `WorkspaceWindowRoots` entry to
            // unregister — pass `None` for the extra cleanup.
            for (label, window) in app.webview_windows().into_iter() {
                crate::commands::watcher::attach_window_destroy_cleanup(
                    &window,
                    label.to_string(),
                    None::<fn()>,
                );
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(app_command_handlers!())
        .run(tauri::generate_context!())
        .expect("failed to run Thinkbrain Notes desktop shell");
}


