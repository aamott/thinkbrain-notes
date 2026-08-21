use super::super::test_support;
use super::*;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// One device: a notes folder and the hidden repository that records it.
pub(super) struct Device {
    pub(super) vault: PathBuf,
    pub(super) repo: gix::Repository,
}

pub(super) fn device(name: &str) -> Device {
    let fixture = test_support::repo_fixture(name, "round");
    Device {
        vault: fixture.vault,
        repo: fixture.repo,
    }
}

/// The place both devices sync to.
pub(super) fn shared(name: &str) -> String {
    let path = make_temp_test_dir(&format!("{name}-remote"), "round", true);
    gix::init_bare(&path).expect("the destination is created");
    path.to_string_lossy().into_owned()
}

pub(super) fn write(device: &Device, relative: &str, contents: &str) {
    test_support::write(&device.vault, relative, contents);
    record(device, relative);
}

/// Writes a note without recording it, the way an unsaved edit sits on disk
/// between the moment someone types it and the moment the sweeper notices.
pub(super) fn write_only(device: &Device, relative: &str, contents: &str) {
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

pub(super) fn read(device: &Device, relative: &str) -> String {
    fs::read_to_string(device.vault.join(relative)).expect("the note is on disk")
}

/// One whole round trip, the way the command runs it.
pub(super) fn trip(device: &Device, destination: &str) -> Synced {
    once(&device.repo, &device.vault, destination).expect("the sync succeeds")
}

/// Every file in the vault, so a test can say what a sync did and did not leave.
pub(super) fn files(device: &Device) -> Vec<String> {
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
    assert_eq!(
        synced.brought_down, 0,
        "an empty destination had something to bring down"
    );
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

    assert!(
        !two.vault.join("one.md").exists(),
        "the note is still there"
    );
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
    assert_eq!(
        synced.landed,
        push::Landed::Moved,
        "the merge was not accepted"
    );
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

    assert_eq!(
        merged.landed,
        push::Landed::Moved,
        "the merge was not accepted"
    );

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

    assert_eq!(
        synced.asked_about, 0,
        "a question was asked about separate edits"
    );
    assert_eq!(
        read(&two, "note.md"),
        "top changed\nmiddle\nbottom changed\n"
    );
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
    assert_eq!(
        read(&two, "note.md"),
        "our wording\n",
        "our note was overwritten"
    );
    let copy = "note (from another device).md";
    assert_eq!(
        read(&two, copy),
        "their wording\n",
        "theirs did not arrive beside it"
    );
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

    assert_eq!(
        synced.asked_about, 0,
        "two unrelated notes were made into a question"
    );
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

const KEEP_OR_DELETE: &str = "note (keep or delete).md";

/// They deleted it, we changed it. The changed text stays, and the question
/// is keep-or-delete rather than two versions to compare.
#[test]
fn they_deleted_and_we_changed_is_a_keep_or_delete_decision() {
    let one = device("round-they-del-one");
    let two = device("round-they-del-two");
    let there = shared("round-they-del");
    write(&one, "note.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    remove(&one, "note.md");
    trip(&one, &there);
    write(&two, "note.md", "our later wording\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(read(&two, "note.md"), "our later wording\n");
    assert!(
        two.vault.join(KEEP_OR_DELETE).is_file(),
        "no keep-or-delete marker was written"
    );
    assert!(
        !two.vault.join("note (from another device).md").exists(),
        "a two-version copy was left for a deletion"
    );
}

/// We deleted it, they changed it. Their text is written so it is not lost,
/// and the same keep-or-delete question is asked.
#[test]
fn we_deleted_and_they_changed_materializes_the_changed_note() {
    let one = device("round-we-del-one");
    let two = device("round-we-del-two");
    let there = shared("round-we-del");
    write(&one, "note.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    write(&one, "note.md", "their later wording\n");
    trip(&one, &there);
    remove(&two, "note.md");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(read(&two, "note.md"), "their later wording\n");
    assert!(two.vault.join(KEEP_OR_DELETE).is_file());
}

/// An incoming deletion must not throw away unrecorded text sitting on disk.
#[test]
fn an_incoming_deletion_does_not_remove_unrecorded_local_text() {
    let one = device("round-dirty-del-one");
    let two = device("round-dirty-del-two");
    let there = shared("round-dirty-del");
    write(&one, "note.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    remove(&one, "note.md");
    trip(&one, &there);
    write_only(&two, "note.md", "still typing\n");

    let synced = trip(&two, &there);

    assert_eq!(synced.asked_about, 1);
    assert_eq!(read(&two, "note.md"), "still typing\n");
    assert!(two.vault.join(KEEP_OR_DELETE).is_file());
}

/// The marker is a local decision. Pushing it would hand everyone else a
/// question they were never part of.
#[test]
fn a_keep_or_delete_marker_is_never_sent_on() {
    let one = device("round-del-push-one");
    let two = device("round-del-push-two");
    let three = device("round-del-push-three");
    let there = shared("round-del-push");
    write(&one, "note.md", "shared\n");
    trip(&one, &there);
    trip(&two, &there);

    remove(&one, "note.md");
    trip(&one, &there);
    write(&two, "note.md", "our later wording\n");
    trip(&two, &there);
    trip(&two, &there);
    trip(&three, &there);

    assert!(
        !three.vault.join(KEEP_OR_DELETE).exists(),
        "a third device was handed someone else's keep-or-delete marker"
    );
}

fn plant_entry(
    device: &Device,
    relative: &str,
    kind: gix::object::tree::EntryKind,
    id: gix::ObjectId,
) {
    let parent = snapshot::head_commit(&device.repo).expect("head is readable");
    let base = snapshot::tree_of(&device.repo, parent).expect("the tree is readable");
    let mut editor = device
        .repo
        .edit_tree(base)
        .expect("the tree opens for editing");
    editor
        .upsert(relative, kind, id)
        .expect("the entry is added");
    let tree = editor.write().expect("the tree is written").detach();
    let who = gix::actor::Signature {
        name: "ThinkBrain Notes".into(),
        email: "sync@thinkbrain.notes".into(),
        time: gix::date::Time::now_utc(),
    };
    let commit = device
        .repo
        .write_object(&gix::objs::Commit {
            tree,
            parents: parent.into_iter().collect(),
            author: who.clone(),
            committer: who,
            encoding: None,
            message: "planted an unsupported entry".into(),
            extra_headers: Vec::new(),
        })
        .expect("the commit is written")
        .detach();
    device
        .repo
        .reference(
            snapshot::HISTORY_REF,
            commit,
            gix::refs::transaction::PreviousValue::Any,
            "planted an unsupported entry",
        )
        .expect("the branch moves");
}

fn plant_link(device: &Device, relative: &str, target: &str) {
    let blob = device
        .repo
        .write_blob(target.as_bytes())
        .expect("the target is stored");
    plant_entry(
        device,
        relative,
        gix::object::tree::EntryKind::Link,
        blob.detach(),
    );
}

fn plant_gitlink(device: &Device, relative: &str, commit: gix::ObjectId) {
    plant_entry(
        device,
        relative,
        gix::object::tree::EntryKind::Commit,
        commit,
    );
}

/// A shortcut in the tree is not created here, and a later equal-tip trip
/// still knows it has not landed.
#[test]
fn an_incoming_symlink_is_reported_and_still_reported_on_an_equal_tip() {
    let one = device("round-link-one");
    let two = device("round-link-two");
    let there = shared("round-link");
    write(&one, "kept.md", "stays\n");
    trip(&one, &there);
    plant_link(&one, "shortcut.md", "kept.md");
    trip(&one, &there);

    let first = trip(&two, &there);
    assert_eq!(read(&two, "kept.md"), "stays\n");
    assert!(
        !two.vault.join("shortcut.md").exists(),
        "a shortcut was created on this device"
    );
    assert_eq!(first.skipped.len(), 1);
    assert_eq!(first.skipped[0].code, "sync.symlink_skipped");
    assert_eq!(first.skipped[0].path, "shortcut.md");

    let again = trip(&two, &there);
    assert_eq!(again.skipped.len(), 1);
    assert_eq!(again.skipped[0].code, "sync.symlink_skipped");
}

/// A nested repository is skipped the same way, without breaking other notes.
#[test]
fn an_incoming_gitlink_is_reported_and_other_notes_still_arrive() {
    let one = device("round-gitlink-one");
    let two = device("round-gitlink-two");
    let elsewhere = device("round-gitlink-other");
    let there = shared("round-gitlink");
    write(&one, "kept.md", "stays\n");
    trip(&one, &there);
    write(&elsewhere, "foreign.md", "not ours\n");
    let foreign = snapshot::head_commit(&elsewhere.repo)
        .expect("readable")
        .expect("a commit");
    plant_gitlink(&one, "nested", foreign);
    write(&one, "later.md", "also arrives\n");
    trip(&one, &there);

    let synced = trip(&two, &there);
    assert_eq!(read(&two, "kept.md"), "stays\n");
    assert_eq!(read(&two, "later.md"), "also arrives\n");
    assert!(!two.vault.join("nested").exists());
    assert!(synced
        .skipped
        .iter()
        .any(|note| note.code == "sync.submodule_skipped" && note.path == "nested"));
}

/// Leaving the unsupported entry in the tree means this device does not
/// broadcast a deletion of it.
#[test]
fn a_skipped_symlink_is_not_pushed_as_a_deletion() {
    let one = device("round-link-push-one");
    let two = device("round-link-push-two");
    let three = device("round-link-push-three");
    let there = shared("round-link-push");
    write(&one, "kept.md", "stays\n");
    trip(&one, &there);
    plant_link(&one, "shortcut.md", "kept.md");
    trip(&one, &there);
    trip(&two, &there);
    write(&two, "from-two.md", "two\n");
    trip(&two, &there);
    trip(&three, &there);

    assert_eq!(read(&three, "kept.md"), "stays\n");
    assert_eq!(read(&three, "from-two.md"), "two\n");
    assert!(
        three
            .repo
            .head_commit()
            .expect("head")
            .tree()
            .expect("tree")
            .lookup_entry_by_path("shortcut.md")
            .expect("lookup")
            .is_some(),
        "the shortcut was dropped from history as if this device deleted it"
    );
    assert!(!three.vault.join("shortcut.md").exists());
}
