//! Settings tests: workspace hashing, settings path layout, read/write
//! round-trips, atomic replacement, corrupt-document quarantine, write
//! preconditions (optimistic concurrency), quarantine reporting, and app-theme
//! updates.

use crate::commands::{settings::*, workspace::*};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::temp_test_dir;

#[test]
fn workspace_hash_is_stable_and_path_specific() {
    assert_eq!(
        stable_workspace_hash("/home/user/vault"),
        stable_workspace_hash("/home/user/vault")
    );
    assert_ne!(
        stable_workspace_hash("/home/user/vault"),
        stable_workspace_hash("/home/user/other-vault")
    );
}

#[test]
fn settings_paths_stay_under_app_data() {
    let app_data_dir = PathBuf::from("/tmp/thinkbrain-app-data");
    let workspace_root = PathBuf::from("/tmp/user-vault");

    let app_path = app_settings_path(&app_data_dir);
    let workspace_path = workspace_settings_path(&app_data_dir, &workspace_root);
    let expected_workspace_file_name = format!(
        "workspace-{:016x}.json",
        stable_workspace_hash(&workspace_root.to_string_lossy())
    );

    assert_eq!(app_path, app_data_dir.join("settings").join("app.json"));
    assert!(workspace_path.starts_with(app_data_dir.join("settings")));
    assert!(!workspace_path.starts_with(&workspace_root));
    assert_eq!(
        workspace_path.file_name().and_then(|name| name.to_str()),
        Some(expected_workspace_file_name.as_str())
    );
}

#[test]
fn settings_read_returns_none_when_file_is_absent() {
    let settings_path = temp_test_dir("missing").join("settings").join("app.json");

    assert_eq!(
        read_settings_file(&settings_path).expect("missing settings read succeeds"),
        None
    );
}

#[test]
fn settings_write_creates_parent_directory_and_round_trips() {
    let temp_dir = temp_test_dir("write");
    let settings_path = temp_dir.join("settings").join("app.json");
    let contents = "{\n  \"version\": 1\n}\n";

    write_settings_file(&settings_path, contents).expect("settings write succeeds");

    assert_eq!(
        read_settings_file(&settings_path).expect("settings read succeeds"),
        Some(contents.to_string())
    );

    fs::remove_dir_all(temp_dir).expect("temp settings directory is cleaned up");
}

/// A crash mid-`fs::write` would leave a truncated file. The helper writes a
/// sibling temp and renames over the destination, so the previous contents
/// stay until the new ones are fully on disk.
#[test]
fn write_file_atomically_replaces_the_destination_and_leaves_no_temp() {
    let temp_dir = temp_test_dir("atomic-write");
    let path = temp_dir.join("note.md");
    fs::write(&path, "old").expect("the previous contents are written");

    write_file_atomically(&path, "new").expect("the atomic write succeeds");

    assert_eq!(
        fs::read_to_string(&path).expect("the note is readable"),
        "new"
    );
    let leftovers: Vec<_> = fs::read_dir(&temp_dir)
        .expect("the folder is readable")
        .map(|entry| entry.expect("the entry is readable").file_name())
        .collect();
    assert_eq!(leftovers.as_slice(), [std::ffi::OsString::from("note.md")]);

    fs::remove_dir_all(temp_dir).expect("temp atomic-write directory is cleaned up");
}

/// A settings document nobody can parse is about to be replaced by whatever the
/// app writes next, and everything in it is gone for good. Setting it aside
/// first costs one file and makes the loss recoverable by hand.
#[test]
fn a_settings_document_that_cannot_be_parsed_is_set_aside_before_it_is_replaced() {
    let temp_dir = temp_test_dir("corrupt");
    let settings_path = temp_dir.join("settings").join("app.json");
    fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
    fs::write(&settings_path, "{\"theme\": \"dark\", trunc").unwrap();

    assert_eq!(
        read_settings_file(&settings_path).expect("corrupt settings read succeeds"),
        None
    );
    assert_eq!(
        fs::read_to_string(temp_dir.join("settings").join("app.corrupt.json")).unwrap(),
        "{\"theme\": \"dark\", trunc"
    );
    assert!(!settings_path.exists());

    fs::remove_dir_all(temp_dir).expect("temp settings directory is cleaned up");
}

/// An empty file says nothing was ever stored, so there is nothing to preserve.
/// Quarantining it would leave a useless file behind after every first run that
/// was interrupted.
#[test]
fn an_empty_settings_document_is_read_as_absent_rather_than_set_aside() {
    let temp_dir = temp_test_dir("empty");
    let settings_path = temp_dir.join("settings").join("app.json");
    fs::create_dir_all(settings_path.parent().unwrap()).unwrap();
    fs::write(&settings_path, "  \n").unwrap();

    assert_eq!(
        read_settings_file(&settings_path).expect("empty settings read succeeds"),
        None
    );
    assert!(!temp_dir.join("settings").join("app.corrupt.json").exists());

    fs::remove_dir_all(temp_dir).expect("temp settings directory is cleaned up");
}

#[test]
fn workspace_settings_write_is_refused_when_the_file_moved_underneath_it() {
    // Another window wrote between this window's read and its write, so the
    // document it revised is no longer the one on disk.
    assert!(check_settings_precondition(
        Some("{\"showHidden\":true}"),
        Some("{\"fieldDefinitions\":[]}"),
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
    .is_err());

    // Nobody interfered.
    assert!(check_settings_precondition(
        Some("{\"showHidden\":true}"),
        Some("{\"showHidden\":true}"),
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
    .is_ok());
}

#[test]
fn workspace_settings_write_treats_an_absent_file_as_a_precondition_of_its_own() {
    // The first writer read nothing and expects to still find nothing.
    assert!(check_settings_precondition(
        None,
        None,
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
    .is_ok());

    // A file appeared where this writer saw none.
    assert!(check_settings_precondition(
        Some("{}"),
        None,
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
    .is_err());

    // The file this writer read has since been removed.
    assert!(check_settings_precondition(
        None,
        Some("{}"),
        "settings.workspace_conflict",
        "The workspace settings changed while this one was being saved.",
    )
    .is_err());
}

#[test]
fn app_settings_write_is_refused_when_desktop_state_changed_underneath_it() {
    // `update_desktop_state` landed (a tab opened) between the store's read and
    // its write, so the document the store revised is no longer the one on disk.
    assert!(check_settings_precondition(
        Some("{\"desktopState\":{\"openTabs\":[\"a\"]}}"),
        Some("{\"desktopState\":{\"openTabs\":[]}}"),
        "settings.app_conflict",
        "The application settings changed while this one was being saved.",
    )
    .is_err());

    // Nobody interfered.
    assert!(check_settings_precondition(
        Some("{\"appearance.theme\":\"dark\"}"),
        Some("{\"appearance.theme\":\"dark\"}"),
        "settings.app_conflict",
        "The application settings changed while this one was being saved.",
    )
    .is_ok());
}

#[test]
fn app_settings_write_treats_an_absent_file_as_a_precondition_of_its_own() {
    let app_code = "settings.app_conflict";
    let app_msg = "The application settings changed while this one was being saved.";
    assert!(check_settings_precondition(None, None, app_code, app_msg).is_ok());
    assert!(check_settings_precondition(Some("{}"), None, app_code, app_msg).is_err());
    assert!(check_settings_precondition(None, Some("{}"), app_code, app_msg).is_err());
}

/// Setting a document aside is something the user has to be told about.
///
/// The quarantine already worked, but it only said so on stderr — so from
/// inside the app the user's theme, workspace and tabs simply reverted to
/// defaults with no explanation, which is the same experience as the data loss
/// this whole story was written to stop.
#[test]
fn a_quarantined_settings_document_is_remembered_for_the_user() {
    let dir = temp_test_dir("quarantine-reported");
    let path = dir.join("app.json");
    fs::write(&path, "{ this is not json").expect("the broken document is written");

    let read = read_settings_file(&path).expect("reading does not fail");

    assert!(
        read.is_none(),
        "an unparseable document was handed back as settings"
    );
    let reported = quarantined_settings_paths();
    let quarantine = dir.join("app.corrupt.json").to_string_lossy().into_owned();
    assert!(
        reported.contains(&quarantine),
        "the recorded path is not where the document was put: {reported:?}"
    );
    assert!(
        dir.join("app.corrupt.json").is_file(),
        "the document was not kept"
    );

    fs::remove_dir_all(&dir).ok();
}

/// A document that simply is not there is not news.
#[test]
fn an_absent_settings_document_is_not_reported_as_quarantined() {
    let dir = temp_test_dir("quarantine-absent");

    let read = read_settings_file(&dir.join("app.json")).expect("reading does not fail");

    assert!(read.is_none());
    let reported = quarantined_settings_paths();
    assert!(
        reported
            .iter()
            .all(|path| !Path::new(path).starts_with(&dir)),
        "absence was reported as damage: {reported:?}"
    );

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn app_theme_update_replaces_theme_and_preserves_other_settings() {
    let existing = serde_json::json!({
        "version": 1,
        "theme": "system",
        "editor": { "fontSize": 18, "lineWrapping": false },
        "extensionSettings": { "timer": { "enabled": true } },
        "desktopState": {
            "version": 2,
            "lastWorkspacePath": "/notes/vault",
            "recentWorkspacePaths": ["/notes/vault"],
            "explorerOpen": false
        }
    });

    let updated = update_app_theme_contents(Some(&existing.to_string()), "dark")
        .expect("theme update succeeds");

    // The document keeps the canonical on-disk shape (pretty JSON + newline).
    assert!(updated.ends_with("}\n"));

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(settings["theme"], serde_json::json!("dark"));
    assert_eq!(settings["version"], serde_json::json!(1));
    assert_eq!(
        settings["editor"],
        serde_json::json!({ "fontSize": 18, "lineWrapping": false })
    );
    assert_eq!(
        settings["extensionSettings"]["timer"]["enabled"],
        serde_json::json!(true)
    );
    assert_eq!(settings["desktopState"], existing["desktopState"]);

    // A missing settings file still yields a valid document with only the theme.
    let created = update_app_theme_contents(None, "light").expect("theme update seeds settings");
    let created_settings: Value =
        serde_json::from_str(&created).expect("seeded settings are valid");
    assert_eq!(created_settings, serde_json::json!({ "theme": "light" }));

    for theme in ["system", "light", "dark"] {
        let round_trip =
            update_app_theme_contents(Some(&updated), theme).expect("supported theme is accepted");
        let round_trip_settings: Value =
            serde_json::from_str(&round_trip).expect("serialized settings are valid");
        assert_eq!(round_trip_settings["theme"], serde_json::json!(theme));
    }

    // Unsupported themes fail loudly instead of writing an unusable document.
    for invalid in ["", "neon", "Dark", "high-contrast"] {
        let error = update_app_theme_contents(Some(&updated), invalid)
            .expect_err("unsupported theme is rejected");
        assert_eq!(error.code, "settings.invalid_theme");
    }
}
