use super::super::test_support;
use super::*;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use test_support::write;

type Fixture = test_support::EngineFixture;

fn fixture(name: &str) -> Fixture {
    test_support::engine_fixture(name)
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
        f.engine
            .record_settled(start + SETTLE / 2)
            .expect("recording succeeds"),
        None
    );
    assert!(
        f.engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds")
            .is_some()
    );
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
        f.engine
            .record_settled(Instant::now())
            .expect("recording succeeds"),
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
    f.engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds");

    write(&f.vault, "one.md", "# One\n");
    f.engine
        .note_changes([PathBuf::from("one.md")], start + SETTLE);

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
    write(
        &f.vault,
        "note.sync-conflict-20260816-093100-K3SDFHG.md",
        "# Theirs\n",
    );
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
    write(
        &f.vault,
        "note.sync-conflict-20260816-093100-K3SDFHG.md",
        "# Theirs\n",
    );

    f.engine.note_changes(
        [PathBuf::from(
            "note.sync-conflict-20260816-093100-K3SDFHG.md",
        )],
        start,
    );

    assert_eq!(
        f.engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds"),
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

    assert!(
        f.engine.note_conflicts([copy.clone()]),
        "the first sighting was silent"
    );
    assert!(
        !f.engine.note_conflicts([copy]),
        "the same copy was announced twice"
    );
}

#[test]
fn a_deleted_note_is_recorded_when_it_settles() {
    let f = fixture("engine-delete");
    let start = Instant::now();
    write(&f.vault, "one.md", "# One\n");
    f.engine.note_changes([PathBuf::from("one.md")], start);
    f.engine
        .record_settled(start + SETTLE)
        .expect("recording succeeds");

    fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
    f.engine
        .note_changes([PathBuf::from("one.md")], start + SETTLE);

    assert!(
        f.engine
            .record_settled(start + SETTLE + SETTLE)
            .expect("recording succeeds")
            .is_some()
    );
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
    f.engine
        .note_changes([PathBuf::from("one.md")], Instant::now());

    assert_eq!(
        f.engine
            .record_settled(Instant::now())
            .expect("recording succeeds"),
        None,
        "the edit should not have settled yet"
    );
    assert!(
        f.engine.flush().expect("flushing succeeds").is_some(),
        "the unsettled edit was dropped instead of recorded"
    );
}

/// A path that can never be recorded must not be retried every settle
/// window, or it takes every other note with it. It is skipped and reported.
#[test]
fn a_note_that_cannot_be_recorded_does_not_block_the_rest() {
    let f = fixture("engine-skip-bad");
    let start = Instant::now();
    write(&f.vault, "ok.md", "# Ok\n");
    f.engine.note_changes(
        [PathBuf::from("ok.md"), PathBuf::from("../outside.md")],
        start,
    );

    let commit = f
        .engine
        .record_settled(start + SETTLE)
        .expect("the batch is not aborted")
        .expect("the good note is recorded");

    // The message counts the batch taken out of pending, not the notes that
    // landed: both `ok.md` and `../outside.md` were settled, so the count is
    // 2 even though `../outside.md` is then skipped and stuck.
    assert!(
        message_of(&f.engine, commit).ends_with("— 2 notes changed"),
        "the message: {}",
        message_of(&f.engine, commit)
    );
    assert_eq!(f.engine.stuck().len(), 1);
    assert_eq!(f.engine.waiting(), 0);
    assert!(
        f.engine.problem().is_none(),
        "a skipped note was treated as a vault-wide failure"
    );
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

    assert!(
        message_of(&f.engine, commit).ends_with("— 8 notes changed"),
        "the message did not count the notes: {}",
        message_of(&f.engine, commit)
    );
}

#[test]
fn a_vault_is_ready_to_sync_only_once_it_has_been_still_and_the_cap_has_passed() {
    let f = fixture("engine-ready");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("one.md")], start);

    assert!(
        !f.engine.ready_to_sync(
            Duration::from_secs(30),
            60,
            start + Duration::from_secs(5),
            1_005
        ),
        "a vault still being edited was ready"
    );
    assert!(
        f.engine.ready_to_sync(
            Duration::from_secs(30),
            60,
            start + Duration::from_secs(30),
            1_030
        ),
        "a still vault was not ready before its first trip"
    );
    f.engine.mark_attempt(1_030);
    assert!(
        !f.engine.ready_to_sync(
            Duration::from_secs(30),
            60,
            start + Duration::from_secs(30),
            1_030
        ),
        "the frequency cap did not hold"
    );
}

/// The monotonic clock jumps an hour while the wall clock says four
/// seconds passed — the shape of a freeze on a device whose clock the app
/// cannot trust. The interval must believe the wall clock.
#[test]
fn a_frozen_process_does_not_manufacture_an_elapsed_interval() {
    let f = fixture("frozen-interval");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("a.md")], start);
    f.engine.mark_attempt(1_000);

    let long_after = start + Duration::from_secs(3_600);
    assert!(
        !f.engine
            .ready_to_sync(Duration::from_secs(30), 60, long_after, 1_004)
    );
    assert!(
        f.engine
            .ready_to_sync(Duration::from_secs(30), 60, long_after, 1_070)
    );
}

#[test]
fn a_vault_that_has_never_been_attempted_is_due_once_it_is_quiet() {
    let f = fixture("never-attempted");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("a.md")], start);

    assert!(
        !f.engine
            .ready_to_sync(Duration::from_secs(30), 60, start, 1_000)
    );
    assert!(f.engine.ready_to_sync(
        Duration::from_secs(30),
        60,
        start + Duration::from_secs(31),
        1_031
    ));
}

#[test]
fn a_fresh_claim_cannot_be_taken_over() {
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    assert!(f.engine.claim_sync(1_060, 600).is_none());
}

#[test]
fn a_claim_left_by_a_frozen_process_can_be_taken_over() {
    // A freeze pauses the worker mid-flight, so the `Drop` guard that clears
    // the flag never runs. Without a takeover, one frozen trip stops every
    // later one for the life of the process.
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    assert!(f.engine.claim_sync(1_601, 600).is_some());
}

#[test]
fn a_superseded_trip_does_not_clear_the_flag_under_the_one_that_replaced_it() {
    let f = fixture("sync-claim");
    let first = f
        .engine
        .claim_sync(1_000, 600)
        .expect("the first trip claims");
    let second = f
        .engine
        .claim_sync(1_601, 600)
        .expect("the frozen claim is taken over");

    assert!(!f.engine.end_sync(first));
    assert!(f.engine.syncing());
    assert!(f.engine.end_sync(second));
    assert!(!f.engine.syncing());
}

#[test]
fn a_frozen_trip_does_not_stop_the_sweeper_from_syncing_again() {
    // The property the whole claim stamp exists for, asked the way the
    // sweeper asks it. `ready_to_sync` used to consult the raw `syncing`
    // flag, which a freeze leaves set for ever — so the sweeper returned
    // early, never reached `claim_sync`, and the takeover below was
    // unreachable on the only path that starts an automatic sync.
    let f = fixture("frozen-claim-sweeper");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("a.md")], start);
    f.engine.mark_attempt(1_000);
    f.engine.claim_sync(1_000, 600).expect("a trip starts");

    let quiet = Duration::from_secs(30);
    let later = start + Duration::from_secs(120);

    // Still within the orphan bound: the trip is presumed alive, so no.
    assert!(!f.engine.ready_to_sync(quiet, 60, later, 1_100));
    assert!(f.engine.syncing());

    // Past it, with nothing reported since: the sweeper may try again.
    assert!(f.engine.ready_to_sync(quiet, 60, later, 1_700));
}

#[test]
fn taking_a_claim_over_drops_the_step_the_frozen_trip_left_showing() {
    // `status::of` copies the phase beside the state, and a taken-over trip
    // never runs its own `end_sync`. Without clearing here, the frozen
    // trip's last step stays on screen under its replacement.
    let f = fixture("superseded-phase");
    f.engine.claim_sync(1_000, 600).expect("a trip starts");
    f.engine.set_phase(Some(SyncPhase::Sending));

    f.engine
        .claim_sync(1_601, 600)
        .expect("the frozen claim is taken over");

    assert_eq!(f.engine.phase(), None);
}

#[test]
fn a_trip_that_is_still_reporting_progress_is_not_orphaned() {
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    f.engine.note_sync_progress(1_500);
    assert!(f.engine.claim_sync(1_601, 600).is_none());
}
