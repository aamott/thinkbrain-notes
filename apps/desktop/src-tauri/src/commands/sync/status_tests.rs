use super::super::test_support;
use super::*;
use crate::commands::sync::conflict::ConflictCopy;
use std::path::PathBuf;
use std::time::Instant;

struct Vault {
    root: PathBuf,
    engine: Engine,
}

fn vault(name: &str) -> Vault {
    let fixture = test_support::engine_fixture(name);
    Vault {
        root: fixture.vault,
        engine: fixture.engine,
    }
}

fn note(v: &Vault, name: &str, contents: &str) {
    test_support::write(&v.root, name, contents);
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
    v.engine
        .note_changes([PathBuf::from("one.md")], Instant::now());
    v.engine.flush().expect("the change is recorded");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert_eq!(status.waiting, 0);
    assert!(
        status.last_recorded_at.is_some(),
        "a saved workspace knows when"
    );
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
    v.engine
        .set_phase(Some(crate::commands::sync::engine::SyncPhase::Checking));

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Syncing);
    assert_eq!(
        status.phase,
        Some(crate::commands::sync::engine::SyncPhase::Checking)
    );
}

#[test]
fn a_successful_git_check_is_healthy_until_the_next_failure() {
    let v = vault("status-healthy");
    v.engine.set_sync_problem(None);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert_eq!(
        status.health,
        crate::commands::sync::engine::SyncHealth::Healthy
    );
    assert!(status.last_checked_at.is_some());
}

#[test]
fn finishing_a_round_trip_clears_the_named_step() {
    let v = vault("status-phase-clear");
    v.engine.set_syncing(true);
    v.engine
        .set_phase(Some(crate::commands::sync::engine::SyncPhase::Sending));
    v.engine.set_syncing(false);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert!(status.phase.is_none());
}

#[test]
fn a_failed_git_sync_stays_visible_until_git_sync_works() {
    let v = vault("status-git-failed");
    v.engine.set_sync_problem(Some(crate::NativeError::new(
        "sync.auth_required",
        "This git link needs a sign-in.",
    )));
    note(&v, "one.md", "a later local change\n");
    v.engine
        .note_changes([PathBuf::from("one.md")], Instant::now());
    v.engine.flush().expect("local recording still works");

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Problem);
    assert_eq!(
        status.health,
        crate::commands::sync::engine::SyncHealth::Problem
    );
    assert_eq!(
        status.problem.as_ref().map(|error| error.code.as_str()),
        Some("sync.auth_required")
    );
}

#[test]
fn a_change_that_has_not_settled_yet_shows_as_saving() {
    let v = vault("status-saving");
    note(&v, "one.md", "still typing\n");
    v.engine
        .note_changes([PathBuf::from("one.md")], Instant::now());

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
    v.engine
        .note_changes([PathBuf::from("one.md")], Instant::now());
    v.engine
        .note_conflicts([conflict("one.sync-conflict-1.md", "one.md")]);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Attention);
    assert_eq!(status.attention, 1);
}

/// A shortcut or nested repository that did not land is needs-attention, with
/// the code the window turns into recovery copy.
#[test]
fn a_skipped_shortcut_needs_attention() {
    let v = vault("status-symlink-skipped");
    v.engine
        .note_stuck([crate::commands::sync::engine::StuckNote::unsupported(
            "shortcut.md".into(),
            crate::commands::sync::engine::SYMLINK_SKIPPED,
            "A shortcut from another device was not created here.",
        )]);

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Attention);
    assert_eq!(status.stuck.len(), 1);
    assert_eq!(status.stuck[0].code, "sync.symlink_skipped");
    assert!(status.problem.is_none());
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
    v.engine
        .note_conflicts([conflict("one.sync-conflict-1.md", "one.md")]);
    v.engine
        .note_changes([PathBuf::from("one.md/inner.md")], Instant::now());
    v.engine
        .flush()
        .expect("the rest of the vault still records");

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
    v.engine
        .note_changes([PathBuf::from("one.md/inner.md")], Instant::now());
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
        status.health,
        crate::commands::sync::engine::SyncHealth::Problem
    );
    assert_eq!(
        status.problem.as_ref().map(|problem| problem.code.as_str()),
        Some("sync.vault_too_deep")
    );
}

/// A tidy failure is visible without claiming that saving versions has stopped.
#[test]
fn a_maintenance_failure_is_not_a_recording_stop() {
    let v = vault("status-maintain");
    v.engine.set_maintenance_problem(Some(NativeError::new(
        crate::commands::sync::maintain::CLEANUP_FAILED,
        "Could not tidy the saved undo history on this computer.",
    )));

    let status = of(Recording::By(&v.engine)).expect("the status is readable");

    assert_eq!(status.state, State::Idle);
    assert!(status.problem.is_none());
    assert_eq!(
        status
            .maintenance_problem
            .as_ref()
            .map(|problem| problem.code.as_str()),
        Some(crate::commands::sync::maintain::CLEANUP_FAILED)
    );
}
