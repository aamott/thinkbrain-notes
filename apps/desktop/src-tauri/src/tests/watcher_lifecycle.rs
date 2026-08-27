//! File-watcher lifecycle tests: self-write echo suppression (`SelfWriteLog`),
//! live OS-notification integration tests (real filesystem events), and
//! `WatchInterest` tracking (watcher start/stop across windows and remounts).

use crate::commands::watcher::*;
use notify::RecursiveMode;
use notify_debouncer_full::new_debouncer;
use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use super::temp_test_dir;

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

/// The same suppression, through the save path a note actually takes.
///
/// The test above writes with `fs::write`, so it says nothing about the way
/// notes are really saved: a temp file, then a rename over the target. That
/// shape reaches the watcher differently — a created file at a name nobody
/// asked about, and the destination arriving by rename rather than by write —
/// and either could surface as an outside edit, which is how a tab reloads
/// itself out from under someone mid-sentence.
///
/// The temp name starts with a dot, so the vault walk skips it for the same
/// reason it skips every other dot-entry. This pins that, because the atomic
/// write choosing a non-hidden temp name later would be a quiet regression.
#[test]
fn saving_a_note_the_way_the_app_does_reports_no_change_of_its_own() {
    use crate::commands::markdown::write_markdown_document;

    let root = temp_test_dir("watcher-echo-save");
    let note = root.join("draft.md");
    fs::write(&note, "before\n").expect("the note exists to be saved over");

    let (sender, receiver) = mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_millis(100), None, move |result| {
        let _ = sender.send(result);
    })
    .expect("debouncer starts");
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .expect("watching a temp dir succeeds");

    // The save the app really performs, echo announced the way it announces it.
    write_markdown_document(
        &root.to_string_lossy(),
        "draft.md",
        "after\n".to_string(),
        None,
        None,
    )
    .expect("the save succeeds");

    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    let mut raw = 0usize;
    let mut reported = Vec::new();
    while let Ok(result) =
        receiver.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
    {
        if let Ok(events) = result {
            raw += events.len();
            reported.extend(collect_changes(&root, &events).notes);
        }
    }

    drop(debouncer);
    let contents = fs::read_to_string(&note).unwrap_or_default();
    let _ = fs::remove_dir_all(&root);

    assert_eq!(contents, "after\n", "the save did not land");
    assert!(
        raw > 0,
        "the platform reported nothing at all, so suppression was never exercised"
    );
    assert_eq!(
        reported,
        Vec::new(),
        "the app reported its own save as an outside change; saw {reported:?}"
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
