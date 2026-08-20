use crate::commands::{markdown::*, search::*, settings::*, workspace::*};
use crate::NativeError;
use rusqlite::Connection;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

#[test]
fn workspace_window_roots_are_scoped_to_opaque_window_labels() {
    let roots = WorkspaceWindowRoots::default();
    let first = next_workspace_window_label();
    let second = next_workspace_window_label();

    assert_ne!(first, second);
    assert!(first.starts_with("workspace-"));
    register_workspace_window_root(&roots, first.clone(), "/notes/first".to_string());
    register_workspace_window_root(&roots, second.clone(), "/notes/second".to_string());

    assert_eq!(
        workspace_window_root(&roots, &first),
        Some("/notes/first".to_string())
    );
    assert_eq!(
        workspace_window_root(&roots, &second),
        Some("/notes/second".to_string())
    );

    unregister_workspace_window_root(&roots, &first);
    assert_eq!(workspace_window_root(&roots, &first), None);
    assert_eq!(
        workspace_window_root(&roots, &second),
        Some("/notes/second".to_string())
    );
}
fn record(
    path: &str,
    file_name: &str,
    title: Option<&str>,
    tags: &[&str],
    aliases: &[&str],
    body: &str,
) -> DocumentRecord {
    DocumentRecord {
        path: path.to_string(),
        file_name: file_name.to_string(),
        title: title.map(str::to_string),
        tags: tags.iter().map(|tag| tag.to_string()).collect(),
        aliases: aliases.iter().map(|alias| alias.to_string()).collect(),
        body: body.to_string(),
        metadata: Vec::new(),
    }
}

fn in_memory_index() -> Connection {
    let connection = Connection::open_in_memory().expect("in-memory database opens");
    init_index_schema(&connection).expect("schema initializes");
    connection
}

fn result_paths(connection: &Connection, query: &str) -> Vec<String> {
    search_documents(
        connection,
        &SearchQuery {
            text: query,
            path_prefix: "",
            limit: 50,
        },
    )
    .expect("search succeeds")
    .into_iter()
    .map(|hit| hit.path)
    .collect()
}

/// Creates a unique temp directory for a test and returns its path.
///
/// `prefix` selects the directory-name prefix (`thinkbrain-{prefix}-{unique}`)
/// so callers can keep their existing namespace. `canonicalize` should be true
/// for tests that exercise the live watcher: on macOS the temp directory is a
/// symlink (`/var` -> `/private/var`) and FSEvents reports the resolved
/// spelling, so an uncanonicalized root would fail to match a single event
/// path and the live watcher tests would pass vacuously.
pub(crate) fn make_temp_test_dir(name: &str, prefix: &str, canonicalize: bool) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time is after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("thinkbrain-{prefix}-{name}-{unique}"));

    fs::create_dir_all(&path).expect("temp directory is created");
    if canonicalize {
        path.canonicalize().expect("temp directory canonicalizes")
    } else {
        path
    }
}

fn temp_test_dir(name: &str) -> PathBuf {
    make_temp_test_dir(name, "notes", true)
}

#[test]
fn shell_status_reports_ready_desktop_shell() {
    let status = desktop_shell_status().expect("shell status should succeed");

    assert_eq!(status.app_name, "Thinkbrain Notes");
    assert_eq!(status.shell_version, env!("CARGO_PKG_VERSION"));
    assert!(status.ready);
}

#[test]
fn native_error_shape_supports_optional_details() {
    let error = NativeError::with_details(
        "desktop.test_failure",
        "The test error is shaped consistently.",
        "extra context",
    );

    assert_eq!(error.code, "desktop.test_failure");
    assert_eq!(error.message, "The test error is shaped consistently.");
    assert_eq!(error.details.as_deref(), Some("extra context"));
}

#[test]
fn relative_paths_are_normalized_for_frontend_use() {
    assert_eq!(
        normalize_relative_path("folder\\note.md").expect("path should normalize"),
        "folder/note.md"
    );
}

#[test]
fn relative_paths_reject_workspace_escape() {
    let error = normalize_relative_path("../note.md").expect_err("path should be rejected");

    assert_eq!(error.code, "workspace.invalid_path");
}

#[test]
fn markdown_path_detection_accepts_markdown_extensions() {
    assert!(is_markdown_path(Path::new("note.md")));
    assert!(is_markdown_path(Path::new("note.MARKDOWN")));
    assert!(!is_markdown_path(Path::new("note.txt")));
}

#[test]
fn hidden_entries_are_dot_prefixed() {
    assert!(is_hidden_name(".git"));
    assert!(is_hidden_name(".obsidian"));
    assert!(!is_hidden_name("Notes"));
    assert!(!is_hidden_name("note.md"));
}

#[test]
fn search_matches_filename_body_tags_and_aliases() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record(
                "projects/roadmap.md",
                "roadmap.md",
                Some("Quarterly Roadmap"),
                &["planning", "project"],
                &["Q3 Plan"],
                "Ship the indexer and search experience this quarter.",
            ),
            record(
                "daily/inbox.md",
                "inbox.md",
                Some("Inbox"),
                &["capture"],
                &[],
                "Loose notes about kombucha brewing.",
            ),
        ],
    )
    .expect("documents index");

    // Filename match.
    assert_eq!(
        result_paths(&connection, "roadmap"),
        vec!["projects/roadmap.md"]
    );
    // Body match.
    assert_eq!(
        result_paths(&connection, "kombucha"),
        vec!["daily/inbox.md"]
    );
    // Tag match.
    assert_eq!(
        result_paths(&connection, "planning"),
        vec!["projects/roadmap.md"]
    );
    // Alias match.
    assert_eq!(result_paths(&connection, "Q3"), vec!["projects/roadmap.md"]);
    // Title match.
    assert_eq!(
        result_paths(&connection, "quarterly"),
        vec!["projects/roadmap.md"]
    );
}

#[test]
fn search_supports_prefix_matching_for_type_ahead() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "notes/linguistics.md",
            "linguistics.md",
            None,
            &[],
            &[],
            "Phonology and morphology overview.",
        )],
    )
    .expect("document indexes");

    assert_eq!(
        result_paths(&connection, "ling"),
        vec!["notes/linguistics.md"]
    );
    assert_eq!(
        result_paths(&connection, "phon"),
        vec!["notes/linguistics.md"]
    );
}

#[test]
fn rebuild_replaces_previous_index_contents() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "old.md",
            "old.md",
            None,
            &[],
            &[],
            "obsolete content",
        )],
    )
    .expect("first index");

    clear_documents(&mut connection).expect("index clears");
    index_document_records(
        &mut connection,
        &[record("new.md", "new.md", None, &[], &[], "fresh content")],
    )
    .expect("rebuild");

    assert!(result_paths(&connection, "obsolete").is_empty());
    assert_eq!(result_paths(&connection, "fresh"), vec!["new.md"]);
}

#[test]
fn deleting_a_document_removes_it_from_search() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "removable.md",
            "removable.md",
            None,
            &[],
            &[],
            "delete me",
        )],
    )
    .expect("document indexes");

    delete_document(&mut connection, "removable.md").expect("document deletes");

    assert!(result_paths(&connection, "delete").is_empty());
}

#[test]
fn malformed_and_empty_queries_do_not_panic_or_error() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[record(
            "safe.md",
            "safe.md",
            None,
            &[],
            &[],
            "harmless body text",
        )],
    )
    .expect("document indexes");

    // Empty / whitespace-only input yields no results without touching SQLite.
    assert!(build_fts_match_query("   ").is_none());
    assert!(search_documents(
        &connection,
        &SearchQuery {
            text: "",
            path_prefix: "",
            limit: 50
        }
    )
    .expect("empty query is safe")
    .is_empty());

    // FTS5 special syntax must be neutralized rather than raising an error.
    for malformed in ["\"", "*", "AND OR", "tag:", "(unbalanced", "a -b \"c"] {
        search_documents(
            &connection,
            &SearchQuery {
                text: malformed,
                path_prefix: "",
                limit: 50,
            },
        )
        .unwrap_or_else(|error| panic!("query {malformed:?} should not error: {error}"));
    }
}

/// The defect this closes: `LIMIT` ran against the whole vault, so a caller
/// asking about one folder got whatever of it survived a vault-wide ranking.
/// Scope has to be part of the query, not a filter applied to its output.
#[test]
fn a_path_prefix_scopes_the_search_before_the_limit_applies() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Notes/a.md", "a.md", None, &[], &[], "standup"),
            record("Notes/b.md", "b.md", None, &[], &[], "standup"),
            record("Notes/c.md", "c.md", None, &[], &[], "standup"),
            record(
                "Journal/2026-08-13.md",
                "2026-08-13.md",
                None,
                &[],
                &[],
                "standup",
            ),
        ],
    )
    .expect("documents index");

    let hits = search_documents(
        &connection,
        &SearchQuery {
            text: "standup",
            path_prefix: "Journal",
            limit: 2,
        },
    )
    .expect("search succeeds");

    assert_eq!(
        hits.iter().map(|hit| hit.path.as_str()).collect::<Vec<_>>(),
        vec!["Journal/2026-08-13.md"]
    );
}

#[test]
fn a_path_prefix_matches_whole_folders_not_names_that_merely_start_with_it() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Journal/today.md", "today.md", None, &[], &[], "entry"),
            record("Journal-archive/old.md", "old.md", None, &[], &[], "entry"),
            record("Journalling.md", "Journalling.md", None, &[], &[], "entry"),
        ],
    )
    .expect("documents index");

    // Leading and trailing slashes are trimmed, the way the metadata queries
    // already treat a prefix, so "/Journal/" and "Journal" name one folder.
    for prefix in ["Journal", "/Journal/"] {
        let hits = search_documents(
            &connection,
            &SearchQuery {
                text: "entry",
                path_prefix: prefix,
                limit: 50,
            },
        )
        .expect("search succeeds");

        assert_eq!(
            hits.iter().map(|hit| hit.path.as_str()).collect::<Vec<_>>(),
            vec!["Journal/today.md"],
            "prefix {prefix:?} should name a folder, not a spelling"
        );
    }
}

#[test]
fn an_empty_path_prefix_searches_the_whole_workspace() {
    let mut connection = in_memory_index();
    index_document_records(
        &mut connection,
        &[
            record("Journal/today.md", "today.md", None, &[], &[], "entry"),
            record("Notes/other.md", "other.md", None, &[], &[], "entry"),
        ],
    )
    .expect("documents index");

    let mut paths = search_documents(
        &connection,
        &SearchQuery {
            text: "entry",
            path_prefix: "",
            limit: 50,
        },
    )
    .expect("search succeeds")
    .into_iter()
    .map(|hit| hit.path)
    .collect::<Vec<_>>();
    paths.sort();

    assert_eq!(paths, vec!["Journal/today.md", "Notes/other.md"]);
}

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
fn desktop_state_update_merges_concurrent_mrus_and_preserves_app_settings() {
    let temp_dir = temp_test_dir("state_merge");
    let one = temp_dir.join("one");
    let two = temp_dir.join("two");
    let legacy = temp_dir.join("legacy");
    std::fs::create_dir_all(&one).unwrap();
    std::fs::create_dir_all(&two).unwrap();
    std::fs::create_dir_all(&legacy).unwrap();

    let one_path = crate::commands::workspace::resolve_workspace_root(&one.to_string_lossy())
        .unwrap()
        .to_string_lossy()
        .to_string();
    let two_path = crate::commands::workspace::resolve_workspace_root(&two.to_string_lossy())
        .unwrap()
        .to_string_lossy()
        .to_string();
    let legacy_path = crate::commands::workspace::resolve_workspace_root(&legacy.to_string_lossy())
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

#[test]
fn create_workspace_file_creates_missing_parents_and_writes_contents() {
    let root = temp_test_dir("create-file");
    let entry = create_workspace_file(
        root.to_string_lossy().to_string(),
        "Notes/welcome.md".to_string(),
        Some("# Hello".to_string()),
    )
    .expect("workspace file is created");

    assert_eq!(entry.name, "welcome.md");
    assert_eq!(entry.parent_path, "Notes");
    assert_eq!(entry.kind, "file");
    assert!(entry.is_markdown);
    assert_eq!(
        fs::read_to_string(root.join("Notes").join("welcome.md")).expect("file is readable"),
        "# Hello"
    );

    // A second create at the same path fails loudly so the UI can surface it.
    let conflict = create_workspace_file(
        root.to_string_lossy().to_string(),
        "Notes/welcome.md".to_string(),
        None,
    );
    assert!(conflict.is_err());
    assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");
    assert_eq!(
        fs::read_to_string(root.join("Notes").join("welcome.md"))
            .expect("existing file is unchanged"),
        "# Hello"
    );

    fs::remove_dir_all(root).expect("temp create-file directory is cleaned up");
}

#[test]
fn create_workspace_folder_creates_nested_directories() {
    let root = temp_test_dir("create-folder");
    let entry = create_workspace_folder(
        root.to_string_lossy().to_string(),
        "Archive/2024/January".to_string(),
    )
    .expect("workspace folder is created");

    assert_eq!(entry.kind, "directory");
    assert_eq!(entry.relative_path, "Archive/2024/January");
    assert!(root.join("Archive").join("2024").join("January").is_dir());

    let conflict = create_workspace_folder(
        root.to_string_lossy().to_string(),
        "Archive/2024/January".to_string(),
    );
    assert!(conflict.is_err());
    assert_eq!(conflict.unwrap_err().code, "workspace.file_exists");

    fs::remove_dir_all(root).expect("temp create-folder directory is cleaned up");
}

#[test]
fn rename_workspace_entry_moves_files_and_creates_destination_parents() {
    let root = temp_test_dir("rename-entry");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        Some("body".to_string()),
    )
    .expect("source file is created");

    let renamed = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        "Archive/draft.md".to_string(),
    )
    .expect("rename succeeds");

    assert_eq!(renamed.relative_path, "Archive/draft.md");
    assert!(!root.join("draft.md").exists());
    assert!(root.join("Archive").join("draft.md").is_file());

    // Renaming a missing entry fails loudly.
    let missing = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "ghost.md".to_string(),
        "Archive/ghost.md".to_string(),
    );
    assert!(missing.is_err());
    assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

    // Renaming onto an existing entry fails loudly.
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "other.md".to_string(),
        None,
    )
    .expect("destination file is created");
    let collision = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "Archive/draft.md".to_string(),
        "other.md".to_string(),
    );
    assert!(collision.is_err());
    assert_eq!(collision.unwrap_err().code, "workspace.file_exists");

    fs::remove_dir_all(root).expect("temp rename-entry directory is cleaned up");
}

#[test]
fn delete_workspace_entry_removes_files_and_folders_recursively() {
    let root = temp_test_dir("delete-entry");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/nested.md".to_string(),
        Some("body".to_string()),
    )
    .expect("nested file is created");

    delete_workspace_entry_for_test(root.to_string_lossy().to_string(), "Folder".to_string())
        .expect("folder is deleted recursively");

    assert!(!root.join("Folder").exists());

    let missing =
        delete_workspace_entry_for_test(root.to_string_lossy().to_string(), "Folder".to_string());
    assert!(missing.is_err());
    assert_eq!(missing.unwrap_err().code, "workspace.file_missing");

    fs::remove_dir_all(root).expect("temp delete-entry directory is cleaned up");
}

#[test]
fn workspace_entry_commands_reject_paths_that_escape_the_workspace_root() {
    let root = temp_test_dir("entry-escape");

    let create_file_escape = create_workspace_file(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
        None,
    );
    assert!(create_file_escape.is_err());
    assert_eq!(
        create_file_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    let create_folder_escape =
        create_workspace_folder(root.to_string_lossy().to_string(), "../outside".to_string());
    assert!(create_folder_escape.is_err());
    assert_eq!(
        create_folder_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    let rename_source_escape = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
        "renamed.md".to_string(),
    );
    assert!(rename_source_escape.is_err());
    assert_eq!(
        rename_source_escape.unwrap_err().code,
        "workspace.invalid_path"
    );

    fs::write(root.join("source.md"), "body").expect("rename source is created");
    let rename_destination_escape = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "source.md".to_string(),
        "../outside.md".to_string(),
    );
    assert!(rename_destination_escape.is_err());
    assert_eq!(
        rename_destination_escape.unwrap_err().code,
        "workspace.invalid_path"
    );
    assert!(root.join("source.md").exists());

    let delete_escape = delete_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "../outside.md".to_string(),
    );
    assert!(delete_escape.is_err());
    assert_eq!(delete_escape.unwrap_err().code, "workspace.invalid_path");

    fs::remove_dir_all(root).expect("temp entry-escape directory is cleaned up");
}

#[cfg(unix)]
#[test]
fn workspace_entry_commands_reject_symlink_escapes_via_canonicalization() {
    use std::os::unix::fs::symlink;

    let root = temp_test_dir("entry-symlink");
    let outside = temp_test_dir("entry-symlink-outside");
    symlink(&outside, root.join("escape")).expect("symlink is created");

    // Creating a file through the symlink would write outside the workspace.
    let attempt = create_workspace_file(
        root.to_string_lossy().to_string(),
        "escape/stolen.md".to_string(),
        None,
    );
    assert!(attempt.is_err());
    assert_eq!(attempt.unwrap_err().code, "workspace.invalid_path");
    assert!(!outside.join("stolen.md").exists());

    // Deleting through the symlink would delete outside the workspace.
    fs::write(outside.join("target.md"), "body").expect("outside file is created");
    let delete_attempt = delete_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "escape/target.md".to_string(),
    );
    assert!(delete_attempt.is_err());
    assert_eq!(delete_attempt.unwrap_err().code, "workspace.invalid_path");
    assert!(outside.join("target.md").exists());

    fs::remove_dir_all(root).expect("temp symlink root is cleaned up");
    fs::remove_dir_all(outside).expect("temp symlink outside directory is cleaned up");
}

#[test]
fn rename_workspace_entry_treats_source_equal_destination_as_a_noop() {
    let root = temp_test_dir("rename-noop");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        Some("body".to_string()),
    )
    .expect("source file is created");

    // Same relative path on both sides: succeed without touching the file.
    let result = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "draft.md".to_string(),
        "draft.md".to_string(),
    )
    .expect("no-op rename succeeds");
    assert_eq!(result.relative_path, "draft.md");
    assert_eq!(
        fs::read_to_string(root.join("draft.md")).expect("file is unchanged"),
        "body"
    );

    fs::remove_dir_all(root).expect("temp rename-noop directory is cleaned up");
}

#[cfg(unix)]
#[test]
fn markdown_commands_reject_symlink_escapes_from_the_workspace() {
    use std::os::unix::fs::symlink;

    let root = temp_test_dir("markdown-symlink");
    let outside = temp_test_dir("markdown-symlink-outside");
    let secret = outside.join("secret.md");
    fs::write(&secret, "outside the vault").expect("outside file is written");

    // A vault can legitimately contain symlinks — synced from another machine,
    // or shipped inside a shared/downloaded vault. Following one out of the
    // workspace would read and overwrite files the workspace never covered.
    symlink(&secret, root.join("innocent.md")).expect("symlink is created");

    let read_escape = read_markdown_file(
        root.to_string_lossy().to_string(),
        "innocent.md".to_string(),
    );
    assert!(
        read_escape.is_err(),
        "reading through a symlink must be refused"
    );
    assert_eq!(read_escape.unwrap_err().code, "workspace.invalid_path");

    assert_eq!(
        fs::read_to_string(&secret).expect("outside file still readable"),
        "outside the vault",
        "the outside file must not have been touched"
    );

    fs::remove_dir_all(root).expect("temp markdown symlink root is cleaned up");
    fs::remove_dir_all(outside).expect("temp markdown symlink outside dir is cleaned up");
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

#[test]
fn note_write_is_refused_when_the_file_changed_underneath_it() {
    let root = temp_test_dir("note-write-conflict");
    let note = root.join("draft.md");
    fs::write(&note, "what the tab was opened with").expect("note is written");

    // Something else — a sync client, another window — rewrote the file after
    // this tab read it.
    fs::write(&note, "what is there now").expect("outside write lands");

    let refused = write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "what the tab holds".to_string(),
        Some("what the tab was opened with"),
    )
    .expect_err("a save computed from a stale read is refused");
    assert_eq!(refused.code, "workspace.note_conflict");

    // The refusal has to be total: a partial write would lose the newer text
    // just as surely as the overwrite it replaced.
    assert_eq!(
        fs::read_to_string(&note).expect("note is still readable"),
        "what is there now"
    );

    fs::remove_dir_all(root).expect("temp note-conflict directory is cleaned up");
}

#[test]
fn note_write_goes_through_when_the_file_is_what_the_caller_last_read() {
    let root = temp_test_dir("note-write-match");
    let note = root.join("draft.md");
    fs::write(&note, "on disk").expect("note is written");

    write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "edited".to_string(),
        Some("on disk"),
    )
    .expect("a save against an untouched file goes through");
    assert_eq!(
        fs::read_to_string(&note).expect("note is readable"),
        "edited"
    );

    fs::remove_dir_all(root).expect("temp note-match directory is cleaned up");
}

#[cfg(unix)]
#[test]
fn note_write_is_refused_when_the_file_cannot_be_read_to_check() {
    use std::os::unix::fs::PermissionsExt;

    let root = temp_test_dir("note-write-unreadable");
    let note = root.join("draft.md");
    fs::write(&note, "on disk").expect("note is written");
    fs::set_permissions(&note, fs::Permissions::from_mode(0o000)).expect("note is made unreadable");

    // Whatever the precondition said, it cannot be shown to hold. Overwriting
    // on the strength of a check that did not happen is the one outcome that
    // loses data, so an unreadable file is treated as a mismatch rather than
    // reported as a read failure — the caller's move is the same either way.
    let refused = write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "mine".to_string(),
        Some("on disk"),
    )
    .expect_err("a write it cannot verify is refused");
    assert_eq!(refused.code, "workspace.note_conflict");

    fs::set_permissions(&note, fs::Permissions::from_mode(0o600)).expect("note is made readable");
    assert_eq!(
        fs::read_to_string(&note).expect("note is readable again"),
        "on disk"
    );

    fs::remove_dir_all(root).expect("temp note-unreadable directory is cleaned up");
}

#[test]
fn note_write_without_a_precondition_still_overwrites() {
    // `None` means "unchecked" here, the opposite of what it means for the
    // settings documents, where an absent file is itself a precondition. A note
    // always exists by the time this command runs, and callers that never read
    // it — extension writes, scripted edits — have no text to expect. Keeping
    // the check opt-in is what lets the shell send one on every save without
    // an extra read, and what leaves those callers working as before.
    let root = temp_test_dir("note-write-unchecked");
    let note = root.join("draft.md");
    fs::write(&note, "on disk").expect("note is written");

    write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "replaced".to_string(),
        None,
    )
    .expect("an unchecked save goes through");
    assert_eq!(
        fs::read_to_string(&note).expect("note is readable"),
        "replaced"
    );

    fs::remove_dir_all(root).expect("temp note-unchecked directory is cleaned up");
}

// ---------------------------------------------------------------------------
// File watcher
// ---------------------------------------------------------------------------

use crate::commands::watcher::*;
use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode};
use std::time::{Duration, Instant};

#[test]
fn only_markdown_inside_the_vault_is_worth_waking_the_index_for() {
    let root = Path::new("/vault");

    assert!(Audience::Notes.accepts(root, &root.join("notes/today.md")));
    assert!(Audience::Notes.accepts(root, &root.join("deep/nested/note.markdown")));

    // Not a note.
    assert!(!Audience::Notes.accepts(root, &root.join("image.png")));
    assert!(!Audience::Notes.accepts(root, &root.join("notes")));
    // The editor's own scratch files and version control.
    assert!(!Audience::Notes.accepts(root, &root.join(".obsidian/workspace.md")));
    assert!(!Audience::Notes.accepts(root, &root.join(".git/COMMIT_EDITMSG.md")));
    assert!(!Audience::Notes.accepts(root, &root.join("notes/.hidden.md")));
    // Build output the workspace listing already refuses to walk.
    assert!(!Audience::Notes.accepts(root, &root.join("node_modules/pkg/readme.md")));
    // Outside the vault entirely.
    assert!(!Audience::Notes.accepts(root, Path::new("/elsewhere/note.md")));
}

/// History is not an index of notes — it is a record of the vault. A user who
/// keeps a diagram, a spreadsheet or the script a note is about beside their
/// notes expects to get them back, so a restore that could only return Markdown
/// would not be a restore.
#[test]
fn history_takes_every_kind_of_file_the_index_ignores() {
    let root = temp_test_dir("watcher-audience-everything");
    let everything = Audience::Everything;

    for name in ["image.png", "budget.xlsx", "build.py", "notes/today.md"] {
        let path = root.join(name);
        fs::create_dir_all(path.parent().expect("a parent")).expect("the folder exists");
        fs::write(&path, "x").expect("the file is written");
        assert!(
            everything.accepts(&root, &path),
            "history refused to record {name}"
        );
    }

    // An extension-less *file* is a file — `Makefile`, `LICENSE`, `Dockerfile`.
    // Only the note caches have to guess from the name alone.
    let makefile = root.join("Makefile");
    fs::write(&makefile, "all:").expect("the file is written");
    assert!(everything.accepts(&root, &makefile));

    // A folder's name stands for everything inside it, so naming it as a file
    // would take the whole folder out of history.
    assert!(!everything.accepts(&root, &root.join("notes")));

    // The places neither consumer goes.
    for name in [
        ".obsidian/workspace.json",
        ".git/COMMIT_EDITMSG",
        "node_modules/pkg/index.js",
    ] {
        assert!(
            !everything.accepts(&root, &root.join(name)),
            "history walked into {name}"
        );
    }

    // OS junk and half-written files stay out of history the same way the first snapshot leaves them out.
    for name in ["Thumbs.db", "desktop.ini", "note.md.tmp", "~$note.md"] {
        assert!(
            !everything.accepts(&root, &root.join(name)),
            "history recorded junk file {name}"
        );
    }

    let _ = fs::remove_dir_all(&root);
}

/// A renamed folder moves notes the event cannot name. History has to re-read
/// the vault rather than follow the folder: recording the old name as gone
/// would take every note under it out of history and put none of them back.
#[test]
fn a_renamed_folder_makes_history_re_read_the_vault() {
    let root = temp_test_dir("watcher-folder-rename");
    let to = root.join("new");
    fs::create_dir_all(&to).expect("the folder exists");

    let changes = classify_all(
        &root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join("old"), to],
    );

    let _ = fs::remove_dir_all(&root);
    assert_eq!(changes.len(), 1, "a folder rename was followed by name");
    assert_eq!(changes[0].kind, WorkspaceChangeKind::Rescan);
}

/// The two consumers read the same events differently, and a batch has to serve
/// both: the index hears only about the note, while history hears about the
/// attachment beside it too.
#[test]
fn one_batch_tells_the_index_about_notes_and_history_about_everything() {
    use notify_debouncer_full::DebouncedEvent;

    let root = temp_test_dir("watcher-two-audiences");
    let at = Instant::now();
    let batch = vec![
        DebouncedEvent::new(
            notify::Event::new(EventKind::Create(CreateKind::File)).add_path(root.join("note.md")),
            at,
        ),
        DebouncedEvent::new(
            notify::Event::new(EventKind::Create(CreateKind::File))
                .add_path(root.join("chart.png")),
            at,
        ),
    ];

    let reported = collect_changes(&root, &batch);
    let _ = fs::remove_dir_all(&root);

    let notes: Vec<&str> = reported.notes.iter().map(|c| c.path.as_str()).collect();
    let all: Vec<&str> = reported.all.iter().map(|c| c.path.as_str()).collect();
    assert_eq!(notes, ["note.md"], "the index was told about a non-note");
    assert_eq!(
        all,
        ["note.md", "chart.png"],
        "history was not told about the attachment"
    );
}

/// History records attachments, but not the junk names the first snapshot already refuses.
#[test]
fn history_refuses_the_same_junk_the_first_snapshot_skips() {
    use notify_debouncer_full::DebouncedEvent;

    let root = temp_test_dir("watcher-never-record");
    let at = Instant::now();
    let batch = vec![
        DebouncedEvent::new(
            notify::Event::new(EventKind::Create(CreateKind::File))
                .add_path(root.join("chart.png")),
            at,
        ),
        DebouncedEvent::new(
            notify::Event::new(EventKind::Create(CreateKind::File))
                .add_path(root.join("Thumbs.db")),
            at,
        ),
        DebouncedEvent::new(
            notify::Event::new(EventKind::Modify(ModifyKind::Data(
                notify::event::DataChange::Content,
            )))
            .add_path(root.join("note.md.tmp")),
            at,
        ),
    ];

    let reported = collect_changes(&root, &batch);
    let _ = fs::remove_dir_all(&root);

    let all: Vec<&str> = reported.all.iter().map(|c| c.path.as_str()).collect();
    assert_eq!(
        all,
        ["chart.png"],
        "history recorded a NEVER_RECORD name: {all:?}"
    );
    assert!(reported.notes.is_empty(), "the index was told about junk");
}

#[test]
fn a_watched_path_is_reported_relative_to_the_vault_with_forward_slashes() {
    let root = Path::new("/vault");

    assert_eq!(
        workspace_relative_path(root, &root.join("notes").join("today.md")),
        Some("notes/today.md".to_string())
    );
    assert_eq!(
        workspace_relative_path(root, Path::new("/elsewhere/note.md")),
        None
    );
}

#[test]
fn a_new_file_on_disk_is_reported_as_created() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Create(CreateKind::File),
        &[root.join("fresh.md")],
    );

    assert_eq!(
        changes,
        vec![WorkspaceChange {
            kind: WorkspaceChangeKind::Created,
            path: "fresh.md".to_string(),
            old_path: None,
        }]
    );
}

#[test]
fn an_edit_from_another_editor_is_reported_as_modified() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Content)),
        &[root.join("edited.md")],
    );

    assert_eq!(changes[0].kind, WorkspaceChangeKind::Modified);
    assert_eq!(changes[0].path, "edited.md");
}

#[test]
fn a_rename_carries_both_paths_so_the_index_can_move_the_entry() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join("old.md"), root.join("new.md")],
    );

    assert_eq!(
        changes,
        vec![WorkspaceChange {
            kind: WorkspaceChangeKind::Renamed,
            path: "new.md".to_string(),
            old_path: Some("old.md".to_string()),
        }]
    );
}

#[test]
fn renaming_a_note_out_of_the_vault_reads_as_a_deletion() {
    let root = Path::new("/vault");

    // Moved outside the workspace entirely.
    let out = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join("note.md"), PathBuf::from("/elsewhere/note.md")],
    );
    assert_eq!(out[0].kind, WorkspaceChangeKind::Deleted);
    assert_eq!(out[0].path, "note.md");

    // Renamed to something that is no longer a note.
    let unmarked = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join("note.md"), root.join("note.txt")],
    );
    assert_eq!(unmarked[0].kind, WorkspaceChangeKind::Deleted);
}

#[test]
fn renaming_a_plain_file_into_a_note_reads_as_a_creation() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join("note.txt"), root.join("note.md")],
    );

    assert_eq!(changes[0].kind, WorkspaceChangeKind::Created);
    assert_eq!(changes[0].path, "note.md");
    assert_eq!(changes[0].old_path, None);
}

#[test]
fn a_removed_note_is_reported_as_deleted() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Remove(RemoveKind::File),
        &[root.join("gone.md")],
    );

    assert_eq!(changes[0].kind, WorkspaceChangeKind::Deleted);
    assert_eq!(changes[0].path, "gone.md");
}

/// A folder that disappears takes its notes with it, but the OS reports one
/// event for the folder and none for the files inside it. The index cannot be
/// told which entries to drop, so it is told to rebuild instead.
#[test]
fn a_vanished_folder_asks_for_a_rebuild_because_its_notes_are_unenumerable() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Remove(RemoveKind::Folder),
        &[root.join("archive")],
    );

    assert_eq!(changes[0].kind, WorkspaceChangeKind::Rescan);
}

/// A deleted folder cannot be stat'd, so an absent file extension is the only
/// hint that it was a folder — and a folder named `archive.2026` defeats it.
/// When the OS says outright that a folder went away, that beats the guess.
#[test]
fn a_vanished_folder_named_like_a_file_still_asks_for_a_rebuild() {
    let root = Path::new("/vault");
    let changes = classify_event(
        root,
        &EventKind::Remove(RemoveKind::Folder),
        &[root.join("archive.2026")],
    );

    assert_eq!(changes[0].kind, WorkspaceChangeKind::Rescan);
}

/// Git churns constantly inside `.git`, and none of it is a note.
///
/// `git add` writes `.git/index.lock` and renames it onto `.git/index`. Neither
/// is Markdown, and `index` has no extension — so the "probably a folder" guess
/// that rescues a deleted folder would fire here and rebuild the entire vault
/// on every staged file. Ignored areas have to be ruled out before that guess
/// is ever reached.
#[test]
fn churn_inside_ignored_folders_never_triggers_a_rebuild() {
    let root = Path::new("/vault");

    let staged = classify_event(
        root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        &[root.join(".git/index.lock"), root.join(".git/index")],
    );
    assert!(
        staged.is_empty(),
        "git staging rebuilt the index: {staged:?}"
    );

    let pruned = classify_event(
        root,
        &EventKind::Remove(RemoveKind::Folder),
        &[root.join(".git/objects/ab")],
    );
    assert!(pruned.is_empty(), "git gc rebuilt the index: {pruned:?}");

    let dropped = classify_event(
        root,
        &EventKind::Remove(RemoveKind::Folder),
        &[root.join("node_modules/pkg")],
    );
    assert!(
        dropped.is_empty(),
        "an ignored folder rebuilt the index: {dropped:?}"
    );

    let head = classify_event(
        root,
        &EventKind::Remove(RemoveKind::File),
        &[root.join(".git/ORIG_HEAD")],
    );
    assert!(
        head.is_empty(),
        "a git bookkeeping file rebuilt the index: {head:?}"
    );
}

#[test]
fn irrelevant_events_produce_nothing_at_all() {
    let root = Path::new("/vault");

    assert!(classify_event(
        root,
        &EventKind::Access(notify::event::AccessKind::Read),
        &[root.join("note.md")]
    )
    .is_empty());
    assert!(classify_event(
        root,
        &EventKind::Create(CreateKind::File),
        &[root.join("picture.png")]
    )
    .is_empty());
}

#[test]
fn the_app_recognises_the_echo_of_its_own_write_exactly_once() {
    let log = SelfWriteLog::new();
    let path = Path::new("/vault/note.md");
    let now = Instant::now();

    log.record_at(path, now);

    // The watcher event caused by our own write is ours to swallow...
    assert!(log.take_at(path, now + Duration::from_millis(100)));
    // ...but a second event on the same path is somebody else editing.
    assert!(!log.take_at(path, now + Duration::from_millis(200)));
}

#[test]
fn an_unrecorded_path_is_never_mistaken_for_our_own_write() {
    let log = SelfWriteLog::new();
    assert!(!log.take_at(Path::new("/vault/external.md"), Instant::now()));
}

/// Suppression is a single expected echo, not a blanket quiet period: if the
/// event never arrives (the OS coalesced it, the write changed nothing) the
/// record must not go on swallowing somebody else's later edit.
#[test]
fn an_echo_that_never_arrives_stops_suppressing_once_it_is_stale() {
    let log = SelfWriteLog::new();
    let path = Path::new("/vault/note.md");
    let now = Instant::now();

    log.record_at(path, now);

    assert!(!log.take_at(path, now + SELF_WRITE_TTL + Duration::from_millis(1)));
}

/// Two rapid saves reach the watcher as one debounced event, so that event has
/// to settle both. Leaving one record behind would let it swallow the next
/// edit — and the next edit is the external change this feature exists to
/// catch. The opposite mistake only costs a redundant reindex.
#[test]
fn one_event_settles_every_write_the_app_was_still_expecting() {
    let log = SelfWriteLog::new();
    let path = Path::new("/vault/note.md");
    let now = Instant::now();

    log.record_at(path, now);
    log.record_at(path, now + Duration::from_millis(10));

    assert!(log.take_at(path, now + Duration::from_millis(20)));
    // Nothing is left over to suppress somebody else's edit.
    assert!(!log.take_at(path, now + Duration::from_millis(30)));
}

/// Exercises the real OS notification path.
///
/// Every other watcher test hands `classify_event` an event it built itself,
/// which proves the mapping but not that the platform actually reports what the
/// mapping expects. This one writes a file and reads back whatever Linux,
/// macOS or Windows really said about it.
#[test]
fn a_note_written_by_another_program_reaches_the_app_as_a_change() {
    use notify::RecursiveMode;
    use notify_debouncer_full::new_debouncer;
    use std::sync::mpsc;

    let root = temp_test_dir("watcher-live");
    let (sender, receiver) = mpsc::channel();

    let mut debouncer = new_debouncer(Duration::from_millis(100), None, move |result| {
        // The receiver is dropped once the test is done; a failed send just
        // means nobody is listening any more.
        let _ = sender.send(result);
    })
    .expect("debouncer starts");
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .expect("watching a temp dir succeeds");

    // Something other than us writes a note into the vault.
    let note = root.join("from-elsewhere.md");
    fs::write(&note, "# Written by another program\n").expect("note is written");

    // Collect until the note shows up or we run out of patience. Filesystem
    // notifications are asynchronous and the debouncer holds events back on
    // purpose, so this waits rather than assuming the first batch has it.
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let mut seen: Vec<WorkspaceChange> = Vec::new();
    while std::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        match receiver.recv_timeout(remaining) {
            Ok(Ok(events)) => {
                for event in &events {
                    seen.extend(classify_event(&root, &event.kind, &event.paths));
                }
                if seen.iter().any(|change| change.path == "from-elsewhere.md") {
                    break;
                }
            }
            Ok(Err(_)) | Err(_) => break,
        }
    }

    drop(debouncer);
    let _ = fs::remove_dir_all(&root);

    let found = seen
        .iter()
        .find(|change| change.path == "from-elsewhere.md")
        .unwrap_or_else(|| panic!("the new note was never reported; saw {seen:?}"));

    // Which of the two the platform reports is its own business — both mean
    // "read this file again", and the frontend reindexes either way.
    assert!(
        matches!(
            found.kind,
            WorkspaceChangeKind::Created | WorkspaceChangeKind::Modified
        ),
        "unexpected kind {:?}",
        found.kind
    );
}

/// Proves self-write suppression works against real filesystem events.
///
/// The unit tests around `SelfWriteLog` prove the bookkeeping, but not that the
/// path an app write records is the same path the OS reports back. If those two
/// ever disagree — through canonicalization, a separator, a symlinked parent —
/// suppression silently stops working and every other test still passes. So
/// this writes a note both ways and checks that only the unrecorded write is
/// reported.
#[test]
fn the_app_hears_an_outside_write_but_not_the_echo_of_its_own() {
    use notify::RecursiveMode;
    use notify_debouncer_full::new_debouncer;
    use std::sync::mpsc;

    let root = temp_test_dir("watcher-echo");
    let (sender, receiver) = mpsc::channel();

    let mut debouncer = new_debouncer(Duration::from_millis(100), None, move |result| {
        let _ = sender.send(result);
    })
    .expect("debouncer starts");
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .expect("watching a temp dir succeeds");

    /// Drains events for up to two seconds, returning what the app would report.
    fn drain(
        receiver: &mpsc::Receiver<notify_debouncer_full::DebounceEventResult>,
        root: &Path,
    ) -> (usize, Vec<WorkspaceChange>) {
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let mut raw = 0usize;
        let mut reported = Vec::new();
        while let Ok(result) =
            receiver.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
        {
            if let Ok(events) = result {
                raw += events.len();
                reported.extend(collect_changes(root, &events).notes);
            }
        }
        (raw, reported)
    }

    // The app writes a note, announcing the echo it is about to cause.
    let ours = root.join("ours.md");
    record_self_write(&ours);
    fs::write(&ours, "# Written by the app\n").expect("note is written");

    let (raw_ours, reported_ours) = drain(&receiver, &root);

    // Another program writes a different note, announcing nothing.
    let theirs = root.join("theirs.md");
    fs::write(&theirs, "# Written by another program\n").expect("note is written");

    let (_, reported_theirs) = drain(&receiver, &root);

    drop(debouncer);
    let _ = fs::remove_dir_all(&root);

    // The OS really did notice our write; the app simply declined to report it.
    // Without this the assertion below would pass on an empty event stream.
    assert!(
        raw_ours > 0,
        "the platform reported nothing at all, so suppression was never exercised"
    );
    assert_eq!(
        reported_ours,
        Vec::new(),
        "the app reported the echo of its own write"
    );
    assert!(
        reported_theirs
            .iter()
            .any(|change| change.path == "theirs.md"),
        "an outside write went unreported; saw {reported_theirs:?}"
    );
}

/// React mounts an effect, tears it down, and mounts it again under
/// StrictMode, and the teardown of the first mount lands *after* the second
/// mount has already asked to watch. Tracking interest as a set of window
/// labels made that second request a no-op and let the late release stop the
/// watcher, leaving the app listening to a watcher that no longer existed —
/// silently, on every development run.
#[test]
fn a_remount_that_overlaps_its_own_teardown_keeps_the_watcher_alive() {
    let mut interest = WatchInterest::default();

    // Mount one asks to watch; nobody was watching, so a watcher starts.
    assert!(!interest.is_watched("/vault"));
    interest.acquire("/vault", "main");

    // Mount two asks before mount one's teardown arrives.
    assert!(interest.is_watched("/vault"));
    interest.acquire("/vault", "main");

    // Mount one's teardown finally lands. Mount two still wants it.
    assert!(!interest.release("/vault", "main"));
    // Only when mount two goes does the watcher stop.
    assert!(interest.release("/vault", "main"));
}

#[test]
fn two_windows_on_one_vault_share_a_single_watcher() {
    let mut interest = WatchInterest::default();

    interest.acquire("/vault", "main");
    interest.acquire("/vault", "second");

    assert!(
        !interest.release("/vault", "main"),
        "the second window still wants it"
    );
    assert!(
        interest.release("/vault", "second"),
        "the last window released it"
    );
}

#[test]
fn releasing_something_never_acquired_stops_nothing() {
    let mut interest = WatchInterest::default();

    assert!(!interest.release("/vault", "main"));
    interest.acquire("/vault", "main");
    assert!(!interest.release("/other", "main"));
    assert!(interest.release("/vault", "main"));
}

/// A window destroyed by the OS never runs its React cleanup, so its watchers
/// would otherwise be held for the life of the process.
#[test]
fn closing_a_window_releases_every_watcher_it_was_holding() {
    let mut interest = WatchInterest::default();

    interest.acquire("/vault", "main");
    interest.acquire("/vault", "second");
    interest.acquire("/notes", "second");
    // Whatever double-mounting that window did along the way.
    interest.acquire("/notes", "second");

    let mut stopped = interest.release_window("second");
    stopped.sort();

    // "/vault" is still held by the main window; "/notes" was only ever theirs.
    assert_eq!(stopped, vec!["/notes".to_string()]);
    assert!(interest.is_watched("/vault"));
    assert!(!interest.is_watched("/notes"));
}

/// One path can produce several events of different kinds in a single batch —
/// a delete followed by a recreate, or on macOS a write that sets both the
/// content and metadata flags and so arrives as two `Modify` events. The first
/// of them claimed the app's expected echo and the rest were reported as
/// outside changes, which on macOS meant every in-app save came straight back
/// as somebody else's edit.
#[test]
fn a_batch_that_repeats_a_path_claims_the_echo_once_for_the_whole_batch() {
    use notify::event::{DataChange, MetadataKind};
    use notify_debouncer_full::DebouncedEvent;

    let root = temp_test_dir("watcher-multi-kind");
    let note = root.join("saved.md");
    let at = Instant::now();

    let batch = vec![
        DebouncedEvent::new(
            notify::Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
                .add_path(note.clone()),
            at,
        ),
        DebouncedEvent::new(
            notify::Event::new(EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)))
                .add_path(note.clone()),
            at,
        ),
    ];

    // The app wrote this note once and expects its echo.
    record_self_write(&note);
    let reported = collect_changes(&root, &batch);

    let _ = fs::remove_dir_all(&root);
    assert_eq!(
        reported.notes,
        Vec::new(),
        "the app reported its own save as an outside edit"
    );
    // History is the opposite case. The note the user just typed was written by
    // this app, so suppressing the app's own writes here would leave Auto Sync
    // recording only what *other* programs did to the vault — which is to say,
    // not the user's own work.
    assert!(
        !reported.all.is_empty(),
        "the app's own save was left out of history"
    );
}

/// FSEvents cannot pair the two halves of a rename, so macOS reports one
/// `Name(Any)` event carrying a single path — which may be either end. Treating
/// every unpaired rename as a removal told the app that a note dragged *into*
/// the vault had been deleted, dropping a file that is sitting right there.
#[test]
fn an_unpairable_rename_is_judged_by_what_is_actually_on_disk() {
    let root = temp_test_dir("watcher-rename-any");
    let arrived = root.join("arrived.md");
    fs::write(&arrived, "# dragged in\n").expect("note is written");
    let departed = root.join("departed.md");

    let landed = classify_event(
        &root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
        std::slice::from_ref(&arrived),
    );
    let left = classify_event(
        &root,
        &EventKind::Modify(ModifyKind::Name(RenameMode::Any)),
        &[departed],
    );

    let _ = fs::remove_dir_all(&root);
    assert_eq!(
        landed.first().map(|change| change.kind),
        Some(WorkspaceChangeKind::Created)
    );
    assert_eq!(
        left.first().map(|change| change.kind),
        Some(WorkspaceChangeKind::Deleted)
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
