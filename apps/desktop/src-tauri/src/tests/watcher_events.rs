//! File-watcher event classification tests: which paths the two audiences
//! (notes index vs. history) accept, how `classify_event` maps OS event kinds
//! to `WorkspaceChangeKind`, batch handling, folder-rename rescans, ignored
//! folders, and unpaired (macOS FSEvents) rename resolution.

use crate::commands::watcher::*;
use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use super::temp_test_dir;

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
