//! App-managed workspace roots for platforms without a directory picker.
//!
//! Managed vault paths are derived entirely in native code. The renderer names
//! a single child only; it never receives authority to construct an app-data
//! path or escape the dedicated `vaults` directory.

use crate::error::{NativeError, failed};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::workspace_paths::{WorkspaceDescriptor, describe_workspace};

const MANAGED_VAULTS_DIR: &str = "vaults";
const MAX_MANAGED_VAULT_NAME_BYTES: usize = 120;
const FORBIDDEN_NAME_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const RESERVED_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Workspace entry features available on the current build target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAccessCapabilities {
    pub can_open_folder: bool,
    pub can_create_managed_workspace: bool,
    pub opens_workspace_in_new_window: bool,
}

/// Reports platform behavior before the renderer offers workspace actions.
#[tauri::command]
pub fn workspace_access_capabilities() -> WorkspaceAccessCapabilities {
    WorkspaceAccessCapabilities {
        can_open_folder: cfg!(desktop),
        can_create_managed_workspace: cfg!(target_os = "android"),
        opens_workspace_in_new_window: cfg!(desktop),
    }
}

/// Platform-level capability declarations for soft compatibility gating.
///
/// These are **not** a security sandbox: the renderer uses them to hide or
/// disable UI that would call a command the platform cannot serve, so the
/// user never sees a silent failure. The Rust side remains the authority for
/// every command — if a renderer bypasses the gate and invokes anyway, the
/// command returns its normal error, not a permission denial.
///
/// Desktop-only commands that are already stubbed at the Rust level (sync
/// credentials on Android) do not need a gate here: the stub is the
/// declaration. This struct covers the commands whose Rust implementation
/// exists on every platform but whose *effect* is meaningless or broken on
/// some — e.g. spawning a terminal process, opening a folder picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    /// Can open a native folder-picker dialog to choose a workspace.
    pub can_open_folder: bool,
    /// Can create app-managed vaults in app-private storage.
    pub can_create_managed_workspace: bool,
    /// Can open a second webview window for a different workspace.
    pub opens_workspace_in_new_window: bool,
    /// Can spawn a child process (terminal, ACP agent host).
    pub can_spawn_process: bool,
    /// Can store credentials in the OS keychain.
    pub has_keychain: bool,
}

/// Reports platform capabilities for soft compatibility gating in the renderer.
#[tauri::command]
pub fn platform_capabilities() -> PlatformCapabilities {
    let desktop = cfg!(desktop);
    PlatformCapabilities {
        can_open_folder: desktop,
        can_create_managed_workspace: cfg!(target_os = "android"),
        opens_workspace_in_new_window: desktop,
        // Process spawning (terminal, ACP) is desktop-only. Android does not
        // expose `Command::new` in the way the terminal/ACP host expects.
        can_spawn_process: desktop,
        // `keyring` has no Android backend; sync credentials stub to
        // `unsupported!` on non-desktop-OS targets (see `sync/credentials.rs`).
        has_keychain: cfg!(any(
            target_os = "linux",
            target_os = "macos",
            target_os = "windows"
        )),
    }
}

/// Lists direct child directories under the app-managed vault root.
#[tauri::command]
pub fn list_managed_workspaces(
    app: tauri::AppHandle,
) -> Result<Vec<WorkspaceDescriptor>, NativeError> {
    let app_data = app_data_dir(&app)?;
    list_managed_workspaces_in(&app_data)
}

/// Creates one empty app-managed vault and returns its canonical descriptor.
#[tauri::command]
pub fn create_managed_workspace(
    app: tauri::AppHandle,
    name: String,
) -> Result<WorkspaceDescriptor, NativeError> {
    let app_data = app_data_dir(&app)?;
    create_managed_workspace_in(&app_data, &name)
}

/// Ensures and canonicalizes the dedicated managed-vault directory.
pub fn managed_vaults_root(app_data: &Path) -> Result<PathBuf, NativeError> {
    let root = app_data.join(MANAGED_VAULTS_DIR);
    fs::create_dir_all(&root).map_err(|error| {
        failed(
            "workspace.managed_root_failed",
            "Could not prepare managed workspace storage.",
            error,
        )
    })?;
    root.canonicalize().map_err(|error| {
        failed(
            "workspace.managed_root_failed",
            "Could not open managed workspace storage.",
            error,
        )
    })
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, NativeError> {
    app.path().app_data_dir().map_err(|error| {
        failed(
            "workspace.app_data_unavailable",
            "Could not find where this app keeps managed workspaces.",
            error,
        )
    })
}

fn list_managed_workspaces_in(app_data: &Path) -> Result<Vec<WorkspaceDescriptor>, NativeError> {
    let root = managed_vaults_root(app_data)?;
    let entries = fs::read_dir(&root).map_err(|error| {
        failed(
            "workspace.managed_list_failed",
            "Could not list managed workspaces.",
            error,
        )
    })?;
    let mut workspaces = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            failed(
                "workspace.managed_list_failed",
                "Could not read a managed workspace entry.",
                error,
            )
        })?;
        let file_type = entry.file_type().map_err(|error| {
            failed(
                "workspace.managed_list_failed",
                "Could not inspect a managed workspace entry.",
                error,
            )
        })?;
        if !file_type.is_dir() {
            continue;
        }
        let path = entry.path().canonicalize().map_err(|error| {
            failed(
                "workspace.managed_list_failed",
                "Could not resolve a managed workspace entry.",
                error,
            )
        })?;
        if path.parent() == Some(root.as_path()) {
            workspaces.push(describe_workspace(&path));
        }
    }
    workspaces.sort_by_cached_key(|workspace| workspace.name.to_lowercase());
    Ok(workspaces)
}

fn create_managed_workspace_in(
    app_data: &Path,
    requested_name: &str,
) -> Result<WorkspaceDescriptor, NativeError> {
    let name = validate_managed_vault_name(requested_name)?;
    let root = managed_vaults_root(app_data)?;
    let target = root.join(name);
    match fs::create_dir(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err(NativeError::new(
                "workspace.managed_exists",
                "A managed workspace with that name already exists.",
            ));
        }
        Err(error) => {
            return Err(failed(
                "workspace.managed_create_failed",
                "Could not create the managed workspace.",
                error,
            ));
        }
    }
    let canonical = target.canonicalize().map_err(|error| {
        failed(
            "workspace.managed_create_failed",
            "Could not open the new managed workspace.",
            error,
        )
    })?;
    if canonical.parent() != Some(root.as_path()) {
        return Err(NativeError::new(
            "workspace.managed_path_invalid",
            "Managed workspace path escaped its storage directory.",
        ));
    }
    Ok(describe_workspace(&canonical))
}

fn validate_managed_vault_name(requested: &str) -> Result<&str, NativeError> {
    let name = requested.trim();
    let stem = name.split('.').next().unwrap_or(name).to_ascii_lowercase();
    let invalid = name.is_empty()
        || name == "."
        || name == ".."
        || name.as_bytes().len() > MAX_MANAGED_VAULT_NAME_BYTES
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|character| character.is_control() || FORBIDDEN_NAME_CHARS.contains(&character))
        || RESERVED_NAMES.contains(&stem.as_str());
    if invalid {
        return Err(NativeError::new(
            "workspace.managed_name_invalid",
            "Choose a workspace name without path separators or reserved characters.",
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::make_temp_test_dir;

    #[test]
    fn managed_workspace_creation_stays_under_the_dedicated_root() {
        let app_data = make_temp_test_dir("managed-create", "workspace", true);
        let workspace = create_managed_workspace_in(&app_data, " Personal Notes ")
            .expect("managed workspace is created");
        let expected = app_data.join(MANAGED_VAULTS_DIR).join("Personal Notes");

        assert_eq!(PathBuf::from(workspace.root_path), expected);
        assert_eq!(workspace.name, "Personal Notes");
        assert!(expected.is_dir());
    }

    #[test]
    fn managed_workspace_names_reject_paths_and_reserved_names() {
        let app_data = make_temp_test_dir("managed-invalid", "workspace", true);
        for name in [
            "",
            "../escape",
            "nested/vault",
            "nested\\vault",
            "CON",
            "bad:name",
        ] {
            let error = create_managed_workspace_in(&app_data, name)
                .expect_err("unsafe managed workspace name is rejected");
            assert_eq!(error.code, "workspace.managed_name_invalid", "name: {name}");
        }
        assert!(!app_data.parent().unwrap().join("escape").exists());
    }

    #[test]
    fn managed_workspace_creation_rejects_duplicates() {
        let app_data = make_temp_test_dir("managed-duplicate", "workspace", true);
        create_managed_workspace_in(&app_data, "Notes").expect("first workspace is created");

        let error = create_managed_workspace_in(&app_data, "Notes")
            .expect_err("duplicate workspace is rejected");

        assert_eq!(error.code, "workspace.managed_exists");
    }

    #[test]
    fn managed_workspace_listing_returns_only_direct_directories_in_name_order() {
        let app_data = make_temp_test_dir("managed-list", "workspace", true);
        let root = managed_vaults_root(&app_data).expect("managed root");
        fs::create_dir(root.join("zeta")).expect("zeta");
        fs::create_dir(root.join("Alpha")).expect("alpha");
        fs::write(root.join("not-a-vault.txt"), "ignored").expect("file");

        let listed = list_managed_workspaces_in(&app_data).expect("workspaces listed");
        let names: Vec<_> = listed.into_iter().map(|workspace| workspace.name).collect();

        assert_eq!(names, ["Alpha", "zeta"]);
    }

    #[test]
    fn workspace_access_commands_are_registered() {
        assert!(
            crate::commands::APP_COMMAND_PATHS
                .contains(&"workspace::workspace_access_capabilities")
        );
        assert!(crate::commands::APP_COMMAND_PATHS.contains(&"workspace::list_managed_workspaces"));
        assert!(
            crate::commands::APP_COMMAND_PATHS.contains(&"workspace::create_managed_workspace")
        );
    }
}
