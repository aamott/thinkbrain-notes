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
    /// Can place files on the system clipboard for file-manager paste.
    /// Android has no file clipboard, so the explorer hides the item there.
    pub can_copy_files_to_clipboard: bool,
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
        // A file clipboard is a desktop concept; the command is stubbed on
        // mobile and this flag hides the menu item there.
        can_copy_files_to_clipboard: desktop,
        // Reports whether a credential store was actually registered at
        // startup, not which targets ought to have one. A keychain that failed
        // to start therefore reads as absent rather than present-but-broken.
        has_keychain: crate::credential_store::is_available(),
    }
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

/// Deletes one managed vault and every byte of app-side metadata it earned.
///
/// Managed vaults only exist where the app owns their storage, so the command
/// declines elsewhere rather than trusting the renderer's capability check.
#[tauri::command]
pub fn delete_managed_workspace(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<(), NativeError> {
    if !cfg!(target_os = "android") {
        return Err(NativeError::new(
            "workspace.delete_unsupported",
            "Managed workspaces can only be deleted where the app manages their storage.",
        ));
    }
    let app_data = app_data_dir(&app)?;
    delete_managed_workspace_in(&app_data, &root_path)
}

/// The testable body of `delete_managed_workspace`: takes the app-data
/// directory directly so tests never need an `AppHandle`.
pub(crate) fn delete_managed_workspace_in(
    app_data: &Path,
    root_path: &str,
) -> Result<(), NativeError> {
    let root = managed_vaults_root(app_data)?;
    let target = Path::new(root_path).canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            NativeError::new(
                "workspace.managed_missing",
                "That managed workspace no longer exists.",
            )
        } else {
            failed(
                "workspace.managed_delete_failed",
                "Could not resolve the managed workspace.",
                error,
            )
        }
    })?;

    // Only a direct child of the managed root may be deleted — anything else,
    // including the root itself, is a caller bug or an attack, not a vault.
    if target == root || target.parent() != Some(root.as_path()) {
        return Err(NativeError::new(
            "workspace.managed_path_invalid",
            "Only a vault inside managed workspace storage can be deleted.",
        ));
    }

    let canonical = target.to_string_lossy().into_owned();
    // Metadata paths are computed before the vault disappears: every one of
    // them is keyed by the canonical root string, which is still known.
    let settings_file = crate::commands::settings::workspace_settings_path(app_data, &target);
    let index_file = crate::commands::search::search_index_file(app_data, &canonical);
    let hidden_repo = crate::commands::sync::bootstrap::hidden_repo_path(app_data, &canonical);
    let backups = crate::commands::backup::workspace_backups_dir(app_data, &target);

    // The pooled connection must go first: it holds the index file open.
    crate::commands::search::release_search_connection(&canonical);

    // The vault is deleted before its metadata, deliberately: if a later
    // removal fails we would rather leave orphaned history than a workspace
    // that survives on disk while its file history and backups are gone.
    fs::remove_dir_all(&target).map_err(|error| {
        failed(
            "workspace.managed_delete_failed",
            "Could not delete the managed workspace.",
            error,
        )
    })?;

    // From here the vault is already gone; a metadata path that resists is
    // logged, not fatal.
    remove_file_if_present(&settings_file);
    // The index uses rollback journaling, so `-journal` (mid-transaction or
    // crash leftover) is the sibling that can exist; `-wal`/`-shm` are covered
    // too in case the journal mode ever changes.
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let mut sibling = index_file.clone().into_os_string();
        sibling.push(suffix);
        remove_file_if_present(&PathBuf::from(sibling));
    }
    remove_dir_if_present(&hidden_repo);
    remove_dir_if_present(&backups);
    Ok(())
}

fn remove_file_if_present(path: &Path) {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => eprintln!("[workspace] failed to remove {path:?}: {error}"),
    }
}

fn remove_dir_if_present(path: &Path) {
    match fs::remove_dir_all(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => eprintln!("[workspace] failed to remove {path:?}: {error}"),
    }
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

pub(crate) fn list_managed_workspaces_in(
    app_data: &Path,
) -> Result<Vec<WorkspaceDescriptor>, NativeError> {
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

pub(crate) fn create_managed_workspace_in(
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
        assert!(
            crate::commands::APP_COMMAND_PATHS.contains(&"workspace::create_managed_workspace")
        );
        assert!(
            crate::commands::APP_COMMAND_PATHS.contains(&"workspace::delete_managed_workspace")
        );
        assert!(
            crate::commands::APP_COMMAND_PATHS.contains(&"workspace_known::list_known_workspaces")
        );
    }
}
