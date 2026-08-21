use super::super::bootstrap::bootstrap;
use super::super::conflict::ConflictCopy;
use super::super::snapshot;
use super::*;
use crate::tests::make_temp_test_dir;
use std::time::Instant;

struct Vault {
    root: PathBuf,
    engine: Engine,
}

fn vault(name: &str) -> Vault {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let root = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    let managed = bootstrap(&app_data, &root).expect("bootstrap succeeds");
    Vault {
        root,
        engine: Engine::new(managed.repo, managed.has_own_git),
    }
}

fn write(v: &Vault, relative: &str, contents: &str) {
    std::fs::write(v.root.join(relative), contents).expect("the file is written");
}

/// Records the note as it stands, the way the sweeper would once it settled.
fn record(v: &Vault, relative: &str) {
    v.engine
        .note_changes([PathBuf::from(relative)], Instant::now());
    v.engine.flush().expect("the change is recorded");
}

fn pairing(copy: &str, original: &str) -> ConflictCopy {
    ConflictCopy {
        copy: copy.to_string(),
        original: original.to_string(),
        provider: "Syncthing",
    }
}

const COPY: &str = "note.sync-conflict-20260817-093100-K3SDFHG.md";

/// Told the setting's answer rather than reading it, so a test says what it
/// is testing instead of depending on a preference file it did not write.
fn settle_one(v: &Vault) -> Vec<ConflictCopy> {
    settle_when(true, &v.engine, &v.root, vec![pairing(COPY, "note.md")])
}

fn exists(v: &Vault, relative: &str) -> bool {
    v.root.join(relative).exists()
}

/// The commonest copy a daemon makes, and the emptiest: same bytes on both
/// sides, from a race about when a file was written rather than what is in it.
#[test]
fn a_copy_identical_to_the_note_is_not_a_question() {
    let v = vault("settle-identical");
    write(&v, "note.md", "# Meeting\nsame on both\n");
    write(&v, COPY, "# Meeting\nsame on both\n");

    let asked = settle_one(&v);

    assert!(asked.is_empty(), "an identical copy should never be raised");
    assert!(!exists(&v, COPY), "the copy should be gone");
    assert_eq!(
        std::fs::read_to_string(v.root.join("note.md")).expect("readable"),
        "# Meeting\nsame on both\n",
        "the note itself must not be touched"
    );
}

/// The other device was simply behind: its file is a state ours has already
/// been through, so ours holds everything theirs did.
#[test]
fn a_copy_of_a_version_we_have_already_moved_past_is_not_a_question() {
    let v = vault("settle-stale");
    write(&v, "note.md", "first\n");
    record(&v, "note.md");
    write(&v, "note.md", "first\nand second\n");
    record(&v, "note.md");
    // What the other machine still had.
    write(&v, COPY, "first\n");

    let asked = settle_one(&v);

    assert!(
        asked.is_empty(),
        "a version we already passed through is not news"
    );
    assert!(!exists(&v, COPY));
    assert_eq!(
        std::fs::read_to_string(v.root.join("note.md")).expect("readable"),
        "first\nand second\n"
    );
}

/// The case the whole feature exists for. Two people wrote different things,
/// and nothing here is entitled to choose between them.
#[test]
fn a_copy_nobody_has_seen_before_is_still_a_question() {
    let v = vault("settle-real");
    write(&v, "note.md", "what I wrote\n");
    record(&v, "note.md");
    write(&v, COPY, "what they wrote\n");

    let asked = settle_one(&v);

    assert_eq!(
        asked.len(),
        1,
        "a real disagreement must still be asked about"
    );
    assert!(exists(&v, COPY), "nothing should have been discarded");
}

/// A note recorded seconds ago has no history to check against, which is a
/// reason to fall back to the cheap rule rather than to fail.
#[test]
fn a_note_with_no_recorded_history_still_settles_an_identical_copy() {
    let v = vault("settle-unrecorded");
    write(&v, "note.md", "never recorded\n");
    write(&v, COPY, "never recorded\n");

    let asked = settle_one(&v);

    assert!(asked.is_empty());
    assert!(!exists(&v, COPY));
}

#[test]
fn a_note_with_no_recorded_history_still_asks_about_a_different_copy() {
    let v = vault("settle-unrecorded-differs");
    write(&v, "note.md", "never recorded\n");
    write(&v, COPY, "and different\n");

    assert_eq!(settle_one(&v).len(), 1);
    assert!(exists(&v, COPY));
}

/// Being unable to settle something quietly is a reason to ask about it, never
/// a reason to drop it.
#[test]
fn a_copy_that_cannot_be_read_is_asked_about_rather_than_discarded() {
    let v = vault("settle-unreadable");
    write(&v, "note.md", "here\n");
    // No copy on disk at all: the pairing names a file that is not there.

    let asked = settle_one(&v);

    assert_eq!(asked.len(), 1, "an unreadable pair must stay a question");
}

/// Settled copies are restorable like every other write, and counted apart
/// from the ones the user was actually asked about — which is the number the
/// three-way-merge decision turns on.
#[test]
fn settling_leaves_a_restore_point_and_its_own_count() {
    let v = vault("settle-counted");
    write(&v, "note.md", "same\n");
    record(&v, "note.md");
    write(&v, COPY, "same\n");

    settle_one(&v);

    let repo = v.engine.repository();
    let held = snapshot::checkpoint_head(&repo)
        .expect("the checkpoints are readable")
        .expect("settling took one");
    let mut tree = repo
        .find_commit(held)
        .expect("the checkpoint exists")
        .tree()
        .expect("the tree exists");
    assert!(
        tree.peel_to_entry_by_path(Path::new(COPY))
            .expect("searchable")
            .is_some(),
        "the discarded copy should still be restorable"
    );

    let rate = history::conflict_rate(&repo).expect("the counter is readable");
    assert_eq!((rate.decisions, rate.settled), (0, 1));
}

// ---------------------------------------------------------------------------
// The setting
// ---------------------------------------------------------------------------

/// Turning it off means being asked about everything, which is the behaviour
/// this story replaced and has to remain reachable.
#[test]
fn with_the_setting_off_even_an_identical_copy_is_asked_about() {
    let v = vault("settle-off");
    write(&v, "note.md", "the same\n");
    write(&v, COPY, "the same\n");

    let asked = settle_when(false, &v.engine, &v.root, vec![pairing(COPY, "note.md")]);

    assert_eq!(
        asked.len(),
        1,
        "with settling off, nothing should be settled"
    );
    assert!(exists(&v, COPY), "and nothing should have been discarded");
}

fn settings_dir(name: &str, contents: Option<&str>) -> PathBuf {
    let app_data = make_temp_test_dir(name, "sync", true);
    if let Some(contents) = contents {
        let path = crate::commands::settings::app_settings_path(&app_data);
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("the folder exists");
        std::fs::write(path, contents).expect("the settings are written");
    }
    app_data
}

#[test]
fn settling_is_on_until_someone_turns_it_off() {
    assert!(enabled_in(None), "with nowhere to look, the default stands");
    assert!(enabled_in(Some(&settings_dir(
        "settle-setting-absent",
        None
    ))));
    assert!(enabled_in(Some(&settings_dir(
        "settle-setting-other-keys",
        Some(r#"{"appearance.theme":"dark"}"#)
    ))));
    assert!(enabled_in(Some(&settings_dir(
        "settle-setting-on",
        Some(r#"{"sync.settleAutomatically":true}"#)
    ))));
}

#[test]
fn settling_is_off_when_the_setting_says_so() {
    assert!(!enabled_in(Some(&settings_dir(
        "settle-setting-off",
        Some(r#"{"sync.settleAutomatically":false}"#)
    ))));
}

/// A preference nobody can read is not an instruction to behave differently.
#[test]
fn an_unreadable_preference_leaves_the_default_standing() {
    assert!(enabled_in(Some(&settings_dir(
        "settle-setting-broken",
        Some("{not json at all")
    ))));
}

/// A keep-or-delete marker is a real question even when the marker file is
/// empty. Settling it as a duplicate would throw the decision away.
#[test]
fn a_keep_or_delete_marker_is_never_settled() {
    let v = vault("settle-keep-or-delete");
    write(&v, "note.md", "changed on this device\n");
    write(&v, "note (keep or delete).md", "");

    let asked = settle_when(
        true,
        &v.engine,
        &v.root,
        vec![pairing("note (keep or delete).md", "note.md")],
    );

    assert_eq!(asked.len(), 1, "a keep-or-delete decision was settled");
    assert!(exists(&v, "note (keep or delete).md"));
    assert_eq!(
        std::fs::read_to_string(v.root.join("note.md")).expect("readable"),
        "changed on this device\n"
    );
}
