//! The workspaces the app knows how to open.
//!
//! Two sources: the remembered recents (desktop state, which now keeps
//! absolute paths whose folder is missing), and the managed vaults that live
//! in app-private storage on platforms that have them. The workspace manager
//! renders this list; it is deliberately read-only.

use crate::error::{NativeError, failed};
use serde::Serialize;
use std::path::Path;
use tauri::Manager;

use super::settings::{
    parse_app_settings_record, read_desktop_state, read_settings_file, resolve_app_settings_path,
};
use super::workspace::{
    WorkspaceDescriptor, describe_workspace, list_managed_workspaces_in, managed_vaults_root,
};

/// Where a known workspace's folder lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceKind {
    /// Inside app-private storage — created and deleted by the app.
    Managed,
    /// Anywhere else on the filesystem — only ever forgotten, never deleted.
    External,
}

/// One workspace entry for the manager list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownWorkspace {
    /// Canonical path when the folder resolves; the remembered absolute path
    /// verbatim when it does not.
    pub root_path: String,
    pub name: String,
    pub kind: WorkspaceKind,
    /// The folder is not currently a directory (unmounted drive, renamed
    /// parent, deleted by hand). Flagged rather than filtered out so the UI
    /// can show the distinction and offer Remove instead of Open.
    pub missing: bool,
}

/// Lists every workspace the app can name: recents first, then managed vaults.
#[tauri::command]
pub fn list_known_workspaces(app: tauri::AppHandle) -> Result<Vec<KnownWorkspace>, NativeError> {
    // Read the settings document exactly the way `update_desktop_state` does;
    // only the write half is skipped.
    let settings_path = resolve_app_settings_path(&app)?;
    let record = parse_app_settings_record(read_settings_file(&settings_path)?.as_deref());
    let recents = read_desktop_state(&record)
        .recent_workspace_paths()
        .to_vec();

    // Managed vaults exist only on platforms that can create them — and
    // `managed_vaults_root` creates the directory as a side effect, so it is
    // called nowhere else.
    let (managed, managed_root) = if cfg!(target_os = "android") {
        let app_data = app.path().app_data_dir().map_err(|error| {
            failed(
                "workspace.app_data_unavailable",
                "Could not find where this app keeps managed workspaces.",
                error,
            )
        })?;
        (
            list_managed_workspaces_in(&app_data)?,
            Some(managed_vaults_root(&app_data)?),
        )
    } else {
        (Vec::new(), None)
    };

    Ok(known_workspaces(
        &recents,
        &managed,
        managed_root.as_deref(),
    ))
}

/// Merges remembered recents and managed vaults into the manager's list.
///
/// Recents come first in their stored (recency) order; managed vaults not
/// already among the recents are appended in the order the managed listing
/// produced. `kind` is `Managed` when the path appears in the managed list or
/// sits directly under the managed root — the second check catches a vault
/// listed before it was ever opened.
pub fn known_workspaces(
    recents: &[String],
    managed: &[WorkspaceDescriptor],
    managed_root: Option<&Path>,
) -> Vec<KnownWorkspace> {
    let managed_paths: Vec<&str> = managed.iter().map(|w| w.root_path.as_str()).collect();
    let mut seen: Vec<String> = Vec::with_capacity(recents.len() + managed.len());
    let mut workspaces = Vec::new();

    let push = |path: String, workspaces: &mut Vec<KnownWorkspace>, seen: &mut Vec<String>| {
        if seen.contains(&path) {
            return;
        }
        seen.push(path.clone());
        let is_managed = managed_paths.contains(&path.as_str())
            || managed_root.is_some_and(|root| Path::new(&path).parent() == Some(root));
        workspaces.push(KnownWorkspace {
            missing: !Path::new(&path).is_dir(),
            name: describe_workspace(Path::new(&path)).name,
            kind: if is_managed {
                WorkspaceKind::Managed
            } else {
                WorkspaceKind::External
            },
            root_path: path,
        });
    };

    for path in recents {
        push(path.clone(), &mut workspaces, &mut seen);
    }
    for descriptor in managed {
        push(descriptor.root_path.clone(), &mut workspaces, &mut seen);
    }
    workspaces
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::make_temp_test_dir;

    fn descriptor(path: &Path) -> WorkspaceDescriptor {
        describe_workspace(path)
    }

    #[test]
    fn recents_come_first_then_unlisted_managed_vaults() {
        let app_data = make_temp_test_dir("known-order", "workspace", true);
        let managed_root = app_data.join("vaults");
        let managed_a = managed_root.join("alpha");
        let managed_b = managed_root.join("beta");
        let external = app_data.join("elsewhere");
        std::fs::create_dir_all(&managed_a).unwrap();
        std::fs::create_dir_all(&managed_b).unwrap();
        std::fs::create_dir_all(&external).unwrap();
        let external_path = external.to_string_lossy().to_string();
        let a_path = managed_a.to_string_lossy().to_string();
        let b_path = managed_b.to_string_lossy().to_string();

        let managed = vec![descriptor(&managed_b), descriptor(&managed_a)];
        // `a` is both a recent and managed — it must appear once, in the
        // recency slot, and still be recognized as managed.
        let listed = known_workspaces(
            &[external_path.clone(), a_path.clone()],
            &managed,
            Some(&managed_root),
        );

        assert_eq!(
            listed
                .iter()
                .map(|w| w.root_path.as_str())
                .collect::<Vec<_>>(),
            [external_path.as_str(), a_path.as_str(), b_path.as_str()]
        );
        assert_eq!(listed[0].kind, WorkspaceKind::External);
        assert_eq!(listed[1].kind, WorkspaceKind::Managed);
        assert_eq!(listed[2].kind, WorkspaceKind::Managed);
        assert!(!listed[0].missing);
        assert_eq!(listed[1].name, "alpha");

        std::fs::remove_dir_all(&app_data).ok();
    }

    #[test]
    fn missing_folders_are_flagged_and_unmanaged_roots_are_external() {
        let missing = "/definitely/not/mounted/vault".to_string();
        let listed = known_workspaces(&[missing.clone()], &[], None);

        assert_eq!(listed.len(), 1);
        assert!(listed[0].missing);
        assert_eq!(listed[0].kind, WorkspaceKind::External);
        assert_eq!(listed[0].name, "vault");
    }
}
