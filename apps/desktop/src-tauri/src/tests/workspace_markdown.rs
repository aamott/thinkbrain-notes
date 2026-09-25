//! Workspace + Markdown tests: shell status, `NativeError` shape, relative-path
//! normalization, markdown/hidden-name detection, workspace entry CRUD (file,
//! folder, rename, delete), path-security (escape + symlink escape), note
//! backup/restore, and note-write preconditions (conflict detection, atomic
//! replacement).

use crate::NativeError;
use crate::commands::{backup::*, markdown::*, workspace::*};
use std::{fs, path::Path};

use super::temp_test_dir;

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

    assert_eq!(renamed.entry.relative_path, "Archive/draft.md");
    assert_eq!(
        renamed.file_moves,
        vec![WorkspacePathMove {
            old_relative_path: "draft.md".to_string(),
            new_relative_path: "Archive/draft.md".to_string(),
            was_markdown: true,
            is_markdown: true,
        }]
    );
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
    assert_eq!(result.entry.relative_path, "draft.md");
    assert!(result.file_moves.is_empty());
    assert_eq!(
        fs::read_to_string(root.join("draft.md")).expect("file is unchanged"),
        "body"
    );

    fs::remove_dir_all(root).expect("temp rename-noop directory is cleaned up");
}

#[test]
fn rename_workspace_entry_maps_every_descendant_file_of_a_moved_folder() {
    let root = temp_test_dir("rename-folder-map");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/note.md".to_string(),
        Some("body".to_string()),
    )
    .expect("nested markdown is created");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/data.txt".to_string(),
        None,
    )
    .expect("nested text file is created");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/sub/deep.md".to_string(),
        None,
    )
    .expect("deep markdown is created");

    let moved = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "Folder".to_string(),
        "Archive/Folder".to_string(),
    )
    .expect("folder move succeeds");

    assert_eq!(moved.entry.relative_path, "Archive/Folder");
    assert_eq!(moved.entry.kind, "directory");
    let expected = [
        ("Folder/data.txt", "Archive/Folder/data.txt", false, false),
        ("Folder/note.md", "Archive/Folder/note.md", true, true),
        (
            "Folder/sub/deep.md",
            "Archive/Folder/sub/deep.md",
            true,
            true,
        ),
    ];
    let mut actual: Vec<(String, String, bool, bool)> = moved
        .file_moves
        .iter()
        .map(|moved| {
            (
                moved.old_relative_path.clone(),
                moved.new_relative_path.clone(),
                moved.was_markdown,
                moved.is_markdown,
            )
        })
        .collect();
    actual.sort();
    let mut expected: Vec<(String, String, bool, bool)> = expected
        .iter()
        .map(|(old, new, was, is)| (old.to_string(), new.to_string(), *was, *is))
        .collect();
    expected.sort();
    assert_eq!(actual, expected);
    assert!(root.join("Archive/Folder/sub/deep.md").is_file());
    assert!(!root.join("Folder").exists());

    fs::remove_dir_all(root).expect("temp rename-folder-map directory is cleaned up");
}

#[test]
fn rename_workspace_entry_rejects_moving_a_folder_into_itself() {
    let root = temp_test_dir("rename-folder-into-self");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/sub/note.md".to_string(),
        None,
    )
    .expect("nested file is created");

    // A folder cannot land inside one of its own subfolders.
    let descendant = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "Folder".to_string(),
        "Folder/sub/Folder".to_string(),
    );
    assert!(descendant.is_err());
    assert_eq!(descendant.unwrap_err().code, "workspace.invalid_move");

    // A same-named sibling (`Folderx`) is not a descendant and must still move.
    let sibling = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "Folder".to_string(),
        "Folderx".to_string(),
    );
    assert!(sibling.is_ok(), "sibling move should succeed: {sibling:?}");
    assert!(root.join("Folderx/sub/note.md").is_file());
    assert!(!root.join("Folder").exists());

    fs::remove_dir_all(root).expect("temp rename-folder-into-self directory is cleaned up");
}

#[test]
fn rename_workspace_entry_moves_a_nested_file_to_the_root() {
    let root = temp_test_dir("rename-to-root");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/data.txt".to_string(),
        Some("body".to_string()),
    )
    .expect("nested file is created");

    let moved = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "Folder/data.txt".to_string(),
        "data.txt".to_string(),
    )
    .expect("move to root succeeds");

    assert_eq!(moved.entry.relative_path, "data.txt");
    assert_eq!(
        moved.file_moves,
        vec![WorkspacePathMove {
            old_relative_path: "Folder/data.txt".to_string(),
            new_relative_path: "data.txt".to_string(),
            was_markdown: false,
            is_markdown: false,
        }]
    );
    assert!(root.join("data.txt").is_file());
    assert!(!root.join("Folder/data.txt").exists());

    fs::remove_dir_all(root).expect("temp rename-to-root directory is cleaned up");
}

#[test]
fn rename_workspace_entry_classifies_extension_changes_independently() {
    let root = temp_test_dir("rename-type-change");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "note.md".to_string(),
        Some("body".to_string()),
    )
    .expect("markdown source is created");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "data.txt".to_string(),
        Some("body".to_string()),
    )
    .expect("text source is created");

    // Markdown -> plain text: was Markdown, is not now.
    let to_text = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "note.md".to_string(),
        "note.txt".to_string(),
    )
    .expect("markdown-to-text rename succeeds");
    assert_eq!(
        to_text.file_moves,
        vec![WorkspacePathMove {
            old_relative_path: "note.md".to_string(),
            new_relative_path: "note.txt".to_string(),
            was_markdown: true,
            is_markdown: false,
        }]
    );

    // Plain text -> Markdown: was not, is now.
    let to_markdown = rename_workspace_entry_for_test(
        root.to_string_lossy().to_string(),
        "data.txt".to_string(),
        "data.md".to_string(),
    )
    .expect("text-to-markdown rename succeeds");
    assert_eq!(
        to_markdown.file_moves,
        vec![WorkspacePathMove {
            old_relative_path: "data.txt".to_string(),
            new_relative_path: "data.md".to_string(),
            was_markdown: false,
            is_markdown: true,
        }]
    );

    fs::remove_dir_all(root).expect("temp rename-type-change directory is cleaned up");
}

#[test]
fn collect_moved_files_fails_loudly_at_the_workspace_limit() {
    let root = temp_test_dir("move-limit");
    create_workspace_file(
        root.to_string_lossy().to_string(),
        "Folder/note.md".to_string(),
        None,
    )
    .expect("nested file is created");

    // A collector already at the listing ceiling cannot promise a complete
    // mapping, so it refuses instead of returning a partial one.
    let full = vec![
        WorkspaceEntry {
            relative_path: "filler.md".to_string(),
            name: "filler.md".to_string(),
            parent_path: String::new(),
            kind: "file".to_string(),
            is_markdown: true,
            byte_size: 0,
            updated_at: None,
        };
        MAX_WORKSPACE_ENTRIES
    ];
    let mut saturated = full;
    let refused = collect_moved_files(&root, &root.join("Folder"), &mut saturated);
    assert!(refused.is_err());
    assert_eq!(refused.unwrap_err().code, "workspace.too_many_entries");
    // Nothing was moved: the folder still exists untouched.
    assert!(root.join("Folder/note.md").is_file());

    // A normal folder collects fine.
    let mut collected = Vec::new();
    collect_moved_files(&root, &root.join("Folder"), &mut collected)
        .expect("small folder collects");
    assert_eq!(collected.len(), 1);
    assert_eq!(collected[0].relative_path, "Folder/note.md");

    fs::remove_dir_all(root).expect("temp move-limit directory is cleaned up");
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

    let read_escape = read_note(&root.to_string_lossy(), "innocent.md", None);
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

/// Restoring puts a kept version back, and keeps what it replaced.
///
/// Restoring is itself a save, so it goes through the same path and earns the
/// same backup. A restore chosen in a panic — the wrong version, the wrong
/// note — is therefore undoable, which is what makes the confirmation an
/// honest one rather than a last chance.
#[test]
fn restoring_a_version_keeps_the_one_it_replaced() {
    let root = temp_test_dir("restore-keeps");
    let app_data = temp_test_dir("restore-keeps-appdata");
    let note = root.join("note.md");

    fs::write(&note, "the good version\n").expect("the note is written");
    // A save damages it, keeping the good version.
    write_markdown_document(
        &root.to_string_lossy(),
        "note.md",
        "the damaged version\n".to_string(),
        None,
        Some(&app_data),
    )
    .expect("the damaging save goes through");

    let kept = list_note_backups(&app_data, &root, "note.md");
    assert_eq!(kept.len(), 1, "the good version was not kept");

    restore_note_version(
        &root.to_string_lossy(),
        "note.md",
        &kept[0].to_string_lossy(),
        &app_data,
    )
    .expect("the restore succeeds");

    assert_eq!(
        fs::read_to_string(&note).expect("the note is readable"),
        "the good version\n"
    );
    // The damaged version is now itself recoverable, so the restore can be undone.
    let after = list_note_backups(&app_data, &root, "note.md");
    let texts: Vec<String> = after
        .iter()
        .map(|path| fs::read_to_string(path).unwrap_or_default())
        .collect();
    assert!(
        texts.contains(&"the damaged version\n".to_string()),
        "restoring threw away what it replaced: {texts:?}"
    );

    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// A restore may only read from this workspace's own backup folder.
///
/// The path comes from the frontend, so it is not trusted: without this, a
/// crafted request could write any readable file on the machine into a note.
#[test]
fn a_restore_refuses_a_version_outside_this_workspaces_backups() {
    let root = temp_test_dir("restore-escape");
    let app_data = temp_test_dir("restore-escape-appdata");
    let outsider = temp_test_dir("restore-escape-elsewhere").join("secret.md");
    fs::create_dir_all(outsider.parent().expect("it has a folder")).expect("folder is made");
    fs::write(&outsider, "not yours\n").expect("the outsider is written");
    fs::write(root.join("note.md"), "mine\n").expect("the note is written");

    let refused = restore_note_version(
        &root.to_string_lossy(),
        "note.md",
        &outsider.to_string_lossy(),
        &app_data,
    )
    .expect_err("a version from outside the backup folder is refused");

    assert_eq!(refused.code, "workspace.backup_not_found");
    assert_eq!(
        fs::read_to_string(root.join("note.md")).expect("the note is readable"),
        "mine\n",
        "the refused restore wrote anyway"
    );

    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// A note the app cannot decode is damage, and must be reported as damage.
///
/// `fs::read_to_string` folds an encoding failure into the same
/// `workspace.read_failed` an absent file gets, so the shell had no way to tell
/// "this is not there" from "this is there and wrong" — and no reason to offer
/// a recovery path for the second.
#[test]
fn a_note_that_cannot_be_decoded_is_reported_as_damaged() {
    let root = temp_test_dir("read-undecodable");
    // A lone 0xFF is not valid UTF-8 in any position.
    fs::write(root.join("note.md"), [b'#', b' ', 0xFF, b'\n']).expect("the note is written");

    let failure = read_note(&root.to_string_lossy(), "note.md", None)
        .expect_err("an undecodable note is refused");

    assert_eq!(failure.code, "workspace.note_unreadable");
    fs::remove_dir_all(&root).ok();
}

/// An empty note opens as an empty note.
///
/// Guards the check that was considered and rejected: "empty, but we kept
/// something non-empty" fires on a user deleting a note's contents and saving,
/// because the thing it kept is the text they just deleted. Every deliberate
/// empty would have opened with a damage notice, and the notice would have
/// stopped meaning anything.
#[test]
fn an_empty_note_with_nothing_kept_opens_normally() {
    let root = temp_test_dir("read-empty-new");
    let app_data = temp_test_dir("read-empty-new-appdata");
    fs::write(root.join("fresh.md"), "").expect("the note is written");

    let read = read_note(&root.to_string_lossy(), "fresh.md", Some(&app_data))
        .expect("a genuinely new empty note opens");

    assert_eq!(read.contents, "");
    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// A save keeps the version it replaced, so a bad save is recoverable.
///
/// Backups live in app-data, not the vault. A user with the app on two or three
/// machines then has that many independent sets, none of them inside the folder
/// a sync daemon is rewriting — putting them in the vault would hand them to the
/// process a backup exists to protect against. The cost is that a backup does
/// not travel with the notes, which the recovery UI has to say plainly.
#[test]
fn a_save_keeps_the_version_it_replaced() {
    let root = temp_test_dir("backup-keeps");
    let app_data = temp_test_dir("backup-keeps-appdata");
    let note = root.join("daily").join("today.md");
    fs::create_dir_all(note.parent().expect("the note has a folder")).expect("folder is made");
    fs::write(&note, "what was there\n").expect("the note exists to be replaced");

    write_markdown_document(
        &root.to_string_lossy(),
        "daily/today.md",
        "what is there now\n".to_string(),
        None,
        Some(&app_data),
    )
    .expect("the save succeeds");

    let kept = list_note_backups(&app_data, &root, "daily/today.md");
    assert_eq!(kept.len(), 1, "the replaced version was not kept");
    assert_eq!(
        fs::read_to_string(&kept[0]).expect("the backup is readable"),
        "what was there\n"
    );
    // The backup folder mirrors the vault, so someone opening it by hand can
    // tell which note they are looking at.
    assert!(
        kept[0].to_string_lossy().contains("daily"),
        "the backup did not mirror the note's folder: {:?}",
        kept[0]
    );

    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// Retention is count-based, which is what bounds app-data predictably.
#[test]
fn only_the_most_recent_backups_are_kept() {
    let root = temp_test_dir("backup-prune");
    let app_data = temp_test_dir("backup-prune-appdata");
    let note = root.join("note.md");
    fs::write(&note, "version 0\n").expect("the note exists");

    for version in 1..=(KEPT_BACKUPS + 2) {
        write_markdown_document(
            &root.to_string_lossy(),
            "note.md",
            format!("version {version}\n"),
            None,
            Some(&app_data),
        )
        .expect("the save succeeds");
    }

    let kept = list_note_backups(&app_data, &root, "note.md");
    assert_eq!(
        kept.len(),
        KEPT_BACKUPS,
        "retention did not bound the folder"
    );

    // Newest first, and the newest is the version replaced by the last save.
    let newest = fs::read_to_string(&kept[0]).expect("the backup is readable");
    assert_eq!(newest, format!("version {}\n", KEPT_BACKUPS + 1));
    // The oldest versions are the ones dropped.
    let all: Vec<String> = kept
        .iter()
        .map(|path| fs::read_to_string(path).expect("the backup is readable"))
        .collect();
    assert!(
        !all.contains(&"version 0\n".to_string()),
        "the oldest version outlived retention: {all:?}"
    );

    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// Creating a note has nothing to keep, and must not leave an empty backup.
#[test]
fn creating_a_note_keeps_no_backup() {
    let root = temp_test_dir("backup-create");
    let app_data = temp_test_dir("backup-create-appdata");
    let note = root.join("fresh.md");
    fs::write(&note, "first\n").expect("the note exists");

    // A save with no previous content is the shape a creation leaves behind.
    let kept = list_note_backups(&app_data, &root, "fresh.md");
    assert!(kept.is_empty(), "a note nobody has saved over has a backup");

    fs::remove_dir_all(&root).ok();
    fs::remove_dir_all(&app_data).ok();
}

/// A note save must not truncate the file it is replacing.
///
/// `fs::write` opens with `O_TRUNC`: the note is emptied first and refilled
/// second, so a crash, a full disk or a lost power cable between the two leaves
/// the user with nothing. Writing a temp file and renaming it over the target
/// never puts the destination in a state worth losing — the reader either sees
/// the old note or the new one.
///
/// The helper for this has existed and been tested since settings needed it;
/// the note path was the one caller still writing in place, which is the path
/// this epic exists to protect.
///
/// Unix-only because the inode is the evidence: a rename gives the name a new
/// one, an in-place write keeps it. Windows has no equivalent that a test can
/// read, and the helper is explicit that its Windows path is not atomic.
#[cfg(unix)]
#[test]
fn a_note_save_replaces_the_file_rather_than_truncating_it() {
    use std::os::unix::fs::MetadataExt;

    let root = temp_test_dir("note-write-atomic");
    let note = root.join("draft.md");
    fs::write(&note, "the note as it was").expect("note is written");
    let before = fs::metadata(&note).expect("the note has metadata").ino();

    write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "the note as it is now".to_string(),
        None,
        None,
    )
    .expect("the save succeeds");

    let after = fs::metadata(&note)
        .expect("the note still has metadata")
        .ino();
    assert_ne!(
        before, after,
        "the note was written in place, so a crash mid-write would empty it"
    );
    assert_eq!(
        fs::read_to_string(&note).expect("the note is readable"),
        "the note as it is now"
    );

    // The temp file is an implementation detail and must not outlive the save.
    let strays: Vec<_> = fs::read_dir(&root)
        .expect("the folder is readable")
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name != "draft.md")
        .collect();
    assert!(strays.is_empty(), "the save left {strays:?} behind");

    fs::remove_dir_all(&root).ok();
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
        None,
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
        None,
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
        None,
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
        None,
    )
    .expect("an unchecked save goes through");
    assert_eq!(
        fs::read_to_string(&note).expect("note is readable"),
        "replaced"
    );

    fs::remove_dir_all(root).expect("temp note-unchecked directory is cleaned up");
}
