use super::super::hidden_repo;
use super::*;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// One device: a notes folder and the hidden repository that records it.
struct Device {
    vault: PathBuf,
    repo: gix::Repository,
}

fn device(name: &str) -> Device {
    let vault = make_temp_test_dir(&format!("{name}-vault"), "round", true);
    let git_dir = make_temp_test_dir(&format!("{name}-gitdir"), "round", true);
    let repo = hidden_repo::open_or_create(&git_dir, &vault).expect("the hidden repository opens");
    Device { vault, repo }
}

/// The place both devices sync to.
fn shared(name: &str) -> String {
    let path = make_temp_test_dir(&format!("{name}-remote"), "round", true);
    gix::init_bare(&path).expect("the destination is created");
    path.to_string_lossy().into_owned()
}

fn write(device: &Device, relative: &str, contents: &str) {
    let path = device.vault.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("the note's folder exists");
    }
    fs::write(path, contents).expect("the note is written");
    record(device, relative);
}

/// Writes a note without recording it, the way an unsaved edit sits on disk
/// between the moment someone types it and the moment the sweeper notices.
fn write_only(device: &Device, relative: &str, contents: &str) {
    fs::write(device.vault.join(relative), contents).expect("the note is written");
}

/// Records what is on disk, the way the sweeper would have.
fn record(device: &Device, relative: &str) {
    snapshot::record(
        &device.repo,
        &[PathBuf::from(relative)],
        &format!("changed {relative}"),
    )
    .expect("the change is recorded");
}

fn remove(device: &Device, relative: &str) {
    fs::remove_file(device.vault.join(relative)).expect("the note is deleted");
    record(device, relative);
}

fn read(device: &Device, relative: &str) -> String {
    fs::read_to_string(device.vault.join(relative)).expect("the note is on disk")
}

/// One whole round trip, the way the command runs it.
fn trip(device: &Device, destination: &str) -> Synced {
    once(&device.repo, &device.vault, destination).expect("the sync succeeds")
}

/// Every file in the vault, so a test can say what a sync did and did not leave.
fn files(device: &Device) -> Vec<String> {
    let mut found = Vec::new();
    let mut folders = vec![device.vault.clone()];
    while let Some(folder) = folders.pop() {
        for entry in fs::read_dir(&folder).expect("the folder is readable") {
            let path = entry.expect("the entry is readable").path();
            if path.is_dir() {
                folders.push(path);
            } else if let Ok(relative) = path.strip_prefix(&device.vault) {
                found.push(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    found.sort();
    found
}

// ---------------------------------------------------------------------------
// Where it syncs to
// ---------------------------------------------------------------------------

fn with_setting(name: &str, written: Option<&str>) -> (PathBuf, PathBuf) {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "round", true);
    let root = make_temp_test_dir(&format!("{name}-vault"), "round", true);
    if let Some(written) = written {
        let path = crate::commands::settings::workspace_settings_path(&app_data, &root);
        fs::create_dir_all(path.parent().expect("the settings folder has a parent"))
            .expect("the settings folder exists");
        fs::write(&path, written).expect("the settings are written");
    }
    (app_data, root)
}

#[test]
fn a_vault_nobody_has_pointed_anywhere_syncs_nowhere() {
    let (app_data, root) = with_setting("round-nowhere", None);

    assert_eq!(destination(&app_data, &root), None);
}

#[test]
fn a_named_destination_is_read_back_without_its_spaces() {
    let (app_data, root) = with_setting(
        "round-named",
        Some(r#"{"sync.destination": "  https://example.test/notes.git  "}"#),
    );

    assert_eq!(
        destination(&app_data, &root).as_deref(),
        Some("https://example.test/notes.git")
    );
}

#[test]
fn a_token_embedded_in_the_link_never_leaves_with_the_destination() {
    let (app_data, root) = with_setting(
        "round-token",
        Some(r#"{"sync.destination": "https://x-access-token:s3cret@example.test/notes.git"}"#),
    );

    let named = destination(&app_data, &root).expect("a destination is set");
    assert_eq!(named, "https://example.test/notes.git");
    assert!(!named.contains("s3cret"));
    let stored = fs::read_to_string(crate::commands::settings::workspace_settings_path(
        &app_data, &root,
    ))
    .expect("the settings are still there");
    assert!(
        !stored.contains("s3cret"),
        "the token was left in the settings file"
    );
}

/// Someone clearing the box means "stop syncing", not "sync to the empty
/// string" — and an empty destination would otherwise fail on every attempt.
#[test]
fn a_destination_cleared_back_to_nothing_syncs_nowhere() {
    let (app_data, root) = with_setting("round-cleared", Some(r#"{"sync.destination": "   "}"#));

    assert_eq!(destination(&app_data, &root), None);
}

// ---------------------------------------------------------------------------
// Getting there and back
// ---------------------------------------------------------------------------

#[test]
fn a_first_sync_into_an_empty_destination_sends_everything() {
    let one = device("round-first");
    let there = shared("round-first");
    write(&one, "one.md", "first\n");

    let synced = trip(&one, &there);

    assert_eq!(synced.landed, push::Landed::Moved);
    assert_eq!(synced.brought_down, 0, "an empty destination had something to bring down");
    assert!(synced.sent > 0, "nothing was sent");
}

#[test]
fn a_second_device_brings_down_what_the_first_wrote() {
    let one = device("round-second-one");
    let two = device("round-second-two");
    let there = shared("round-second");
    write(&one, "one.md", "first\n");
    trip(&one, &there);

    let synced = trip(&two, &there);

    assert_eq!(synced.brought_down, 1);
    assert_eq!(read(&two, "one.md"), "first\n");
}

#[test]
fn each_device_ends_up_with_what_the_other_wrote() {
    let one = device("round-converge-one");
    let two = device("round-converge-two");
    let there = shared("round-converge");
    write(&one, "from-one.md", "one\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&two, "from-two.md", "two\n");
    trip(&two, &there);
    trip(&one, &there);

    assert_eq!(read(&one, "from-two.md"), "two\n");
    assert_eq!(read(&two, "from-one.md"), "one\n");
}

#[test]
fn a_note_deleted_on_one_device_goes_away_on_the_other() {
    let one = device("round-delete-one");
    let two = device("round-delete-two");
    let there = shared("round-delete");
    write(&one, "one.md", "first\n");
    trip(&one, &there);
    trip(&two, &there);

    remove(&one, "one.md");
    trip(&one, &there);
    trip(&two, &there);

    assert!(!two.vault.join("one.md").exists(), "the note is still there");
}

// ---------------------------------------------------------------------------
// Both sides moved
// ---------------------------------------------------------------------------

/// The case the whole feature is for, and the one a two-way comparison could
/// never answer: two devices, different notes, no question to ask.
#[test]
fn different_notes_on_each_side_merge_without_asking() {
    let one = device("round-apart-one");
    let two = device("round-apart-two");
    let there = shared("round-apart");
    write(&one, "shared.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "mine.md", "mine\n");
    trip(&one, &there);
    write(&two, "theirs.md", "theirs\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 0, "a question was asked about nothing");
    assert_eq!(synced.landed, push::Landed::Moved, "the merge was not accepted");
    assert_eq!(read(&two, "mine.md"), "mine\n");
    assert_eq!(read(&two, "theirs.md"), "theirs\n");
}

/// A merge that is not recorded still looks right on the device that made it —
/// the vault holds both sides — and then never leaves it, because the branch
/// never learned about the other side and every later push is refused as
/// out of date. So the proof of a merge is a third device seeing it.
#[test]
fn what_a_merge_joined_is_sent_on_to_everyone_else() {
    let one = device("round-onward-one");
    let two = device("round-onward-two");
    let three = device("round-onward-three");
    let there = shared("round-onward");
    write(&one, "shared.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "mine.md", "mine\n");
    trip(&one, &there);
    write(&two, "theirs.md", "theirs\n");
    let merged = trip(&two, &there);

    assert_eq!(merged.landed, push::Landed::Moved, "the merge was not accepted");

    trip(&three, &there);

    assert_eq!(read(&three, "mine.md"), "mine\n");
    assert_eq!(read(&three, "theirs.md"), "theirs\n");
    assert_eq!(read(&three, "shared.md"), "shared\n");
}

/// One note, two devices, edits in different places. Git merges this silently
/// and so do we — this is the difference an exact base buys.
#[test]
fn edits_in_different_parts_of_one_note_merge_without_asking() {
    let one = device("round-hunks-one");
    let two = device("round-hunks-two");
    let there = shared("round-hunks");
    write(&one, "note.md", "top\nmiddle\nbottom\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "top changed\nmiddle\nbottom\n");
    trip(&one, &there);
    write(&two, "note.md", "top\nmiddle\nbottom changed\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 0, "a question was asked about separate edits");
    assert_eq!(read(&two, "note.md"), "top changed\nmiddle\nbottom changed\n");
}

/// The same line, both sides. Nothing can decide this but a person, so ours
/// stays put and theirs arrives beside it in the shape the panel already knows.
#[test]
fn the_same_line_changed_on_both_sides_leaves_a_copy_to_choose_from() {
    let one = device("round-clash-one");
    let two = device("round-clash-two");
    let there = shared("round-clash");
    write(&one, "note.md", "the line\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "their wording\n");
    trip(&one, &there);
    write(&two, "note.md", "our wording\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(read(&two, "note.md"), "our wording\n", "our note was overwritten");
    let copy = "note (from another device).md";
    assert_eq!(read(&two, copy), "their wording\n", "theirs did not arrive beside it");
    assert!(
        conflict::pair(copy, |path| two.vault.join(path).exists()).is_some(),
        "the copy is not in a shape the conflict panel recognises"
    );
}

/// A conflict marker is a format nobody chose and no editor explains.
#[test]
fn no_conflict_marker_is_ever_written_into_a_note() {
    let one = device("round-markers-one");
    let two = device("round-markers-two");
    let there = shared("round-markers");
    write(&one, "note.md", "the line\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "their wording\n");
    trip(&one, &there);
    write(&two, "note.md", "our wording\n");
    trip(&two, &there);

    for name in files(&two) {
        assert!(
            !read(&two, &name).contains("<<<<<<<"),
            "a conflict marker was written into {name}"
        );
    }
}

/// The copy belongs to the device that made it. Pushing it would hand everyone
/// else a conflict they were never part of.
#[test]
fn a_copy_made_by_a_pull_is_never_sent_on() {
    let one = device("round-keep-one");
    let two = device("round-keep-two");
    let three = device("round-keep-three");
    let there = shared("round-keep");
    write(&one, "note.md", "the line\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "their wording\n");
    trip(&one, &there);
    write(&two, "note.md", "our wording\n");
    trip(&two, &there);
    trip(&two, &there);

    trip(&three, &there);

    assert!(
        !three.vault.join("note (from another device).md").exists(),
        "a third device was handed someone else's conflict"
    );
}

/// Someone sets sync up on their second device, and that device already has
/// notes on it. The two histories have no shared commit anywhere, which is not
/// a fault — it is the ordinary way a second device joins.
#[test]
fn two_devices_that_each_already_had_notes_are_joined() {
    let one = device("round-join-one");
    let two = device("round-join-two");
    let there = shared("round-join");
    write(&one, "from-one.md", "one\n");
    trip(&one, &there);
    write(&two, "from-two.md", "two\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 0, "two unrelated notes were made into a question");
    assert_eq!(read(&two, "from-one.md"), "one\n");
    assert_eq!(read(&two, "from-two.md"), "two\n");
}

/// The same, where both devices already have a note of the same name. Nothing
/// can decide that but a person, and neither version may be lost.
#[test]
fn a_note_both_devices_already_had_becomes_a_question() {
    let one = device("round-join-clash-one");
    let two = device("round-join-clash-two");
    let there = shared("round-join-clash");
    write(&one, "note.md", "written on one\n");
    trip(&one, &there);
    write(&two, "note.md", "written on two\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(read(&two, "note.md"), "written on two\n");
    assert_eq!(
        read(&two, "note (from another device).md"),
        "written on one\n"
    );
}

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
    assert_eq!(read(&two, "note (from another device).md"), "their wording\n");
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

    assert_eq!(read(&two, "good.md"), "ok\n", "the rest of the vault did not land");
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
/// This does not prove the lane: removing it leaves the test passing, because
/// whichever thread merges first leaves the rest with nothing to merge, and
/// the collision needs two of them past the fetch before either commits. The
/// lane is there for that interleaving, which this cannot reliably reach.
#[test]
fn two_syncs_at_once_on_one_vault_do_not_interleave() {
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
                scope.spawn(move || sync(&engine, &key, &vault, &there))
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

fn remote_tip(destination: &str) -> Option<gix::ObjectId> {
    let repo = gix::open(destination).expect("the destination opens");
    repo.try_find_reference("refs/heads/main")
        .expect("the destination's refs are readable")
        .map(|mut found| found.peel_to_id().expect("the ref points at an object").detach())
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
    let blob = hostile.repo.write_blob(b"anything").expect("the blob is written").detach();
    let root = tree_holding(
        &hostile,
        b"note\xff.md".to_vec(),
        gix::object::tree::EntryKind::Blob,
        blob,
    );
    let crafted = commit_of(&hostile, "a name in no encoding", root, &[]);
    push::send(&hostile.repo, &there, BRANCH, crafted).expect("the crafted history is sent");

    let error = once(&victim.repo, &victim.vault, &there).expect_err("an unreadable name is refused");

    assert_eq!(error.code, "sync.note_name_unreadable");
    assert!(files(&victim).is_empty(), "something was written anyway: {:?}", files(&victim));
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

    assert_eq!(read(&two, "note.md"), "what they were typing\n", "someone's typing was lost");
    assert_eq!(read(&two, "note (from another device).md"), "changed elsewhere\n");
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
    let blob = hostile.repo.write_blob(b"escaped").expect("the blob is written").detach();
    let inside = tree_holding(&hostile, "escaped.md", gix::object::tree::EntryKind::Blob, blob);
    let root = tree_holding(&hostile, "..", gix::object::tree::EntryKind::Tree, inside);
    let crafted = commit_of(&hostile, "a folder named to escape", root, &[]);
    push::send(&hostile.repo, &there, BRANCH, crafted).expect("the crafted history is sent");

    let escaped = victim
        .vault
        .parent()
        .expect("the vault has a parent")
        .join("escaped.md");
    let error = once(&victim.repo, &victim.vault, &there).expect_err("a crafted tree is refused");

    assert!(!escaped.exists(), "a note was written outside the folder: {escaped:?}");
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

// ---------------------------------------------------------------------------
// When it cannot happen
// ---------------------------------------------------------------------------

#[test]
fn a_destination_that_is_not_there_leaves_the_vault_alone() {
    let one = device("round-unreachable");
    write(&one, "one.md", "first\n");
    let before = files(&one);

    let error = once(&one.repo, &one.vault, "/nowhere/at/all.git")
        .expect_err("syncing to nothing cannot succeed");

    assert_eq!(files(&one), before, "a failed sync changed the vault");
    assert!(
        error.code.starts_with("sync."),
        "the failure did not name itself: {error:?}"
    );
}

/// A hung remote must not pin the per-workspace lane. The timeout returns,
/// the cancel token is set so the worker can stop, and the next sync on that
/// vault is free to start.
#[test]
fn a_hung_remote_times_out_and_releases_the_lane() {
    let cancel = Arc::new(AtomicBool::new(false));
    let started = Instant::now();
    let watched = Arc::clone(&cancel);
    let error = bounded(Duration::from_millis(80), cancel, move || {
        while !watched.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    })
    .expect_err("a hung remote must time out");

    assert_eq!(error.code, "sync.remote_timeout");
    assert!(
        started.elapsed() < Duration::from_secs(2),
        "the timeout did not return: {:?}",
        started.elapsed()
    );
}

/// Nothing recorded and nothing on the far side is not a fault, and not a
/// reason to write an empty commit — it is a vault nobody has typed in yet.
#[test]
fn syncing_an_empty_vault_to_an_empty_destination_does_nothing() {
    let one = device("round-empty");
    let there = shared("round-empty");

    let synced = trip(&one, &there);

    assert_eq!(synced.brought_down, 0);
    assert_eq!(synced.asked_about, 0);
    assert_eq!(synced.sent, 0);
}
