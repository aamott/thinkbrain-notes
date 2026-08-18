use super::super::bootstrap::bootstrap;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::Path;

struct Fixture {
    vault: PathBuf,
    engine: Engine,
}

fn fixture(name: &str) -> Fixture {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    Fixture {
        vault,
        engine: Engine::new(workspace.repo, workspace.has_own_git),
    }
}

fn write(root: &Path, relative: &str, contents: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the folder exists");
    }
    fs::write(path, contents).expect("the file is written");
}

fn message_of(engine: &Engine, commit: gix::ObjectId) -> String {
    engine
        .repo
        .to_thread_local()
        .find_commit(commit)
        .expect("the commit exists")
        .message_raw_sloppy()
        .to_string()
}

/// A note is not recorded the instant it changes, because the user is
/// probably still typing into it.
#[test]
fn an_edit_is_recorded_only_once_it_settles() {
    let f = fixture("engine-settles");
    let start = Instant::now();
    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], start);

    assert_eq!(
        f.engine.record_settled(start + SETTLE / 2).expect("recording succeeds"),
        None
    );
    assert!(f
        .engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds")
        .is_some());
}

#[test]
fn the_message_counts_the_notes_in_the_commit() {
    let f = fixture("engine-message");
    let start = Instant::now();
    write(&f.vault, "one.md", "# One\n");
    write(&f.vault, "two.md", "# Two\n");
    f.engine
        .note_changes([PathBuf::from("one.md"), PathBuf::from("two.md")], start);

    let commit = f
        .engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds")
        .expect("a commit is made");

    assert!(
        message_of(&f.engine, commit).ends_with("— 2 notes changed"),
        "the message did not count the notes: {}",
        message_of(&f.engine, commit)
    );
}

#[test]
fn an_idle_workspace_records_nothing() {
    let f = fixture("engine-idle");

    assert_eq!(
        f.engine.record_settled(Instant::now()).expect("recording succeeds"),
        None
    );
}

/// A save that rewrites a file with the same bytes is a real event the
/// watcher reports, and it must not become a commit the user scrolls past.
#[test]
fn a_change_that_changed_nothing_records_nothing() {
    let f = fixture("engine-nochange");
    let start = Instant::now();
    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], start);
    f.engine.record_settled(start + SETTLE).expect("recording succeeds");

    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], start + SETTLE);

    assert_eq!(
        f.engine
            .record_settled(start + SETTLE + SETTLE)
            .expect("recording succeeds"),
        None
    );
}

/// The note the user edited is recorded; the copy the daemon dropped beside
/// it is not.
#[test]
fn a_conflict_copy_is_not_recorded_in_history() {
    let f = fixture("engine-conflict");
    let start = Instant::now();
    write(&f.vault, "note.md", "# Mine\n");
    write(&f.vault, "note.sync-conflict-20260816-093100-K3SDFHG.md", "# Theirs\n");
    f.engine.note_changes(
        [
            PathBuf::from("note.md"),
            PathBuf::from("note.sync-conflict-20260816-093100-K3SDFHG.md"),
        ],
        start,
    );

    let commit = f
        .engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds")
        .expect("a commit is made");

    assert!(
        message_of(&f.engine, commit).ends_with("— 1 note changed"),
        "the conflict copy was counted: {}",
        message_of(&f.engine, commit)
    );
}

/// Nothing but a conflict copy settled, so there is nothing to record —
/// and certainly not an empty commit.
#[test]
fn a_batch_of_only_conflict_copies_records_nothing() {
    let f = fixture("engine-conflict-only");
    let start = Instant::now();
    write(&f.vault, "note.md", "# Mine\n");
    write(&f.vault, "note.sync-conflict-20260816-093100-K3SDFHG.md", "# Theirs\n");

    f.engine.note_changes(
        [PathBuf::from("note.sync-conflict-20260816-093100-K3SDFHG.md")],
        start,
    );

    assert_eq!(
        f.engine.record_settled(start + SETTLE).expect("recording succeeds"),
        None
    );
}

/// The same copy is found twice — once by the scan when the workspace
/// opens, once by the watcher if the daemon writes it while the app runs.
/// The user has one conflict, so they hear about it once.
#[test]
fn a_conflict_found_twice_is_only_one_conflict() {
    let f = fixture("engine-conflict-dedup");
    let copy = ConflictCopy {
        copy: "note.sync-conflict-20260816-093100-K3SDFHG.md".to_string(),
        original: "note.md".to_string(),
        provider: "Syncthing",
    };

    f.engine.note_conflicts([copy.clone()]);
    f.engine.note_conflicts([copy.clone()]);

    assert_eq!(f.engine.conflicts(), [copy]);
}

/// Seeing the same copy again is not news, and telling every window it is
/// would pop a notification for a conflict the user has already been shown.
#[test]
fn only_the_first_sighting_of_a_conflict_is_worth_announcing() {
    let f = fixture("engine-conflict-news");
    let copy = ConflictCopy {
        copy: "note.sync-conflict-20260816-093100-K3SDFHG.md".to_string(),
        original: "note.md".to_string(),
        provider: "Syncthing",
    };

    assert!(f.engine.note_conflicts([copy.clone()]), "the first sighting was silent");
    assert!(!f.engine.note_conflicts([copy]), "the same copy was announced twice");
}

#[test]
fn a_deleted_note_is_recorded_when_it_settles() {
    let f = fixture("engine-delete");
    let start = Instant::now();
    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], start);
    f.engine.record_settled(start + SETTLE).expect("recording succeeds");

    fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
    f.engine.note_changes([PathBuf::from("one.md")], start + SETTLE);

    assert!(f
        .engine
        .record_settled(start + SETTLE + SETTLE)
        .expect("recording succeeds")
        .is_some());
}

/// Every commit the engine reports must be reachable from the branch it
/// claims to have written.
///
/// Recording reads HEAD, builds a tree on it, and moves the ref. Two of
/// those interleaved both build on the *same* HEAD and both move the ref,
/// so the loser's commit is orphaned — the engine returns an id for work
/// that is no longer in history, and the notes in it are silently gone.
#[test]
fn concurrent_recording_leaves_one_unbroken_history() {
    let f = std::sync::Arc::new(fixture("engine-record-race"));
    let start = Instant::now();
    for index in 0..8 {
        write(&f.vault, &format!("note-{index}.md"), "# A note\n");
    }

    let committed: Vec<gix::ObjectId> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..8)
            .map(|index| {
                let f = std::sync::Arc::clone(&f);
                scope.spawn(move || {
                    f.engine
                        .note_changes([PathBuf::from(format!("note-{index}.md"))], start);
                    // The sweeper calls `record_settled`; a closing window
                    // calls `flush`. Both must leave history linear.
                    if index % 2 == 0 {
                        f.engine.record_settled(start + SETTLE)
                    } else {
                        f.engine.flush()
                    }
                    .expect("recording succeeds")
                })
            })
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().expect("the thread finishes"))
            .collect()
    });

    let repo = f.engine.repo.to_thread_local();
    let head = snapshot::head_commit(&repo)
        .expect("reading the branch succeeds")
        .expect("something was committed");
    let ancestry: Vec<gix::ObjectId> = repo
        .find_commit(head)
        .expect("the commit exists")
        .ancestors()
        .all()
        .expect("the history walks")
        .map(|info| info.expect("the walk succeeds").id)
        .collect();

    for commit in &committed {
        assert!(
            ancestry.contains(commit),
            "a commit the engine reported is not in history — it forked: \
             {commit} is not among {ancestry:?}"
        );
    }
}

/// Closing a window must not throw away what the user just typed. The
/// settle window exists to batch a burst of edits, not to cancel them.
#[test]
fn flushing_records_edits_that_have_not_settled_yet() {
    let f = fixture("engine-flush");
    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], Instant::now());

    assert_eq!(
        f.engine.record_settled(Instant::now()).expect("recording succeeds"),
        None,
        "the edit should not have settled yet"
    );
    assert!(
        f.engine.flush().expect("flushing succeeds").is_some(),
        "the unsettled edit was dropped instead of recorded"
    );
}

/// Taking a path out of the pending set is a promise to record it. If the
/// commit fails the promise is unkept, so the path has to come back — a
/// note dropped here is a note history never hears about again.
#[test]
fn a_batch_that_could_not_be_recorded_is_tried_again() {
    let f = fixture("engine-retry");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("../outside.md")], start);

    f.engine
        .record_settled(start + SETTLE)
        .expect_err("recording a path outside the vault fails");

    f.engine
        .record_settled(start + SETTLE + SETTLE)
        .expect_err("the failed batch was dropped instead of tried again");
}

/// Nothing pending means nothing to write, not an empty commit.
#[test]
fn flushing_an_idle_workspace_records_nothing() {
    let f = fixture("engine-flush-idle");

    assert_eq!(f.engine.flush().expect("flushing succeeds"), None);
}

/// Two windows on one vault share one engine, so recording has to be safe
/// from more than one thread at a time.
#[test]
fn an_engine_can_be_used_from_several_threads() {
    let f = std::sync::Arc::new(fixture("engine-threads"));
    let start = Instant::now();
    for index in 0..8 {
        write(&f.vault, &format!("note-{index}.md"), "# A note\n");
    }

    std::thread::scope(|scope| {
        for index in 0..8 {
            let f = std::sync::Arc::clone(&f);
            scope.spawn(move || {
                f.engine
                    .note_changes([PathBuf::from(format!("note-{index}.md"))], start);
            });
        }
    });

    let commit = f
        .engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds")
        .expect("a commit is made");

    assert!(message_of(&f.engine, commit).ends_with("— 8 notes changed"));
}
