//! Thinkbrain Notes Desktop Shell
//!
//! Main entry point for the Tauri desktop application, registering application state,
//! plugins, and command handlers.

#[cfg(target_os = "android")]
mod android_context;
#[cfg(target_os = "android")]
mod android_tls;
mod commands;
mod credential_store;
mod error;
#[cfg(all(
    unix,
    not(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "android",
        target_os = "emscripten"
    ))
))]
mod linux_clipboard;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod workspace_window_lifecycle_tests;

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
        // Edition 2024 made env::set_var unsafe (mutable static state).
        // This runs before any threads are spawned, so it's safe.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    disable_dmabuf_renderer_on_nvidia();

    // keyring v4 picks its backend at runtime, so the store has to be
    // registered before anything can read a sign-in. Must happen before any
    // command runs, which is why it is here and not behind a lazy init.
    credential_store::register();

    let builder = tauri::Builder::default();

    // Desktop only, matching the dependency gate in Cargo.toml: the updater has
    // no mobile implementation, and an Android build has no business shipping
    // one anyway — that store owns updates there.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(WorkspaceWindowRoots::default())
        .setup(|app| {
            // The sign-in catalog and per-workspace sync settings live under
            // the app data dir, which sync code reaches only through the
            // remembered "settings home". Nothing remembers it until a
            // workspace watcher attaches — and on a fresh install there is no
            // workspace yet, so saving a sign-in during a first-run git-link
            // import used to answer "no app data". Publish it once here;
            // `remember_settings_home` ignores later repeats. A resolution
            // failure leaves the previous behaviour, which is strictly better
            // than failing setup over a path the commands would fail on too.
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                crate::commands::sync::settle::remember_settings_home(&app_data_dir);
            }

            // Windows opened later register this themselves, but the window
            // declared in tauri.conf.json exists before any command runs. A
            // destroyed window never runs the frontend teardown, so without
            // this its file watchers outlive it whenever another window keeps
            // the process alive. The main window does register a
            // `WorkspaceWindowRoots` entry — lazily, when `open_workspace`
            // first runs — so the extra cleanup unregisters its label; for a
            // window that never opened a workspace it is a harmless no-op.
            for (label, window) in app.webview_windows().into_iter() {
                let app_for_cleanup = app.handle().clone();
                let label_for_cleanup = label.clone();
                crate::commands::watcher::attach_window_destroy_cleanup(
                    &window,
                    label,
                    Some(move || {
                        crate::commands::workspace::unregister_workspace_window_root(
                            &app_for_cleanup.state::<WorkspaceWindowRoots>(),
                            &label_for_cleanup,
                        );
                    }),
                );
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(app_command_handlers!())
        .run(tauri::generate_context!())
        .expect("failed to run Thinkbrain Notes desktop shell");
}
