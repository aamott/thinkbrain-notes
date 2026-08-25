//! Desktop-state tests: MRU merging, extension directories, schema version
//! tolerance (newer/older builds), active-tab clearing semantics, and the
//! per-workspace `workspaceViews` (collapsed groups) and `workspaceTabs` maps.

use crate::commands::settings::*;
use crate::commands::workspace::resolve_workspace_root;
use serde_json::Value;
use std::fs;

use super::temp_test_dir;

#[test]
fn desktop_state_update_merges_concurrent_mrus_and_preserves_app_settings() {
    let temp_dir = temp_test_dir("state_merge");
    let one = temp_dir.join("one");
    let two = temp_dir.join("two");
    let legacy = temp_dir.join("legacy");
    std::fs::create_dir_all(&one).unwrap();
    std::fs::create_dir_all(&two).unwrap();
    std::fs::create_dir_all(&legacy).unwrap();

    let one_path = resolve_workspace_root(&one.to_string_lossy())
        .unwrap()
        .to_string_lossy()
        .to_string();
    let two_path = resolve_workspace_root(&two.to_string_lossy())
        .unwrap()
        .to_string_lossy()
        .to_string();
    let legacy_path = resolve_workspace_root(&legacy.to_string_lossy())
        .unwrap()
        .to_string_lossy()
        .to_string();

    let first_json = serde_json::json!({
        "theme": "dark",
        "extensionSettings": { "timer": { "enabled": true } },
        "lastWorkspacePath": legacy_path,
        "explorerOpen": false
    });

    let first = update_desktop_state_contents(
        Some(&first_json.to_string()),
        DesktopStateUpdate {
            last_workspace_path: Some(Some(one_path.clone())),
            recent_workspace_paths: Some(vec![one_path.clone(), legacy_path.clone()]),
            left_panel_width: Some(352.0),
            bottom_panel_open: Some(true),
            ..Default::default()
        },
    )
    .expect("first desktop-state update succeeds");

    let second = update_desktop_state_contents(
        Some(&first),
        DesktopStateUpdate {
            recent_workspace_paths: Some(vec![two_path.clone(), legacy_path.clone()]),
            explorer_open: Some(true),
            right_panel_width: Some(512.0),
            ..Default::default()
        },
    )
    .expect("second desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&second).expect("serialized settings are valid");
    assert_eq!(settings["theme"], serde_json::json!("dark"));
    assert_eq!(
        settings["extensionSettings"]["timer"]["enabled"],
        serde_json::json!(true)
    );
    // Legacy flat-schema keys are no longer migrated/removed — they are
    // preserved as unrelated app settings (DESKTOP_STATE_VERSION >= 5).
    assert_eq!(
        settings["lastWorkspacePath"],
        serde_json::json!(legacy_path)
    );
    assert_eq!(settings["explorerOpen"], serde_json::json!(false));
    assert_eq!(
        settings["desktopState"],
        serde_json::json!({
            "version": 5,
            "lastWorkspacePath": one_path,
            "recentWorkspacePaths": [two_path, legacy_path, one_path],
            "workspaceViews": {},
            "workspaceTabs": {},
            "explorerOpen": true,
            "leftPanelWidth": 352.0,
            "rightPanelWidth": 480.0,
            "bottomPanelOpen": true,
            "developmentExtensionDirectories": [],
            "openTabs": [],
            "activeTabId": null
        })
    );
}

#[test]
fn desktop_state_persists_development_extension_directories_verbatim() {
    // Directories are stored as given — not canonicalized — so a directory
    // that is temporarily missing stays in the list instead of vanishing.
    let stored = update_desktop_state_contents(
        None,
        DesktopStateUpdate {
            development_extension_directories: Some(vec![
                "/ext/one".to_string(),
                "".to_string(),
                "/ext/two".to_string(),
                "/ext/one".to_string(),
            ]),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!(["/ext/one", "/ext/two"])
    );

    // An update that does not mention the field keeps the stored list.
    let unchanged = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            explorer_open: Some(true),
            ..Default::default()
        },
    )
    .expect("unrelated desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&unchanged).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!(["/ext/one", "/ext/two"])
    );
}

#[test]
fn desktop_state_without_extension_directories_defaults_to_empty() {
    let existing = serde_json::json!({
        "desktopState": { "version": 3, "explorerOpen": true }
    });

    let updated =
        update_desktop_state_contents(Some(&existing.to_string()), DesktopStateUpdate::default())
            .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["developmentExtensionDirectories"],
        serde_json::json!([])
    );
}

/// A branch switch runs a newer build and then an older one. Treating the newer
/// build's document as unreadable threw away the workspace, the open tabs and
/// the panel layout in one write; every schema here is additive, so the older
/// build can read all of it but the fields it has never heard of.
#[test]
fn desktop_state_from_a_newer_build_is_read_rather_than_discarded() {
    let existing = serde_json::json!({
        "desktopState": {
            "version": 99,
            "explorerOpen": false,
            "leftPanelWidth": 352.0,
            "somethingLaterAdded": "not understood here"
        }
    });

    let updated =
        update_desktop_state_contents(Some(&existing.to_string()), DesktopStateUpdate::default())
            .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    // Both differ from their defaults, so reading them back is the proof.
    assert_eq!(settings["desktopState"]["explorerOpen"], false);
    assert_eq!(settings["desktopState"]["leftPanelWidth"], 352.0);
}

/// Reading a newer document is only half of it: this build then writes the
/// document back, and anything it rebuilt from scratch would drop whatever the
/// newer build had added. Carrying the unknown fields through — and leaving the
/// version where it was — makes the round trip lossless, so switching branches
/// costs nothing at all rather than costing the newest feature's state.
#[test]
fn desktop_state_from_a_newer_build_survives_a_write_by_this_one() {
    let existing = serde_json::json!({
        "desktopState": {
            "version": 99,
            "explorerOpen": false,
            "somethingLaterAdded": { "kept": true }
        }
    });

    let updated = update_desktop_state_contents(
        Some(&existing.to_string()),
        DesktopStateUpdate {
            bottom_panel_open: Some(true),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["somethingLaterAdded"],
        serde_json::json!({ "kept": true })
    );
    assert_eq!(settings["desktopState"]["version"], 99);
    assert_eq!(settings["desktopState"]["bottomPanelOpen"], true);
    assert_eq!(settings["desktopState"]["explorerOpen"], false);
}

#[test]
fn desktop_state_with_a_version_that_is_not_a_version_falls_back_to_defaults() {
    let existing = serde_json::json!({
        "desktopState": { "version": "five", "explorerOpen": false, "leftPanelWidth": 352.0 }
    });

    let updated =
        update_desktop_state_contents(Some(&existing.to_string()), DesktopStateUpdate::default())
            .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&updated).expect("serialized settings are valid");
    assert_eq!(settings["desktopState"]["explorerOpen"], true);
    assert_eq!(settings["desktopState"]["leftPanelWidth"], 288.0);
}

#[test]
fn desktop_state_active_tab_id_explicit_null_clears_instead_of_restoring_current() {
    // Mirrors `last_workspace_path`'s `Some(None)`-clears semantics: an
    // explicit null must clear the active tab rather than keep the old one.
    let stored = update_desktop_state_contents(
        None,
        DesktopStateUpdate {
            active_tab_id: Some(Some("tab-1".to_string())),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["activeTabId"],
        serde_json::json!("tab-1")
    );

    let cleared = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            active_tab_id: Some(None),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&cleared).expect("serialized settings are valid");
    assert_eq!(settings["desktopState"]["activeTabId"], Value::Null);

    // An update that omits the field entirely keeps the current value.
    let restored = update_desktop_state_contents(Some(&stored), DesktopStateUpdate::default())
        .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&restored).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["activeTabId"],
        serde_json::json!("tab-1")
    );
}

/// D53: a group the user collapsed stays collapsed, per workspace, in desktop
/// state rather than in their settings or in the vault.
#[test]
fn collapsed_groups_are_kept_per_workspace_and_per_view() {
    // Real directories, because a workspace path is canonicalized before it is
    // stored — an imaginary one would be dropped and prove nothing.
    let first_root = temp_test_dir("collapse_first");
    let second_root = temp_test_dir("collapse_second");
    let first_path = first_root.to_string_lossy().to_string();
    let second_path = second_root.to_string_lossy().to_string();

    let collapse = |contents: Option<&str>, workspace: &str, view: &str, keys: Vec<String>| {
        update_desktop_state_contents(
            contents,
            DesktopStateUpdate {
                last_workspace_path: Some(Some(workspace.to_string())),
                collapsed_groups: Some(CollapsedGroupsUpdate {
                    workspace_path: workspace.to_string(),
                    view_id: view.to_string(),
                    collapsed: keys,
                }),
                ..Default::default()
            },
        )
        .expect("desktop-state update succeeds")
    };

    let stored = collapse(
        None,
        &first_path,
        "journal",
        vec!["2026".to_string(), "2026-08".to_string()],
    );
    // A second vault must not overwrite the first: two windows write this field
    // without knowing about each other.
    let stored = collapse(
        Some(&stored),
        &second_path,
        "journal",
        vec!["2025".to_string()],
    );

    // A second view of the same vault sits beside the first rather than
    // replacing it: the explorer tree has the same problem and will want a row
    // here, and one write must not take the other's.
    let stored = collapse(
        Some(&stored),
        &first_path,
        "explorer",
        vec!["notes".to_string()],
    );

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    let views = &settings["desktopState"]["workspaceViews"];
    assert_eq!(
        views[&first_path]["journal"],
        serde_json::json!(["2026", "2026-08"])
    );
    assert_eq!(views[&first_path]["explorer"], serde_json::json!(["notes"]));
    assert_eq!(views[&second_path]["journal"], serde_json::json!(["2025"]));

    // Reopening a group writes a shorter list, and an empty one is a real answer
    // rather than an absent one — every group is open.
    let reopened = collapse(Some(&stored), &first_path, "journal", Vec::new());
    let settings: Value = serde_json::from_str(&reopened).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["workspaceViews"][&first_path]["journal"],
        serde_json::json!([])
    );

    fs::remove_dir_all(&first_root).ok();
    fs::remove_dir_all(&second_root).ok();
}

/// Two windows on two vaults must not show each other's tabs.
///
/// Tabs used to be one flat list in a document every window shares, so the last
/// window to touch a tab overwrote the other's list, and on the next launch both
/// restored the same tabs — pointing at whichever vault had written them. They
/// are keyed by workspace for the same reason the collapsed groups are, and
/// written the same targeted way: sending the whole map would put back exactly
/// the overwriting this removes.
#[test]
fn tabs_are_kept_per_workspace() {
    let first_root = temp_test_dir("tabs_first");
    let second_root = temp_test_dir("tabs_second");
    let first_path = first_root.to_string_lossy().to_string();
    let second_path = second_root.to_string_lossy().to_string();

    let open = |contents: Option<&str>, workspace: &str, note: &str| {
        update_desktop_state_contents(
            contents,
            DesktopStateUpdate {
                last_workspace_path: Some(Some(workspace.to_string())),
                workspace_tabs: Some(WorkspaceTabsUpdate {
                    workspace_path: workspace.to_string(),
                    open_tabs: vec![PersistedTab {
                        id: format!("editor:{workspace}:{note}"),
                        title: note.to_string(),
                        kind: "editor".to_string(),
                        root_path: Some(workspace.to_string()),
                        relative_path: Some(note.to_string()),
                    }],
                    active_tab_id: Some(format!("editor:{workspace}:{note}")),
                }),
                ..Default::default()
            },
        )
        .expect("desktop-state update succeeds")
    };

    let stored = open(None, &first_path, "one.md");
    // The second window must leave the first window's tabs alone.
    let stored = open(Some(&stored), &second_path, "two.md");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    let tabs = &settings["desktopState"]["workspaceTabs"];

    assert_eq!(tabs[&first_path]["openTabs"][0]["relativePath"], "one.md");
    assert_eq!(tabs[&second_path]["openTabs"][0]["relativePath"], "two.md");
    assert_eq!(
        tabs[&first_path]["openTabs"].as_array().map(Vec::len),
        Some(1),
        "the second window added its tab to the first window's list"
    );
    assert_eq!(
        tabs[&first_path]["activeTabId"],
        format!("editor:{first_path}:one.md")
    );

    // Closing every tab is a real answer, not an absent one.
    let emptied = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            last_workspace_path: Some(Some(first_path.clone())),
            workspace_tabs: Some(WorkspaceTabsUpdate {
                workspace_path: first_path.clone(),
                open_tabs: Vec::new(),
                active_tab_id: None,
            }),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");
    let settings: Value = serde_json::from_str(&emptied).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["workspaceTabs"][&first_path]["openTabs"],
        serde_json::json!([])
    );
    // ...and it does not disturb the other vault.
    assert_eq!(
        settings["desktopState"]["workspaceTabs"][&second_path]["openTabs"][0]["relativePath"],
        "two.md"
    );

    fs::remove_dir_all(&first_root).ok();
    fs::remove_dir_all(&second_root).ok();
}

/// The stored views follow the recent-workspace list rather than carrying a
/// bound of their own, so a vault the app has forgotten stops costing anything.
#[test]
fn collapsed_groups_are_dropped_for_a_workspace_no_longer_remembered() {
    let root = temp_test_dir("collapse_forgotten");
    let path = root.to_string_lossy().to_string();

    let stored = update_desktop_state_contents(
        None,
        DesktopStateUpdate {
            last_workspace_path: Some(Some(path.clone())),
            collapsed_groups: Some(CollapsedGroupsUpdate {
                workspace_path: path.clone(),
                view_id: "journal".to_string(),
                collapsed: vec!["2026".to_string()],
            }),
            ..Default::default()
        },
    )
    .expect("desktop-state update succeeds");

    let settings: Value = serde_json::from_str(&stored).expect("serialized settings are valid");
    assert!(settings["desktopState"]["workspaceViews"][&path].is_object());

    // Forgetting the vault takes what was collapsed in it: there is no panel
    // left to restore, and one policy is easier to reason about than two.
    fs::remove_dir_all(&root).ok();
    let forgotten = update_desktop_state_contents(
        Some(&stored),
        DesktopStateUpdate {
            last_workspace_path: Some(None),
            recent_workspace_paths: Some(Vec::new()),
            ..Default::default()
        },
    )
    .expect("update succeeds");

    let settings: Value = serde_json::from_str(&forgotten).expect("serialized settings are valid");
    assert_eq!(
        settings["desktopState"]["workspaceViews"],
        serde_json::json!({})
    );
}
