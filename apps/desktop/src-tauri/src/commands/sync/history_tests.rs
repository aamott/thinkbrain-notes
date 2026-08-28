use super::super::engine::Engine;
use super::super::hidden_repo;
use super::super::test_support::write;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;

struct Fixture {
    vault: PathBuf,
    repo: gix::Repository,
    engine: Engine,
}

fn fixture(name: &str) -> Fixture {
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    let git_dir = make_temp_test_dir(&format!("{name}-gitdir"), "sync", true);
    let repo = hidden_repo::open_or_create(&git_dir, &vault).expect("the hidden repository opens");
    let engine = Engine::new(repo, false);
    let repo = engine.repository();
    Fixture {
        vault,
        repo,
        engine,
    }
}

/// Records the current state of `paths` under a message of our choosing, so a
/// test can build a history several changes deep without waiting on a sweeper.
fn record(f: &Fixture, message: &str, paths: &[&str]) {
    let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    snapshot::record(&f.repo, &paths, message).expect("the change is recorded");
}

fn on_disk(f: &Fixture, relative: &str) -> String {
    fs::read_to_string(f.vault.join(relative)).expect("the note is on disk")
}

fn paths_in(entry: &Recorded) -> Vec<&str> {
    entry.notes.iter().map(|note| note.path.as_str()).collect()
}

// ---------------------------------------------------------------------------
// Reading history
// ---------------------------------------------------------------------------

#[test]
fn a_vault_that_has_never_been_recorded_has_no_history() {
    let f = fixture("history-empty");

    assert!(
        read(&f.repo, None, 20)
            .expect("the history is readable")
            .is_empty()
    );
}

/// The list is the whole of what a nontechnical person sees of git, so an entry
/// has to say which of *their* notes changed — not which objects did.
#[test]
fn each_recorded_change_names_the_notes_it_touched() {
    let f = fixture("history-names");
    write(&f.vault, "one.md", "first\n");
    write(&f.vault, "journal/two.md", "second\n");
    record(
        &f,
        "Sync 2026-08-17 09:31 — 2 notes changed",
        &["one.md", "journal/two.md"],
    );

    let history = read(&f.repo, None, 20).expect("the history is readable");

    assert_eq!(history.len(), 1);
    assert_eq!(paths_in(&history[0]), ["journal/two.md", "one.md"]);
    assert!(
        history[0]
            .notes
            .iter()
            .all(|note| note.change == NoteChange::Added)
    );
}

/// The message is kept word for word: it is the escape hatch for anyone who
/// wants to see exactly what was recorded rather than our rendering of it.
#[test]
fn the_message_is_kept_word_for_word() {
    let f = fixture("history-message");
    write(&f.vault, "one.md", "first\n");
    record(&f, "Sync 2026-08-17 09:31 — 1 note changed", &["one.md"]);

    let history = read(&f.repo, None, 20).expect("the history is readable");

    assert_eq!(history[0].message, "Sync 2026-08-17 09:31 — 1 note changed");
    assert!(
        history[0].at.is_some(),
        "a recorded change knows when it happened"
    );
}

#[test]
fn an_edit_reads_as_an_update_and_a_removal_as_a_removal() {
    let f = fixture("history-kinds");
    write(&f.vault, "one.md", "first\n");
    write(&f.vault, "two.md", "second\n");
    record(&f, "one", &["one.md", "two.md"]);
    write(&f.vault, "one.md", "first, again\n");
    fs::remove_file(f.vault.join("two.md")).expect("the note is deleted");
    record(&f, "two", &["one.md", "two.md"]);

    let history = read(&f.repo, None, 20).expect("the history is readable");

    assert_eq!(history[0].notes.len(), 2);
    let changes: Vec<(&str, NoteChange)> = history[0]
        .notes
        .iter()
        .map(|note| (note.path.as_str(), note.change))
        .collect();
    assert_eq!(
        changes,
        [
            ("one.md", NoteChange::Updated),
            ("two.md", NoteChange::Removed)
        ]
    );
}

#[test]
fn the_newest_change_comes_first() {
    let f = fixture("history-order");
    write(&f.vault, "one.md", "first\n");
    record(&f, "oldest", &["one.md"]);
    write(&f.vault, "one.md", "second\n");
    record(&f, "newest", &["one.md"]);

    let history = read(&f.repo, None, 20).expect("the history is readable");

    assert_eq!(
        history
            .iter()
            .map(|entry| entry.message.as_str())
            .collect::<Vec<_>>(),
        ["newest", "oldest"]
    );
}

#[test]
fn the_list_stops_at_the_limit_it_was_asked_for() {
    let f = fixture("history-limit");
    for round in 0..5 {
        write(&f.vault, "one.md", &format!("version {round}\n"));
        record(&f, &format!("change {round}"), &["one.md"]);
    }

    let history = read(&f.repo, None, 2).expect("the history is readable");

    assert_eq!(history.len(), 2);
    assert_eq!(history[0].message, "change 4");
}

// ---------------------------------------------------------------------------
// One note's own history
// ---------------------------------------------------------------------------

/// "Previous versions of this note" is the same list, asked a narrower
/// question — which is why it is one reader rather than two.
#[test]
fn one_notes_history_leaves_out_the_changes_that_were_not_about_it() {
    let f = fixture("history-one-note");
    write(&f.vault, "wanted.md", "first\n");
    record(&f, "about the note", &["wanted.md"]);
    write(&f.vault, "other.md", "unrelated\n");
    record(&f, "about something else", &["other.md"]);

    let history = read(&f.repo, Some("wanted.md"), 20).expect("the history is readable");

    assert_eq!(history.len(), 1);
    assert_eq!(history[0].message, "about the note");
    assert_eq!(paths_in(&history[0]), ["wanted.md"]);
}

/// A version list offers content to put back. The change that deleted the note
/// has no content, so offering it would be offering to delete the note again
/// under a button labelled "Restore".
#[test]
fn one_notes_history_leaves_out_the_change_that_deleted_it() {
    let f = fixture("history-deleted");
    write(&f.vault, "gone.md", "here\n");
    record(&f, "written", &["gone.md"]);
    fs::remove_file(f.vault.join("gone.md")).expect("the note is deleted");
    record(&f, "deleted", &["gone.md"]);

    let history = read(&f.repo, Some("gone.md"), 20).expect("the history is readable");

    assert_eq!(
        history
            .iter()
            .map(|entry| entry.message.as_str())
            .collect::<Vec<_>>(),
        ["written"]
    );
}

// ---------------------------------------------------------------------------
// Putting a version back
// ---------------------------------------------------------------------------

#[test]
fn restoring_puts_the_earlier_text_back_on_disk() {
    let f = fixture("restore-basic");
    write(&f.vault, "note.md", "the version I want back\n");
    record(&f, "first", &["note.md"]);
    write(&f.vault, "note.md", "what I typed by mistake\n");
    record(&f, "second", &["note.md"]);

    let wanted = read(&f.repo, Some("note.md"), 20).expect("readable")[1]
        .id
        .clone();
    restore(&f.engine, "note.md", &wanted).expect("the version is restored");

    assert_eq!(on_disk(&f, "note.md"), "the version I want back\n");
    let leftovers: Vec<_> = fs::read_dir(&f.vault)
        .expect("the vault is readable")
        .map(|entry| entry.expect("the entry is readable").file_name())
        .collect();
    assert_eq!(
        leftovers.as_slice(),
        [std::ffi::OsString::from("note.md")],
        "a restore must not leave a sibling temp behind"
    );
}

/// The promise the merge tab makes out loud — "you can always undo" — has to
/// hold for the undo itself, or the second click is the unrecoverable one.
#[test]
fn a_restore_can_itself_be_undone() {
    let f = fixture("restore-of-restore");
    write(&f.vault, "note.md", "version one\n");
    record(&f, "first", &["note.md"]);
    write(&f.vault, "note.md", "version two\n");
    record(&f, "second", &["note.md"]);

    let history = read(&f.repo, Some("note.md"), 20).expect("readable");
    let (newer, older) = (history[0].id.clone(), history[1].id.clone());

    restore(&f.engine, "note.md", &older).expect("the older version is restored");
    assert_eq!(on_disk(&f, "note.md"), "version one\n");

    restore(&f.engine, "note.md", &newer).expect("the restore is undone");
    assert_eq!(on_disk(&f, "note.md"), "version two\n");
}

#[test]
fn a_restore_takes_a_restore_point_of_what_it_is_about_to_overwrite() {
    let f = fixture("restore-checkpoint");
    write(&f.vault, "note.md", "version one\n");
    record(&f, "first", &["note.md"]);
    write(&f.vault, "note.md", "version two\n");
    record(&f, "second", &["note.md"]);

    let older = read(&f.repo, Some("note.md"), 20).expect("readable")[1]
        .id
        .clone();
    let restored = restore(&f.engine, "note.md", &older).expect("the version is restored");

    let checkpoint = gix::ObjectId::from_hex(restored.checkpoint.as_bytes()).expect("an id");
    let mut tree = f
        .repo
        .find_commit(checkpoint)
        .expect("the checkpoint exists")
        .tree()
        .expect("the tree exists");
    let entry = tree
        .peel_to_entry_by_path(Path::new("note.md"))
        .expect("searchable")
        .expect("the note is held");
    let held = entry.object().expect("readable").data.clone();
    assert_eq!(
        String::from_utf8(held).expect("text"),
        "version two\n",
        "the checkpoint has to hold what was there before the restore, not after"
    );
}

#[test]
fn restoring_a_note_that_had_been_deleted_brings_it_back() {
    let f = fixture("restore-deleted");
    write(&f.vault, "gone.md", "still wanted\n");
    record(&f, "written", &["gone.md"]);
    fs::remove_file(f.vault.join("gone.md")).expect("the note is deleted");
    record(&f, "deleted", &["gone.md"]);

    let wanted = read(&f.repo, Some("gone.md"), 20).expect("readable")[0]
        .id
        .clone();
    restore(&f.engine, "gone.md", &wanted).expect("the note comes back");

    assert_eq!(on_disk(&f, "gone.md"), "still wanted\n");
}

#[test]
fn restoring_a_version_a_note_never_had_is_refused() {
    let f = fixture("restore-missing");
    write(&f.vault, "one.md", "only note\n");
    record(&f, "first", &["one.md"]);

    let change = read(&f.repo, None, 20).expect("readable")[0].id.clone();
    let error = restore(&f.engine, "never-existed.md", &change).expect_err("nothing to restore");

    assert_eq!(error.code, "sync.version_missing");
}

#[test]
fn restoring_from_something_that_is_not_a_recorded_change_is_refused() {
    let f = fixture("restore-bad-id");
    write(&f.vault, "one.md", "only note\n");
    record(&f, "first", &["one.md"]);

    let error = restore(&f.engine, "one.md", "not-an-id").expect_err("nothing to restore from");

    assert_eq!(error.code, "sync.version_missing");
}

/// The paths here come from the app rather than from a user, but a `..` that
/// escaped would write the hidden repository's contents over an unrelated file.
#[test]
fn restoring_to_a_path_outside_the_vault_is_refused() {
    let f = fixture("restore-escape");
    write(&f.vault, "one.md", "only note\n");
    record(&f, "first", &["one.md"]);

    let change = read(&f.repo, None, 20).expect("readable")[0].id.clone();
    let error = restore(&f.engine, "../elsewhere.md", &change).expect_err("refused");

    assert_eq!(error.code, "sync.path_outside_vault");
}

// ---------------------------------------------------------------------------
// The local conflict-rate counter
// ---------------------------------------------------------------------------

/// Local only, and never sent anywhere. It exists to answer one question with
/// evidence rather than opinion: are two-version conflicts common enough to be
/// worth merging against a shared base rather than side by side?
#[test]
fn the_counter_tells_decisions_from_restores() {
    let f = fixture("conflict-rate");
    write(&f.vault, "one.md", "first\n");
    record(&f, "first", &["one.md"]);
    write(&f.vault, "one.md", "second\n");
    record(&f, "second", &["one.md"]);

    snapshot::checkpoint(
        &f.repo,
        &[PathBuf::from("one.md")],
        snapshot::Reason::ConflictResolved,
    )
    .expect("a decision is checkpointed");
    write(&f.vault, "one.md", "third\n");
    snapshot::checkpoint(
        &f.repo,
        &[PathBuf::from("one.md")],
        snapshot::Reason::VersionRestored,
    )
    .expect("a restore is checkpointed");

    let rate = conflict_rate(&f.repo).expect("the counter is readable");

    assert_eq!(
        rate.decisions, 1,
        "a restore is not a conflict anyone had to decide"
    );
    assert_eq!(rate.recorded, 2);
}

#[test]
fn the_counter_starts_at_nothing() {
    let f = fixture("conflict-rate-empty");

    let rate = conflict_rate(&f.repo).expect("the counter is readable");

    assert_eq!((rate.decisions, rate.recorded), (0, 0));
}
