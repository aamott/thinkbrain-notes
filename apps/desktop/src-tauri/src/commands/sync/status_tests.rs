use super::*;
use crate::commands::sync::bootstrap::bootstrap;
use crate::commands::sync::conflict::ConflictCopy;
use crate::tests::make_temp_test_dir;
use std::path::PathBuf;
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

fn note(v: &Vault, name: &str, contents: &str) {
    std::fs::write(v.root.join(name), contents).expect("the note is written");
}

fn conflict(copy: &str, original: &str) -> ConflictCopy {
    ConflictCopy {
        copy: copy.to_string(),
        original: original.to_string(),
        provider: "Syncthing",
    }
}

/// A vault nobody is editing is the resting state, and the only thing anyone
/// needs to hear about it is that everything is saved and when.
#[test]
fn a_quiet_workspace_says_when_it_last_saved() {
    let v = vault("status-quiet");
    note(&v, "one.md", "written\n");
    v.engine.note_changes([PathBuf::from("one.md")], Instant::now());
    v.engine.flush().expect("the change is recorded");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert_eq!(status.waiting, 0);
    assert!(status.last_recorded_at.is_some(), "a saved workspace knows when");
    assert!(status.problem.is_none());
}

#[test]
fn a_workspace_that_has_never_been_recorded_is_still_idle() {
    let v = vault("status-fresh");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert_eq!(status.last_recorded_at, None);
}

#[test]
fn a_round_trip_in_flight_says_so() {
    let v = vault("status-syncing");
    v.engine.set_syncing(true);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Syncing);
}

#[test]
fn a_change_that_has_not_settled_yet_shows_as_saving() {
    let v = vault("status-saving");
    note(&v, "one.md", "still typing\n");
    v.engine.note_changes([PathBuf::from("one.md")], Instant::now());

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Saving);
    assert_eq!(status.waiting, 1);
}

/// Something waiting on a decision outranks something waiting on a disk: one
/// of them needs the user, and the other one is doing fine on its own.
#[test]
fn a_conflict_outranks_a_change_still_being_saved() {
    let v = vault("status-attention");
    note(&v, "one.md", "still typing\n");
    v.engine.note_changes([PathBuf::from("one.md")], Instant::now());
    v.engine.note_conflicts([conflict("one.sync-conflict-1.md", "one.md")]);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Attention);
    assert_eq!(status.attention, 1);
}

/// A note that cannot be recorded is needs-attention, not a vault-wide stop.
/// Recording through a file is Unix-only: Windows reports that as "not found".
#[cfg(unix)]
#[test]
fn a_note_that_cannot_be_recorded_needs_attention_not_a_full_stop() {
    let v = vault("status-stuck");
    // Make `one.md` a file so `one.md/inner.md` is unreadable, then turn it
    // into a folder to recover.
    note(&v, "one.md", "a note, not a folder\n");
    v.engine.note_conflicts([conflict("one.sync-conflict-1.md", "one.md")]);
    v.engine
        .note_changes([PathBuf::from("one.md/inner.md")], Instant::now());
    v.engine.flush().expect("the rest of the vault still records");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Attention);
    assert_eq!(status.stuck.len(), 1);
    assert_eq!(status.stuck[0].code, "sync.note_read_failed");
    assert!(status.problem.is_none());
}

#[cfg(unix)]
#[test]
fn recording_a_readable_note_clears_a_stuck_one_that_has_been_fixed() {
    let v = vault("status-recovered");
    // Make `one.md` a file so `one.md/inner.md` is unreadable, then turn it
    // into a folder to recover.
    note(&v, "one.md", "a note, not a folder\n");
    v.engine
        .note_changes([PathBuf::from("one.md/inner.md")], Instant::now());
    v.engine.flush().expect("the unreadable path is skipped");
    assert_eq!(v.engine.stuck().len(), 1);

    std::fs::remove_file(v.root.join("one.md")).expect("the note is removed");
    std::fs::create_dir(v.root.join("one.md")).expect("the folder exists");
    note(&v, "one.md/inner.md", "now writable\n");
    v.engine.note_changes([PathBuf::from("one.md/inner.md")], Instant::now());
    v.engine.flush().expect("the next change records");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert!(status.stuck.is_empty());
    assert!(status.problem.is_none());
}

/// A vault with its own git repository is left alone on purpose. Saying so is
/// better than a pill that quietly claims everything is saved.
#[test]
fn a_workspace_nobody_is_recording_says_so() {
    let status = of(Recording::NotOurs).expect("the status is readable");

    assert_eq!(status.state, State::Off);
    assert_eq!((status.waiting, status.attention), (0, 0));
    assert!(status.problem.is_none());
}

/// A vault that could not be set up used to be reported as one we chose not to
/// record, which reads as a decision rather than a fault — and left the user
/// with a panel that said nothing needed their attention and no way to learn
/// why. Setting up is the one failure that happens before there is an engine
/// to hold it, so the registry holds it instead.
#[test]
fn a_workspace_that_could_not_be_set_up_is_a_problem_and_not_a_choice() {
    let status = of(Recording::Failed(NativeError::new(
        "sync.vault_too_deep",
        "This workspace's folders are nested deeper than Auto Sync can safely walk.",
    )))
    .expect("the status is readable");

    assert_eq!(status.state, State::Problem);
    assert_eq!(
        status.problem.as_ref().map(|problem| problem.code.as_str()),
        Some("sync.vault_too_deep")
    );
}
