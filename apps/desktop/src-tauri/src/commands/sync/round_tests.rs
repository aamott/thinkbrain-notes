use super::super::hidden_repo;
use super::*;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;

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

fn sync(device: &Device, destination: &str) -> Synced {
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

    let synced = sync(&one, &there);

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
    sync(&one, &there);

    let synced = sync(&two, &there);

    assert_eq!(synced.brought_down, 1);
    assert_eq!(read(&two, "one.md"), "first\n");
}

#[test]
fn each_device_ends_up_with_what_the_other_wrote() {
    let one = device("round-converge-one");
    let two = device("round-converge-two");
    let there = shared("round-converge");
    write(&one, "from-one.md", "one\n");
    sync(&one, &there);
    sync(&two, &there);

    write(&two, "from-two.md", "two\n");
    sync(&two, &there);
    sync(&one, &there);

    assert_eq!(read(&one, "from-two.md"), "two\n");
    assert_eq!(read(&two, "from-one.md"), "one\n");
}

#[test]
fn a_note_deleted_on_one_device_goes_away_on_the_other() {
    let one = device("round-delete-one");
    let two = device("round-delete-two");
    let there = shared("round-delete");
    write(&one, "one.md", "first\n");
    sync(&one, &there);
    sync(&two, &there);

    remove(&one, "one.md");
    sync(&one, &there);
    sync(&two, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "mine.md", "mine\n");
    sync(&one, &there);
    write(&two, "theirs.md", "theirs\n");

    let synced = sync(&two, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "mine.md", "mine\n");
    sync(&one, &there);
    write(&two, "theirs.md", "theirs\n");
    let merged = sync(&two, &there);

    assert_eq!(merged.landed, push::Landed::Moved, "the merge was not accepted");

    sync(&three, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "note.md", "top changed\nmiddle\nbottom\n");
    sync(&one, &there);
    write(&two, "note.md", "top\nmiddle\nbottom changed\n");

    let synced = sync(&two, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "note.md", "their wording\n");
    sync(&one, &there);
    write(&two, "note.md", "our wording\n");

    let synced = sync(&two, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "note.md", "their wording\n");
    sync(&one, &there);
    write(&two, "note.md", "our wording\n");
    sync(&two, &there);

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
    sync(&one, &there);
    sync(&two, &there);

    write(&one, "note.md", "their wording\n");
    sync(&one, &there);
    write(&two, "note.md", "our wording\n");
    sync(&two, &there);
    sync(&two, &there);

    sync(&three, &there);

    assert!(
        !three.vault.join("note (from another device).md").exists(),
        "a third device was handed someone else's conflict"
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

/// Nothing recorded and nothing on the far side is not a fault, and not a
/// reason to write an empty commit — it is a vault nobody has typed in yet.
#[test]
fn syncing_an_empty_vault_to_an_empty_destination_does_nothing() {
    let one = device("round-empty");
    let there = shared("round-empty");

    let synced = sync(&one, &there);

    assert_eq!(synced.brought_down, 0);
    assert_eq!(synced.asked_about, 0);
    assert_eq!(synced.sent, 0);
}
