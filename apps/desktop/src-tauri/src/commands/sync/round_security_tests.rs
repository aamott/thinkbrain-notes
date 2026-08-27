use super::tests::{Device, device, files, read, shared, trip, write, write_only};
use super::*;
use std::fs;
use std::time::{Duration, Instant};

/// An interrupted sync leaves the unnumbered slot behind. The next attempt
/// must overwrite it, not stack ` 2`.
#[test]
fn an_interrupted_copy_is_overwritten_not_numbered() {
    let one = device("round-reuse-one");
    let two = device("round-reuse-two");
    let there = shared("round-reuse");
    write(&one, "note.md", "the line\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "their wording\n");
    trip(&one, &there);
    write(&two, "note.md", "our wording\n");
    write_only(&two, "note (from another device).md", "stale leftover\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(
        read(&two, "note (from another device).md"),
        "their wording\n"
    );
    assert!(
        !two.vault.join("note (from another device 2).md").exists(),
        "a leftover copy was numbered past: {:?}",
        files(&two)
    );
}

/// A note that cannot be written does not stop the rest of the vault landing.
#[test]
fn one_unwritable_note_does_not_stall_the_vault() {
    let one = device("round-unwritable-one");
    let two = device("round-unwritable-two");
    let there = shared("round-unwritable");
    write(&one, "good.md", "ok\n");
    write(&one, "blocked.md", "cannot land\n");
    trip(&one, &there);

    fs::create_dir(two.vault.join("blocked.md")).expect("the name is occupied by a folder");

    let synced = trip(&two, &there);

    assert_eq!(
        read(&two, "good.md"),
        "ok\n",
        "the rest of the vault did not land"
    );
    assert!(
        two.vault.join("blocked.md").is_dir(),
        "the blocking folder was replaced"
    );
    assert_eq!(synced.skipped.len(), 1);
    assert_eq!(synced.skipped[0].path, "blocked.md");
    assert_eq!(synced.skipped[0].code, "sync.note_write_failed");
}

/// Two windows, or one impatient double-click. Every one of them has real work
/// to do here — the destination holds a note this device has never seen — so
/// each thread reaches the merge, and all four have to come back agreeing with
/// the destination about where history ended.
///
/// This is not a proof of the lane. A collision needs two threads past fetch
/// before either commits, and this workload rarely produces that. What it
/// does cover is that concurrent `sync` calls do not panic or leave this
/// device disagreeing with the destination. The lane itself is proved by
/// `a_sync_waits_for_the_workspace_lane_before_entering_the_trip`.
#[test]
fn concurrent_syncs_on_one_vault_agree_on_history() {
    let one = device("round-at-once");
    let elsewhere = device("round-at-once-other");
    let there = shared("round-at-once");
    write(&elsewhere, "theirs.md", "from the other device\n");
    trip(&elsewhere, &there);
    write(&one, "note.md", "first\n");
    let engine = std::sync::Arc::new(super::super::engine::Engine::new(
        gix::open(one.repo.path()).expect("the hidden repository reopens"),
        false,
    ));
    let key = one.vault.to_string_lossy().to_string();

    let outcomes: Vec<Result<Synced, crate::NativeError>> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let engine = std::sync::Arc::clone(&engine);
                let vault = one.vault.clone();
                let there = there.clone();
                let key = key.clone();
                scope.spawn(move || sync(&engine, &key, &vault, &there, None))
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().expect("the thread finishes"))
            .collect()
    });

    for outcome in &outcomes {
        assert!(outcome.is_ok(), "a sync collided with another: {outcome:?}");
    }
    assert_eq!(
        remote_tip(&there),
        snapshot::head_commit(&one.repo).expect("the branch is readable"),
        "the destination and this device disagree about where history ended"
    );
    assert_eq!(read(&one, "theirs.md"), "from the other device\n");
}

/// The per-workspace lane is what stops two windows on the same vault from
/// fetching, merging and committing at once. `engine.syncing()` flips on only
/// after that lock is taken, so holding the mutex ourselves is a barrier:
/// a queued `sync` must not enter the trip until we let go.
///
/// Removing the `lane.lock()` in `sync` fails this test — the worker flips
/// `syncing` while this thread still holds the mutex.
#[test]
fn a_sync_waits_for_the_workspace_lane_before_entering_the_trip() {
    let one = device("round-lane-held");
    let there = shared("round-lane-held");
    write(&one, "note.md", "first\n");
    let engine = std::sync::Arc::new(super::super::engine::Engine::new(
        gix::open(one.repo.path()).expect("the hidden repository reopens"),
        false,
    ));
    let key = one.vault.to_string_lossy().to_string();
    let held = super::super::registry::lane(&key);
    let guard = held.lock().expect("the test holds the lane");

    let outcomes = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..2)
            .map(|_| {
                let engine = std::sync::Arc::clone(&engine);
                let vault = one.vault.clone();
                let there = there.clone();
                let key = key.clone();
                scope.spawn(move || sync(&engine, &key, &vault, &there, None))
            })
            .collect();

        // Without the lane, `set_syncing(true)` is a few calls after spawn.
        // Holding here for well past that window is what makes a missing lock
        // fail rather than race green.
        let started = Instant::now();
        while started.elapsed() < Duration::from_millis(250) {
            assert!(
                !engine.syncing(),
                "a sync entered the trip while the workspace lane was held"
            );
            std::thread::sleep(Duration::from_millis(10));
        }

        drop(guard);
        handles
            .into_iter()
            .map(|handle| handle.join().expect("the thread finishes"))
            .collect::<Vec<_>>()
    });

    for outcome in &outcomes {
        assert!(
            outcome.is_ok(),
            "a queued sync failed once the lane opened: {outcome:?}"
        );
    }
    assert_eq!(
        remote_tip(&there),
        snapshot::head_commit(&one.repo).expect("the branch is readable"),
        "the destination and this device disagree about where history ended"
    );
}

fn remote_tip(destination: &str) -> Option<gix::ObjectId> {
    let repo = gix::open(destination).expect("the destination opens");
    repo.try_find_reference("refs/heads/main")
        .expect("the destination's refs are readable")
        .map(|mut found| {
            found
                .peel_to_id()
                .expect("the ref points at an object")
                .detach()
        })
}

/// A name this device cannot even read is not a name it should guess at.
/// Writing it under a mangled spelling would leave the two devices tracking
/// different files forever, each unable to touch the other's. Here the
/// hostile history holds a tree entry whose name is `note\xff.md` — a byte
/// sequence that is not valid UTF-8 on this device — and pulling it must be
/// refused rather than recorded under a guessed spelling.
#[test]
fn a_note_whose_name_cannot_be_read_here_is_refused() {
    let victim = device("round-unreadable-name");
    let there = shared("round-unreadable-name");

    let hostile = device("round-unreadable-name-other");
    let blob = hostile
        .repo
        .write_blob(b"anything")
        .expect("the blob is written")
        .detach();
    let root = tree_holding(
        &hostile,
        b"note\xff.md".to_vec(),
        gix::object::tree::EntryKind::Blob,
        blob,
    );
    let crafted = commit_of(&hostile, "a name in no encoding", root, &[]);
    push::send(&hostile.repo, &there, BRANCH, crafted).expect("the crafted history is sent");

    let error =
        once(&victim.repo, &victim.vault, &there).expect_err("an unreadable name is refused");

    assert_eq!(error.code, "sync.note_name_unreadable");
    assert!(
        files(&victim).is_empty(),
        "something was written anyway: {:?}",
        files(&victim)
    );
}

/// Someone types into a note while a sync is running, or after one was
/// interrupted before it could record what it had already written. Either way
/// what is on disk is theirs, and the other device's version goes beside it.
#[test]
fn a_note_changed_underneath_a_sync_is_never_written_over() {
    let one = device("round-underneath-one");
    let two = device("round-underneath-two");
    let there = shared("round-underneath");
    write(&one, "note.md", "as it was\n");
    trip(&one, &there);
    trip(&two, &there);

    write_only(&two, "note.md", "what they were typing\n");
    write(&one, "note.md", "changed elsewhere\n");
    trip(&one, &there);

    let synced = trip(&two, &there);

    assert_eq!(
        read(&two, "note.md"),
        "what they were typing\n",
        "someone's typing was lost"
    );
    assert_eq!(
        read(&two, "note (from another device).md"),
        "changed elsewhere\n"
    );
    assert_eq!(synced.asked_about, 1);
}

/// Nothing in git's tree format forbids an entry named `..`, and `Path::join`
/// follows it straight out of the folder. A destination someone else controls
/// must never be able to choose where this app writes. Here the hostile
/// history nests a tree entry named `..` pointing at `escaped.md`, so a
/// naive recorder would write outside the vault — the pull must refuse it.
#[test]
fn a_note_named_to_escape_the_folder_is_refused() {
    let victim = device("round-escape");
    let there = shared("round-escape");

    let hostile = device("round-escape-hostile");
    let blob = hostile
        .repo
        .write_blob(b"escaped")
        .expect("the blob is written")
        .detach();
    let inside = tree_holding(
        &hostile,
        "escaped.md",
        gix::object::tree::EntryKind::Blob,
        blob,
    );
    let root = tree_holding(&hostile, "..", gix::object::tree::EntryKind::Tree, inside);
    let crafted = commit_of(&hostile, "a folder named to escape", root, &[]);
    push::send(&hostile.repo, &there, BRANCH, crafted).expect("the crafted history is sent");

    let escaped = victim
        .vault
        .parent()
        .expect("the vault has a parent")
        .join("escaped.md");
    let error = once(&victim.repo, &victim.vault, &there).expect_err("a crafted tree is refused");

    assert!(
        !escaped.exists(),
        "a note was written outside the folder: {escaped:?}"
    );
    assert_eq!(error.code, "sync.path_outside_vault");
}

/// Builds a raw gix tree holding a single entry, so a test can craft a
/// hostile history (a `..` folder, an unreadable name) that the recorder
/// would never produce itself.
fn tree_holding(
    device: &Device,
    name: impl Into<gix::bstr::BString>,
    kind: gix::object::tree::EntryKind,
    oid: gix::ObjectId,
) -> gix::ObjectId {
    device
        .repo
        .write_object(&gix::objs::Tree {
            entries: vec![gix::objs::tree::Entry {
                mode: kind.into(),
                filename: name.into(),
                oid,
            }],
        })
        .expect("the tree is written")
        .detach()
}

/// Writes a raw gix commit pointing at `tree`, so a test can build a
/// hostile history the security tests push at a victim device.
fn commit_of(
    device: &Device,
    message: &str,
    tree: gix::ObjectId,
    parents: &[gix::ObjectId],
) -> gix::ObjectId {
    let who = gix::actor::Signature {
        name: "ThinkBrain Notes".into(),
        email: "sync@thinkbrain.notes".into(),
        time: gix::date::Time::now_utc(),
    };
    device
        .repo
        .write_object(&gix::objs::Commit {
            tree,
            parents: parents.iter().copied().collect(),
            author: who.clone(),
            committer: who,
            encoding: None,
            message: message.into(),
            extra_headers: Vec::new(),
        })
        .expect("the commit is written")
        .detach()
}
