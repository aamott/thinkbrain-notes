//! Managed-vault delete tests: the vault and all of its hash-keyed metadata
//! (settings, search index + WAL siblings, hidden repo, backups), and the
//! guard that only a direct child of the `vaults/` root can be deleted.

use std::fs;
use std::path::{Path, PathBuf};

use crate::commands::workspace::{
    create_managed_workspace_in, delete_managed_workspace_in, managed_vaults_root,
};
use crate::tests::make_temp_test_dir;

/// Hash-keyed metadata the delete must wipe, laid out exactly the way the
/// real modules compute it.
fn seed_metadata(app_data: &Path, canonical_target: &Path) -> Vec<PathBuf> {
    let canonical = canonical_target.to_string_lossy().to_string();
    let settings = crate::commands::settings::workspace_settings_path(app_data, canonical_target);
    let index = crate::commands::search::search_index_file(app_data, &canonical);
    let repo = crate::commands::sync::bootstrap::hidden_repo_path(app_data, &canonical);
    let backups = crate::commands::backup::workspace_backups_dir(app_data, canonical_target);

    fs::create_dir_all(settings.parent().unwrap()).unwrap();
    fs::write(&settings, "{}").unwrap();
    fs::create_dir_all(index.parent().unwrap()).unwrap();
    let mut seeded = vec![settings, index.clone()];
    // Rollback journaling leaves `-journal` siblings; wal/shm are seeded too.
    for suffix in ["", "-journal", "-wal", "-shm"] {
        let mut sibling = index.clone().into_os_string();
        sibling.push(suffix);
        let sibling = PathBuf::from(sibling);
        fs::write(&sibling, "x").unwrap();
        seeded.push(sibling);
    }
    fs::create_dir_all(repo.join("objects")).unwrap();
    seeded.push(repo);
    fs::create_dir_all(backups.join("note.md")).unwrap();
    seeded.push(backups);
    seeded
}

#[test]
fn deleting_a_managed_vault_removes_it_and_all_its_metadata() {
    let app_data = make_temp_test_dir("managed-delete", "workspace", true);
    let vault =
        create_managed_workspace_in(&app_data, "Recipes").expect("managed workspace is created");
    let vault_path = PathBuf::from(&vault.root_path);
    fs::write(vault_path.join("note.md"), "x").unwrap();
    let canonical = vault_path.to_string_lossy().to_string();
    crate::commands::sync::registry::attach(
        &app_data,
        &vault_path,
        &canonical,
        "managed-delete-window",
    )
    .expect("sync engine is attached");
    crate::commands::watcher::remember_root_for_test(&canonical, "managed-delete-window");
    let metadata = seed_metadata(&app_data, &vault_path);

    delete_managed_workspace_in(&app_data, &vault.root_path).expect("delete succeeds");

    assert!(!vault_path.exists());
    assert!(crate::commands::sync::registry::engine(&canonical).is_none());
    assert!(!crate::commands::watcher::is_root_watched_for_test(
        &canonical
    ));
    for path in metadata {
        assert!(!path.exists(), "{path:?} survived the delete");
    }
    // The vaults root itself is untouched.
    assert!(managed_vaults_root(&app_data).unwrap().is_dir());
    fs::remove_dir_all(&app_data).ok();
}

#[test]
fn deleting_a_managed_vault_rejects_paths_outside_the_root_and_the_root() {
    let app_data = make_temp_test_dir("managed-delete-guard", "workspace", true);
    let outside = app_data.join("outside");
    fs::create_dir_all(&outside).unwrap();

    for target in [
        outside.to_string_lossy().to_string(),
        managed_vaults_root(&app_data)
            .unwrap()
            .to_string_lossy()
            .to_string(),
    ] {
        let error = delete_managed_workspace_in(&app_data, &target)
            .expect_err("a path that is not a direct vault child is rejected");
        assert_eq!(
            error.code, "workspace.managed_path_invalid",
            "target: {target}"
        );
    }
    assert!(outside.is_dir());
    fs::remove_dir_all(&app_data).ok();
}

#[test]
fn deleting_a_managed_vault_rejects_a_path_that_is_gone() {
    let app_data = make_temp_test_dir("managed-delete-missing", "workspace", true);
    let vault =
        create_managed_workspace_in(&app_data, "Gone").expect("managed workspace is created");
    fs::remove_dir_all(&vault.root_path).unwrap();

    let error = delete_managed_workspace_in(&app_data, &vault.root_path)
        .expect_err("a missing vault is rejected");

    assert_eq!(error.code, "workspace.managed_missing");
    fs::remove_dir_all(&app_data).ok();
}
